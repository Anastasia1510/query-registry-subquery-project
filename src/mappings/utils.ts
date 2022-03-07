import bs58 from 'bs58';
import { BigNumber } from '@ethersproject/bignumber';
import { EraManager } from '@subql/contract-sdk';
import { Indexer, EraValue, JSONBigInt } from '../types';

// TODO get this from contract-sdk when network is bundled
export const ERA_MANAGER_ADDRESS = '0xD376C00320CBDB8b3c862094Fa103529639cE881';
export const PLAN_MANAGER_ADDRESS =
  '0x2F87033B54D34b8Ed1c632b25567f20136D5D5A4';
export const SA_REGISTRY_ADDRESS = '0xF0eC7ae35CAeDBF3e247fB0d776E9be98906746F';

declare global {
  interface BigIntConstructor {
    fromJSONType(value: unknown): bigint;
  }
  interface BigInt {
    toJSON(): string;
    toJSONType(): JSONBigInt;
    fromJSONType(value: unknown): bigint;
  }
}

BigInt.prototype.toJSON = function (): string {
  return BigNumber.from(this).toHexString();
};

BigInt.prototype.toJSONType = function () {
  return {
    type: 'bigint',
    value: this.toJSON(),
  };
};

BigInt.fromJSONType = function (value: JSONBigInt): bigint {
  if (value?.type !== 'bigint' && !value.value) {
    throw new Error('Value is not JSOBigInt');
  }

  return BigNumber.from(value.value).toBigInt();
};

export function bytesToIpfsCid(raw: string): string {
  // Add our default ipfs values for first 2 bytes:
  // function:0x12=sha2, size:0x20=256 bits
  // and cut off leading "0x"
  const hashHex = '1220' + raw.slice(2);
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
};

export async function upsertEraValue(
  eraManager: EraManager,
  eraValue: EraValue | undefined,
  value: bigint,
  operation: keyof typeof operations = 'add'
): Promise<EraValue> {
  const currentEra = await eraManager.eraNumber().then((r) => r.toNumber());

  if (!eraValue) {
    return {
      era: currentEra,
      value: BigInt(0).toJSONType(),
      valueAfter: value.toJSONType(),
    };
  }

  if (eraValue.era === currentEra) {
    BigInt.fromJSONType(eraValue.valueAfter);
    return {
      era: currentEra,
      value: eraValue.value,
      valueAfter: operations[operation](
        BigInt.fromJSONType(eraValue.valueAfter),
        value
      ).toJSONType(),
    };
  }

  return {
    era: currentEra,
    value: eraValue.valueAfter,
    valueAfter: operations[operation](
      BigInt.fromJSONType(eraValue.valueAfter),
      value
    ).toJSONType(),
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
      totalStake: await upsertEraValue(
        eraManager,
        undefined,
        amount,
        operation
      ),
      commission: await upsertEraValue(eraManager, undefined, BigInt(0)),
    });
  } else {
    indexer.totalStake = await upsertEraValue(
      eraManager,
      indexer.totalStake,
      amount,
      operation
    );
  }

  await indexer.save();
}
