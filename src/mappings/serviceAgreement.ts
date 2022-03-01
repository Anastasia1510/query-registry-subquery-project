// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import { MoonbeamEvent } from "@subql/contract-processors/dist/moonbeam";
import { ServiceAgreementCreatedEvent } from "@subql/contract-sdk/typechain/ServiceAgreementRegistry";
import { ServiceAgreement } from '../types';
import { bytesToIpfsCid } from './utils';
import { IServiceAgreement__factory } from '@subql/contract-sdk';
import FrontierEthProvider from './ethProvider';

export async function handleServiceAgreementCreated(
  event: MoonbeamEvent<ServiceAgreementCreatedEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const saContract = IServiceAgreement__factory.connect(
    event.args.serviceAgreement,
    new FrontierEthProvider()
  );

  const [deploymentId/*, period*/] = await Promise.all([
    saContract.deploymentId(),
    // saContract.period(),
  ]);

  const sa = ServiceAgreement.create({
    id: event.args.serviceAgreement,
    indexerAddress: event.args.indexer,
    consumerAddress: event.args.consumer,
    // deploymentId: bytesToIpfsCid(event.args.deploymentId) // TODO use with updated contract
    deploymentId: bytesToIpfsCid(deploymentId),
    // period: period.toBigInt(), // TODO use with updated contract
  });

  await sa.save();
}
