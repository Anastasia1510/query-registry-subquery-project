// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import { DeploymentIndexer, Deployment, Project, Status } from '../types';

import {
  CreateQueryEvent,
  StartIndexingEvent,
  UpdateDeploymentStatusEvent,
  StopIndexingEvent,
  UpdateQueryMetadataEvent,
  UpdateQueryDeploymentEvent,
  UpdateIndexingStatusToReadyEvent,
} from '@subql/contract-sdk/typechain/QueryRegistry';
import { bnToDate, bytesToIpfsCid } from './utils';
import { FrontierEvmEvent } from '@subql/contract-processors/dist/frontierEvm';

function getDeploymentIndexerId(indexer: string, deploymentId: string): string {
  return `${indexer}:${deploymentId}`;
}

export async function handleNewQuery(
  event: FrontierEvmEvent<CreateQueryEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const projectId = event.args.queryId.toHexString();
  const deploymentId = bytesToIpfsCid(event.args.deploymentId);
  const currentVersion = bytesToIpfsCid(event.args.version);

  const project = Project.create({
    id: projectId,
    owner: event.args.creator,
    metadata: bytesToIpfsCid(event.args.metadata),
    currentDeployment: deploymentId,
    currentVersion,
    updatedTimestamp: event.blockTimestamp,
    createdTimestamp: event.blockTimestamp,
  });

  await project.save();

  const deployment = Deployment.create({
    id: deploymentId,
    version: currentVersion,
    createdTimestamp: event.blockTimestamp,
    projectId,
  });

  await deployment.save();
}

export async function handleUpdateQueryMetadata(
  event: FrontierEvmEvent<UpdateQueryMetadataEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');
  const queryId = event.args.queryId.toHexString();
  const project = await Project.get(queryId);

  assert(project, `Expected query (${queryId}) to exist`);

  project.metadata = bytesToIpfsCid(event.args.metadata);
  project.updatedTimestamp = event.blockTimestamp;

  await project.save();
}

export async function handleUpdateQueryDeployment(
  event: FrontierEvmEvent<UpdateQueryDeploymentEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');
  const projectId = event.args.queryId.toHexString();
  const deploymentId = bytesToIpfsCid(event.args.deploymentId);
  const version = bytesToIpfsCid(event.args.version);

  const deployment = Deployment.create({
    id: deploymentId,
    version,
    createdTimestamp: event.blockTimestamp,
    projectId,
  });

  await deployment.save();

  const project = await Project.get(projectId);

  assert(project, `Expected query (${projectId}) to exist`);

  project.currentDeployment = deploymentId;
  project.currentVersion = version;
  project.updatedTimestamp = event.blockTimestamp;

  await project.save();
}

export async function handleStartIndexing(
  event: FrontierEvmEvent<StartIndexingEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');
  const deploymentId = bytesToIpfsCid(event.args.deploymentId);
  const indexer = DeploymentIndexer.create({
    id: getDeploymentIndexerId(event.args.indexer, deploymentId),
    indexerAddress: event.args.indexer,
    indexerId: event.args.indexer,
    deploymentId: deploymentId,
    blockHeight: BigInt(0),
    status: Status.INDEXING,
  });
  await indexer.save();
}

export async function handleIndexingUpdate(
  event: FrontierEvmEvent<UpdateDeploymentStatusEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');
  const deploymentId = bytesToIpfsCid(event.args.deploymentId);
  const id = getDeploymentIndexerId(event.args.indexer, deploymentId);
  const indexer = await DeploymentIndexer.get(id);

  assert(indexer, `Expected deployment indexer (${id}) to exist`);
  indexer.blockHeight = event.args.blockheight.toBigInt();
  indexer.mmrRoot = event.args.mmrRoot;
  indexer.timestamp = bnToDate(event.args.timestamp);
  await indexer.save();
}

export async function handleIndexingReady(
  event: FrontierEvmEvent<UpdateIndexingStatusToReadyEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');
  const deploymentId = bytesToIpfsCid(event.args.deploymentId);
  const id = getDeploymentIndexerId(event.args.indexer, deploymentId);
  const indexer = await DeploymentIndexer.get(id);

  assert(indexer, `Expected deployment indexer (${id}) to exist`);
  indexer.status = Status.READY;
  indexer.timestamp = event.blockTimestamp;
  await indexer.save();
}

export async function handleStopIndexing(
  event: FrontierEvmEvent<StopIndexingEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');
  const deploymentId = bytesToIpfsCid(event.args.deploymentId);
  const id = getDeploymentIndexerId(event.args.indexer, deploymentId);
  const indexer = await DeploymentIndexer.get(id);

  assert(indexer, `Expected deployment indexer (${id}) to exist`);
  indexer.status = Status.TERMINATED;
  await indexer.save();

  // TODO remove indexer instead?
}
