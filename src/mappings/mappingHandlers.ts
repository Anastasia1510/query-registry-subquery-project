// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { MoonbeamCall, MoonbeamEvent } from '@subql/contract-processors/dist/moonbeam';
import { BigNumber } from 'ethers';
import { Deployment, Indexer, Project } from '../types';
import bs58 from 'bs58';

import {
    CreateQueryEvent,
    StartIndexingEvent,
    UpdateDeploymentStatusEvent,
    StopIndexingEvent,
    UpdateQueryEvent,
} from '../types/QueryRegistry'; // TODO import this from @subql/contracts when that is updated

type UpdateQueryCall = [BigNumber, string, string, string] & { queryId: BigNumber; version: string; deploymentId: string; metadata: string; };

type DeploymentStatus = 'notindexing' | 'indexing' | 'ready' | 'terminated';

function parseStatus(status: number): DeploymentStatus {
    switch(status) {
        default:
        case 0:
            return 'notindexing';
        case 1:
            return 'indexing';
        case 2:
            return 'ready';
        case 3:
            return 'terminated';
    }
}

function bytesToIpfsCid(raw: string): string {
    // Add our default ipfs values for first 2 bytes:
    // function:0x12=sha2, size:0x20=256 bits
    // and cut off leading "0x"
    const hashHex = "1220" + raw.slice(2);
    const hashBytes = Buffer.from(hashHex, 'hex');
    return bs58.encode(hashBytes);
}

export async function handleNewQuery(event: MoonbeamEvent<CreateQueryEvent['args']>): Promise<void> {
    const project = Project.create({
        id: event.args.queryId.toHexString(),
        owner: event.args.creator,
        metadata: bytesToIpfsCid(event.args.metadata),
        deploymentsId: [],
    });

    await project.save();
}

export async function handleUpdateQuery(call: MoonbeamCall<UpdateQueryCall>): Promise<void> {
    // TODO need to check that the tx was successful

    const deploymentId = bytesToIpfsCid(call.args.deploymentId);
    const version = bytesToIpfsCid(call.args.version);

    let deployment = await Deployment.get(deploymentId);

    if (!deployment) {
        deployment = Deployment.create({
            id: deploymentId,
            version,
            indexersId: [],
        });

        deployment.save();
    }

    const project = await Project.get(call.args.queryId.toHexString());

    project.currentDeploymentId = deploymentId;
    project.currentVersion = version;
    project.metadata = bytesToIpfsCid(call.args.metadata);
    project.deploymentsId.push(deploymentId);

    await project.save();
}

export async function handleStartIndexing(event: MoonbeamEvent<StartIndexingEvent['args']>): Promise<void> {
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const indexer = Indexer.create({
        id: `${event.args.indexer}-${deploymentId}`,
        indexer: event.args.indexer,
        deploymentId: deploymentId,
        blockHeight: BigInt(0),
        status: 'indexing',
    });
    await indexer.save();

    const deployment = await Deployment.get(deploymentId);
    deployment.indexersId.push(indexer.id);
    await deployment.save();
}

export async function handleIndexingUpdate(event: MoonbeamEvent<UpdateDeploymentStatusEvent['args']>): Promise<void> {
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const indexer = await Indexer.get(`${event.args.indexer}-${deploymentId}`);
    indexer.blockHeight = event.args.blockheight.toBigInt();
    indexer.status = parseStatus(event.args.status);
    indexer.mmrRoot = event.args.mmrRoot;
    await indexer.save();
}

export async function handleStopIndexing(event: MoonbeamEvent<StopIndexingEvent['args']>): Promise<void> {
    const deploymentId = bytesToIpfsCid(event.args.deploymentId);
    const indexer = await Indexer.get(`${event.args.indexer}-${deploymentId}`);
    indexer.status = 'terminated';
    await indexer.save();

    // TODO remove reference in deployment?
}
