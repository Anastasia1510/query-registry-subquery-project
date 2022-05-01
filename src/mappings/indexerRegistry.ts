// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { FrontierEvmEvent } from '@subql/contract-processors/dist/frontierEvm';
import {
  EraManager__factory,
  QueryRegistry__factory,
} from '@subql/contract-sdk';
import {
  RegisterIndexerEvent,
  RemoveControllerAccountEvent,
  SetControllerAccountEvent,
  UnregisterIndexerEvent,
  UpdateMetadataEvent,
} from '@subql/contract-sdk/typechain/IndexerRegistry';
import assert from 'assert';
import { DeploymentIndexer, Indexer } from '../types';
import FrontierEthProvider from './ethProvider';
import { bytesToIpfsCid, upsertEraValue, ERA_MANAGER_ADDRESS } from './utils';

/* Indexer Registry Handlers */
export async function handleRegisterIndexer(
  event: FrontierEvmEvent<RegisterIndexerEvent['args']>
): Promise<void> {
  logger.info('handleRegisterIndexer');
  assert(event.args, 'No event args');
  const { indexer: indexerAddress, metadata } = event.args;

  let indexer = await Indexer.get(indexerAddress);
  const eraManager = EraManager__factory.connect(
    ERA_MANAGER_ADDRESS,
    new FrontierEthProvider()
  );

  assert(!indexer, `Indexer (${indexerAddress}) already exists`);

  /* WARNING, other events are emitted before this handler (AddDelegation, SetCommissionRate),
   * their handlers are used to set their relevant values.
   */

  indexer = Indexer.create({
    id: indexerAddress,
    metadata: bytesToIpfsCid(metadata),
    totalStake: await upsertEraValue(eraManager, undefined, BigInt(0)),
    // Set era to -1 as indicator to apply instantly in handleSectCommissionRate
    commission: {
      era: -1,
      value: BigInt(0).toJSONType(),
      valueAfter: BigInt(0).toJSONType(),
    }, //await upsertEraValue(eraManager, undefined, BigInt(0)),
  });

  await indexer.save();
}

export async function handleUnregisterIndexer(
  event: FrontierEvmEvent<UnregisterIndexerEvent['args']>
): Promise<void> {
  logger.info('handleUnregisterIndexer');
  assert(event.args, 'No event args');

  // Remove indexerDeployments relationship
  const deployments = await DeploymentIndexer.getByIndexerId(
    event.args.indexer
  );
  await Promise.all(
    (deployments ?? []).map((deployment) =>
      DeploymentIndexer.remove(deployment.id)
    )
  );

  // TODO does this take effect next era?
  await Indexer.remove(event.args.indexer);
}

export async function handleUpdateIndexerMetadata(
  event: FrontierEvmEvent<UpdateMetadataEvent['args']>
): Promise<void> {
  logger.info('handleUpdateIndexerMetadata');
  assert(event.args, 'No event args');
  const address = event.args.indexer;

  const indexer = await Indexer.get(address);
  assert(indexer, `Expected indexer (${address}) to exist`);

  indexer.metadata = bytesToIpfsCid(event.args.metadata);
  await indexer.save();
}

export async function handleSetControllerAccount(
  event: FrontierEvmEvent<SetControllerAccountEvent['args']>
): Promise<void> {
  logger.info('handleSetControllerAccount');
  assert(event.args, 'No event args');
  const address = event.args.indexer;

  const indexer = await Indexer.get(address);
  assert(indexer, `Expected indexer (${address}) to exist`);

  indexer.controller = event.args.controller;

  await indexer.save();
}

export async function handleRemoveControllerAccount(
  event: FrontierEvmEvent<RemoveControllerAccountEvent['args']>
): Promise<void> {
  logger.info('handleRemoveControllerAccount');
  assert(event.args, 'No event args');
  const address = event.args.indexer;

  const indexer = await Indexer.get(address);
  assert(indexer, `Expected indexer (${address}) to exist`);

  delete indexer.controller;

  await indexer.save();
}
