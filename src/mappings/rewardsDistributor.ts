// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import { Delegation, IndexerReward, Reward, UnclaimedReward } from '../types';
import { RewardsDistributer__factory } from '@subql/contract-sdk';
import FrontierEthProvider from './ethProvider';
import {
  ClaimRewardsEvent,
  DistributeRewardsEvent,
  RewardsChangedEvent,
} from '@subql/contract-sdk/typechain/RewardsDistributer';
import { REWARD_DIST_ADDRESS } from './utils';
import { FrontierEvmEvent } from '@subql/contract-processors/dist/frontierEvm';
import { BigNumber } from '@ethersproject/bignumber';

function buildRewardId(indexer: string, delegator: string): string {
  return `${indexer}:${delegator}`;
}

function getIndexerRewardId(indexer: string, eraIdx: BigNumber): string {
  return `${indexer}:${eraIdx.toHexString()}`;
}

function getPrevIndexerRewardId(indexer: string, eraIdx: BigNumber): string {
  return getIndexerRewardId(indexer, eraIdx.sub(1));
}

export async function handleRewardsDistributed(
  event: FrontierEvmEvent<DistributeRewardsEvent['args']>
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
  event: FrontierEvmEvent<ClaimRewardsEvent['args']>
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

export async function handleRewardsUpdated(
  event: FrontierEvmEvent<RewardsChangedEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const { indexer, eraIdx, additions, removals } = event.args;
  const id = getIndexerRewardId(indexer, eraIdx);

  const prevEraRewards = await IndexerReward.get(
    getPrevIndexerRewardId(indexer, eraIdx)
  );
  const prevAmount = prevEraRewards?.amount ?? BigInt(0);

  let eraRewards = await IndexerReward.get(id);

  if (!eraRewards) {
    eraRewards = IndexerReward.create({
      id,
      indexerAddress: indexer,
      indexerId: indexer,
      eraId: eraIdx.toHexString(),
      eraIdx: eraIdx.toHexString(),
      additions: additions.toBigInt(),
      removals: removals.toBigInt(),

      amount: prevAmount + additions.toBigInt() - removals.toBigInt(),
    });
  } else {
    const additionsDiff = additions.toBigInt() - eraRewards.additions;
    const removalsDiff = removals.toBigInt() - eraRewards.removals;

    eraRewards.amount = eraRewards.amount + additionsDiff - removalsDiff;

    eraRewards.additions = additions.toBigInt();
    eraRewards.removals = removals.toBigInt();
  }

  await eraRewards.save();

  /* Rewards changed events don't come in in order and may not be the latest set era */
  await reapplyRewardAmount(indexer, eraIdx.add(1), eraRewards);
}

/* Recalculates reward amounts for later eras */
async function reapplyRewardAmount(
  indexer: string,
  eraIdx: BigNumber,
  prevEraRewards: Readonly<IndexerReward>
): Promise<void> {
  const id = getIndexerRewardId(indexer, eraIdx);
  const eraRewards = await IndexerReward.get(id);

  // Theres no future eras with rewards
  if (!eraRewards) return;

  eraRewards.amount =
    prevEraRewards.amount + eraRewards.additions - eraRewards.removals;

  await eraRewards.save();

  return reapplyRewardAmount(indexer, eraIdx.add(1), eraRewards);
}
