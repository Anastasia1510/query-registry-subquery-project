// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import { MoonbeamEvent } from "@subql/contract-processors/dist/moonbeam";
import { Delegation, Reward } from '../types';
import { RewardsDistributer__factory } from '@subql/contract-sdk';
import FrontierEthProvider from './ethProvider';
import { ClaimRewardsEvent, DistributeRewardsEvent } from '@subql/contract-sdk/typechain/RewardsDistributer';

function buildRewardId(indexer: string, delegator: string): string {
  return `${indexer}:${delegator}`;
}

export async function handleRewardsDistributed(event: MoonbeamEvent<DistributeRewardsEvent['args']>): Promise<void> {
  assert(event.args, 'No event args');

  const { indexer } = event.args;
  const delegators = await Delegation.getByIndexerId(indexer);
  if (!delegators) return;


  const rewardsDistributor = RewardsDistributer__factory.connect('', new FrontierEthProvider());

  Promise.all(delegators.map(async delegator => {

    const rewards = await rewardsDistributor.userRewards(indexer, delegator.id);
    const id = buildRewardId(indexer, delegator.id);

    let reward = await Reward.get(id);

    if (!reward) {
      reward = Reward.create({
        id,
        delegatorAddress: delegator.id,
        indexerAddress: indexer,
        amount: rewards.toBigInt(),
      });
    }

    await reward.save();
  }));
}

export async function handleRewardsClaimed(event: MoonbeamEvent<ClaimRewardsEvent['args']>): Promise<void> {
  assert(event.args, 'No event args');

  const id = buildRewardId(event.args.indexer, event.args.delegator);

  await Reward.remove(id);
}

