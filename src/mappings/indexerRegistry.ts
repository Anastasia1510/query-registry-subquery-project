// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {
  FrontierEvmEvent,
  FrontierEthProvider,
} from '@subql/frontier-evm-processor';
import { EraManager__factory } from '@subql/contract-sdk';
import {
  RegisterIndexerEvent,
  RemoveControllerAccountEvent,
  SetControllerAccountEvent,
  UnregisterIndexerEvent,
  UpdateMetadataEvent,
} from '@subql/contract-sdk/typechain/IndexerRegistry';
import assert from 'assert';
import { Indexer } from '../types';
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

  // assert(!indexer, `Indexer (${indexerAddress}) already exists`);

  if (indexer) {
    indexer.metadata = bytesToIpfsCid(metadata);
    indexer.active = true;
  } else {
    // Should not occurr. AddDelegation, SetCommissionRate events should happen first
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
      active: true,
    });
  }

  /* WARNING, other events are emitted before this handler (AddDelegation, SetCommissionRate),
   * their handlers are used to set their relevant values.
   */

  await indexer.save();
}

export async function handleUnregisterIndexer(
  event: FrontierEvmEvent<UnregisterIndexerEvent['args']>
): Promise<void> {
  logger.info('handleUnregisterIndexer');
  assert(event.args, 'No event args');

  const indexer = await Indexer.get(event.args.indexer);
  assert(indexer, `Expected indexer to exist: ${event.args.indexer}`);

  indexer.active = false;
  await indexer.save();
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
