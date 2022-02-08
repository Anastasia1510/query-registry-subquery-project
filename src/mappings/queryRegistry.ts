// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'assert';
import { MoonbeamEvent } from '@subql/contract-processors/dist/moonbeam';
import { DeploymentIndexer, Deployment, Project, Status } from '../types';

import {
    CreateQueryEvent,
    StartIndexingEvent,
    UpdateDeploymentStatusEvent,
    StopIndexingEvent,
    UpdateQueryMetadataEvent,
    UpdateQueryDeploymentEvent,
    UpdateIndexingStatusToReadyEvent
} from '@subql/contract-sdk/typechain/QueryRegistry';
import { ProjectDeployment } from '../types/models/ProjectDeployment';
import { bnToDate, bytesToIpfsCid } from './utils';

function getDeploymentIndexerId(indexer: string, deploymentId: string): string {
    return `${indexer}:${deploymentId}`;
}

export async function handleNewQuery(event: MoonbeamEvent<CreateQueryEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const projectId = event.args.queryId.toHexString();
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const currentVersion = bytesToIpfsCid(event.args.version);

    const projectDeployment = ProjectDeployment.create({
        id: `${projectId}-${deploymentId}`,
        projectId: projectId,
        deploymentId,
    });

    let deployment = await Deployment.get(deploymentId);

    if (!deployment) {
        deployment = Deployment.create({
            id: deploymentId,
            version: currentVersion,
            createdTimestamp: event.blockTimestamp,
        });

        await deployment.save();
    }

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
    await projectDeployment.save();
}

export async function handleUpdateQueryMetadata(event: MoonbeamEvent<UpdateQueryMetadataEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const queryId = event.args.queryId.toHexString();
    const project = await Project.get(queryId);

    assert(project, `Expected query (${queryId}) to exist`);

    project.metadata = bytesToIpfsCid(event.args.metadata);
    project.updatedTimestamp = event.blockTimestamp;

    await project.save();
}

export async function handleUpdateQueryDeployment(event: MoonbeamEvent<UpdateQueryDeploymentEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const queryId = event.args.queryId.toHexString();
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const version = bytesToIpfsCid(event.args.version);
    const projectDeploymentId = `${queryId}-${deploymentId}`;

    let deployment = await Deployment.get(deploymentId);
    if (!deployment) {
        deployment = Deployment.create({
            id: deploymentId,
            version,
            createdTimestamp: event.blockTimestamp,
        });

        await deployment.save();
    }

    let projectDeployment = await ProjectDeployment.get(projectDeploymentId);
    if (!projectDeployment) {
        projectDeployment = ProjectDeployment.create({
            id: projectDeploymentId,
            projectId: queryId,
            deploymentId,
        });

        await projectDeployment.save();
    }

    const project = await Project.get(queryId);

    assert(project, `Expected query (${queryId}) to exist`);

    project.currentDeployment = deploymentId;
    project.currentVersion = version;
    project.updatedTimestamp = event.blockTimestamp;

    await project.save();
}

export async function handleStartIndexing(event: MoonbeamEvent<StartIndexingEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const indexer = DeploymentIndexer.create({
        id: `${event.args.indexer}-${deploymentId}`,
        indexerAddress: event.args.indexer,
        indexerId: event.args.indexer,
        deploymentId: deploymentId,
        blockHeight: BigInt(0),
        status: Status.INDEXING,
    });
    await indexer.save();
}

export async function handleIndexingUpdate(event: MoonbeamEvent<UpdateDeploymentStatusEvent['args']>): Promise<void> {
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

export async function handleIndexingReady(event: MoonbeamEvent<UpdateIndexingStatusToReadyEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const id = getDeploymentIndexerId(event.args.indexer, deploymentId);
    const indexer = await DeploymentIndexer.get(id);

    assert(indexer, `Expected deployment indexer (${id}) to exist`);
    indexer.status = Status.READY;
    indexer.timestamp = event.blockTimestamp;
    await indexer.save();
}

export async function handleStopIndexing(event: MoonbeamEvent<StopIndexingEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const id = getDeploymentIndexerId(event.args.indexer, deploymentId);
    const indexer = await DeploymentIndexer.get(id);

    assert(indexer, `Expected deployment indexer (${id}) to exist`);
    indexer.status = Status.TERMINATED;
    await indexer.save();

    // TODO remove indexer instead?
}
