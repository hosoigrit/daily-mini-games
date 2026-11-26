import { describe, expect, it } from 'vitest';
import { stageA2TrialMusic } from '../../../src/content/stage-a2-trial';
import { a2ar2LoadTrack } from '../../../tests/fixtures/a2ar2-load-track';
import { fixtures } from '../src/product';

describe('QA imports immutable product catalog references', () => {
  it('binds both QA durations to the exact source objects', () => {
    const short = fixtures['rotation-24'];
    const long = fixtures['load-84'];
    expect(short.definition).toBe(stageA2TrialMusic);
    expect(long.definition).toBe(a2ar2LoadTrack);
    expect([short.durationSec, long.durationSec]).toEqual([24, 84]);
    expect([short.definition.events.length, long.definition.events.length]).toEqual([222, 768]);
    expect([short.definition.master.totalBars, long.definition.master.totalBars]).toEqual([12, 42]);
  });
});
