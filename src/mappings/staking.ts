// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { MoonbeamEvent } from '@subql/contract-processors/dist/moonbeam';
import { EraManager__factory } from '@subql/contract-sdk';
import {
    DelegationAddedEvent,
    DelegationRemovedEvent,
    UnbondRequestedEvent,
    UnbondWithdrawnEvent,
} from '@subql/contract-sdk/typechain/Staking';
import assert from 'assert';
import { Delegation, Withdrawl } from '../types';
import FrontierEthProvider from './ethProvider';
import { updateTotalStake, upsertEraValue } from './utils';
import {BigNumber} from '@ethersproject/bignumber';

function getDelegationId(delegator: string, indexer: string): string {
    return `${delegator}:${indexer}`;
}

function getWithdrawlId(delegator: string, index: BigNumber): string {
    return `${delegator}:${index.toHexString()}`;
}

/* Staking Handlers */
export async function handleAddDelegation(event: MoonbeamEvent<DelegationAddedEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const { source, indexer, amount } = event.args;
    const id = getDelegationId(source, indexer);
    const eraManager = EraManager__factory.connect(event.address, new FrontierEthProvider());

    let delegation = await Delegation.get(id);

    if (!delegation) {
        delegation = Delegation.create({
            id,
            delegatorAddress: source,
            indexerAddress: indexer,
            indexerId: indexer,
            amount: await upsertEraValue(eraManager, undefined, BigInt(0)),
        });
    } else {
        delegation.amount = await upsertEraValue(eraManager, delegation.amount, amount.toBigInt());
    }

    updateTotalStake(eraManager, indexer, amount.toBigInt(), 'add');

    await delegation.save();
}

export async function handleRemoveNomination(event: MoonbeamEvent<DelegationRemovedEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const { source, indexer, amount } = event.args;
    const id = getDelegationId(source, indexer);
    const eraManager = EraManager__factory.connect(event.address, new FrontierEthProvider());

    const delegation = await Delegation.get(id);
    assert(delegation, `Expected delegation (${id}) to exist`);

    delegation.amount = await upsertEraValue(eraManager, delegation.amount, amount.toBigInt(), 'sub');

    updateTotalStake(eraManager, indexer, amount.toBigInt(), 'sub');

    await delegation.save();
}

/* TODO wait for new contracts */
export async function handleWithdrawRequested(event: MoonbeamEvent<UnbondRequestedEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const { source, indexer, index, amount } = event.args;
    const id = getWithdrawlId(source, index);

    const withdrawl = Withdrawl.create({
        id,
        delegator: source,
        indexer,
        index: index.toBigInt(),
        startTime: event.blockTimestamp,
        amount: amount.toBigInt(),
        claimed: false,
    });

    await withdrawl.save();
}

export async function handleWithdrawClaimed(event: MoonbeamEvent<UnbondWithdrawnEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const { source, index } = event.args;
    const id = getWithdrawlId(source, index);

    const withdrawl = await Withdrawl.get(id);
    assert(withdrawl, `Expected withdrawl (${id}) to exist`);

    withdrawl.claimed = true;

    await withdrawl.save();
}

