// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import { MoonbeamEvent } from '@subql/contract-processors/dist/moonbeam';
import { Delegation, Reward, UnclaimedReward } from '../types';
import { RewardsDistributer__factory } from '@subql/contract-sdk';
import FrontierEthProvider from './ethProvider';
import {
  ClaimRewardsEvent,
  DistributeRewardsEvent,
} from '@subql/contract-sdk/typechain/RewardsDistributer';
import { REWARD_DIST_ADDRESS } from './utils';

function buildRewardId(indexer: string, delegator: string): string {
  return `${indexer}:${delegator}`;
}

export async function handleRewardsDistributed(
  event: MoonbeamEvent<DistributeRewardsEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const { indexer } = event.args;
  const delegators = await Delegation.getByIndexerId(indexer);
  if (!delegators) return;

  const rewardsDistributor = RewardsDistributer__factory.connect(
    REWARD_DIST_ADDRESS,
    new FrontierEthProvider()
  );

  await Promise.all(
    delegators.map(async (delegator) => {
      const rewards = await rewardsDistributor.userRewards(
        indexer,
        delegator.id
      );
      const id = buildRewardId(indexer, delegator.id);

      let reward = await UnclaimedReward.get(id);

      if (!reward) {
        reward = UnclaimedReward.create({
          id,
          delegatorAddress: delegator.id,
          indexerAddress: indexer,
          amount: rewards.toBigInt(),
        });
      }

      await reward.save();
    })
  );
}

export async function handleRewardsClaimed(
  event: MoonbeamEvent<ClaimRewardsEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const id = buildRewardId(event.args.indexer, event.args.delegator);

  await UnclaimedReward.remove(id);

  const reward = Reward.create({
    id: `${id}:${event.transactionHash}`,
    indexerAddress: event.args.indexer,
    delegatorAddress: event.args.delegator,
    amount: event.args.rewards.toBigInt(),
    claimedTime: event.blockTimestamp,
  });

  await reward.save();
}
