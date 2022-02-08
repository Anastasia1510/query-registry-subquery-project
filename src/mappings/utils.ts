import bs58 from 'bs58';
import {BigNumber} from '@ethersproject/bignumber';
import { EraManager } from '@subql/contract-sdk';
import { Indexer, EraValue } from '../types';

export function bytesToIpfsCid(raw: string): string {
    // Add our default ipfs values for first 2 bytes:
    // function:0x12=sha2, size:0x20=256 bits
    // and cut off leading "0x"
    const hashHex = "1220" + raw.slice(2);
    const hashBytes = Buffer.from(hashHex, 'hex');
    return bs58.encode(hashBytes);
}

export function bnToDate(bn: BigNumber): Date {
    return new Date(bn.toNumber() * 1000);
}


export const operations: Record<string, (a: bigint, b: bigint) => bigint> = {
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    replace: (a, b) => b,
}

export async function upsertEraValue(
    eraManager: EraManager,
    eraValue: EraValue | undefined,
    value: bigint,
    operation: keyof typeof operations = 'add'
): Promise<EraValue> {

    const currentEra = await eraManager.eraNumber().then(r => r.toNumber()); // TODO get from chain

    if (!eraValue) {
        return {
            era: currentEra,
            value: BigInt(0),
            valueAfter: value,
        }
    }

    if (eraValue.era === currentEra) {
        return {
            era: currentEra,
            value: eraValue.value,
            valueAfter: operations[operation](eraValue.valueAfter,value),
        }
    }

    return {
        era: currentEra,
        value: eraValue.valueAfter,
        valueAfter: operations[operation](eraValue.valueAfter,value)
    };
}

export async function updateTotalStake(
    eraManager: EraManager,
    indexerAddress: string,
    amount: bigint,
    operation: keyof typeof operations
): Promise<void> {

    let indexer = await Indexer.get(indexerAddress);

    if (!indexer) {
        indexer = Indexer.create({
            id: indexerAddress,
            totalStake: await upsertEraValue(eraManager, undefined, amount, operation),
            commission: await upsertEraValue(eraManager, undefined, BigInt(0)),
        });
    } else {
        indexer.totalStake = await upsertEraValue(eraManager, indexer.totalStake, amount, operation);
    }

    await indexer.save();
}
