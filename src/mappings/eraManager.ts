
import { MoonbeamEvent } from '@subql/contract-processors/dist/moonbeam';
import { NewEraStartEvent } from '@subql/contract-sdk/typechain/EraManager';
import assert from 'assert';

import { Era } from '../types';

/* Era Handlers */
export async function handleNewEra(event: MoonbeamEvent<NewEraStartEvent['args']>): Promise<void> {
    assert(event.args, 'No event args');

    const { era: id } = event.args;

    if (!id.isZero()) {
        const previousId = id.sub(1);
        const previousEra = await Era.get(previousId.toHexString());
        assert(previousEra, `Era ${previousId} doesn't exist`);

        previousEra.endTime = event.blockTimestamp;

        await previousEra.save();
    }

    const era = Era.create({
        id: id.toHexString(),
        startTime: event.blockTimestamp,
    });

    await era.save();
}
