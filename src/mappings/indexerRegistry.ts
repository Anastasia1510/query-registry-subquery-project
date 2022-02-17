// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { MoonbeamEvent } from '@subql/contract-processors/dist/moonbeam';
import { EraManager__factory } from '@subql/contract-sdk';
import { RegisterIndexerEvent, RemoveControllerAccountEvent, SetCommissionRateEvent, SetControllerAccountEvent, UnregisterIndexerEvent, UpdateMetadataEvent } from '@subql/contract-sdk/typechain/IndexerRegistry';
import assert from 'assert';
import { Indexer } from '../types';
import FrontierEthProvider from './ethProvider';
import { bytesToIpfsCid, upsertEraValue, ERA_MANAGER_ADDRESS } from './utils';

/* Indexer Registry Handlers */
export async function handleRegisterIndexer(event: MoonbeamEvent<RegisterIndexerEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const { indexer: indexerAddress, metadata } = event.args;

    let indexer = await Indexer.get(indexerAddress);
    const eraManager = EraManager__factory.connect(ERA_MANAGER_ADDRESS, new FrontierEthProvider());

    /* WARNING, other events are emitted before this handler (AddNomination, SetCommissionRate),
     * their handlers are used to set their relevant values.
    */
    if (!indexer) {
        indexer = Indexer.create({
            id: indexerAddress,
            metadata: bytesToIpfsCid(metadata),
            totalStake: await upsertEraValue(eraManager, undefined, BigInt(0)),
            commission: await upsertEraValue(eraManager, undefined, BigInt(0)),
        });
    } else {
        indexer.totalStake = await upsertEraValue(eraManager, indexer.totalStake, BigInt(0));
        indexer.commission = await upsertEraValue(eraManager, indexer.commission, BigInt(0));
    }

    await indexer.save();
}

export async function handleUnregisterIndexer(event: MoonbeamEvent<UnregisterIndexerEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    // TODO does this take effect next era?
    await Indexer.remove(event.args.indexer);
}

export async function handleUpdateIndexerMetadata(event: MoonbeamEvent<UpdateMetadataEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const address = event.args.indexer;

    const indexer = await Indexer.get(address);
    assert(indexer, `Expected indexer (${address}) to exist`);

    indexer.metadata = bytesToIpfsCid(event.args.metadata);
    await indexer.save();
}

export async function handleSetControllerAccount(event: MoonbeamEvent<SetControllerAccountEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const address = event.args.indexer;

    const indexer = await Indexer.get(address);
    assert(indexer, `Expected indexer (${address}) to exist`);

    indexer.controller = event.args.controller;

    await indexer.save();
}

export async function handleRemoveControllerAccount(event: MoonbeamEvent<RemoveControllerAccountEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const address = event.args.indexer;

    const indexer = await Indexer.get(address);
    assert(indexer, `Expected indexer (${address}) to exist`);

    delete indexer.controller;

    await indexer.save();
}

export async function handleSetCommissionRate(event: MoonbeamEvent<SetCommissionRateEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const address = event.args.indexer;
    const eraManager = EraManager__factory.connect(ERA_MANAGER_ADDRESS, new FrontierEthProvider());

    const indexer = await Indexer.get(address);
    assert(indexer, `Expected indexer (${address}) to exist`);

    indexer.commission = await upsertEraValue(
        eraManager,
        indexer.commission,
        event.args.amount.toBigInt(),
        'replace'
    );

    await indexer.save();
}
