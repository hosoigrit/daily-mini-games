import { describe, expect, it } from 'vitest';
import type { Gen, Ms, PlaybackAnchor, Result, Sec, Tick, Us } from '../../src/contracts/interface_contracts';
import { createFixedAudioClock, tickToUs } from '../../src/domain/audio-clock';

const anchor = {
  playbackId: 'playback-3', sessionId: 'clock-fixture', generation: 3 as Gen,
  startAudioSec: 10 as Sec, startSongUs: 0 as Us, anchorAudioSec: 10 as Sec, anchorPerformanceMs: 1000 as Ms,
} satisfies PlaybackAnchor;

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('TC-D1-001〜004 absolute ticks', () => {
  it('converts the approved BPM examples without accumulating rounded intervals', () => {
    expect([0, 480].map((tick) => tickToUs(tick as Tick, 100))).toEqual([0, 600_000]);
    expect([0, 120, 240, 360, 480].map((tick) => tickToUs(tick as Tick, 128)))
      .toEqual([0, 117_188, 234_375, 351_563, 468_750]);
    expect([480, 960, 92_160].map((tick) => tickToUs(tick as Tick, 144)))
      .toEqual([416_667, 833_333, 80_000_000]);
  });

  it('rejects nonfinite, fractional, negative and overflowing values before use', () => {
    for (const tick of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => tickToUs(tick as Tick, 100)).toThrow(RangeError);
    }
    for (const bpm of [-1, 0, 0.5, NaN, Infinity]) {
      expect(() => tickToUs(0 as Tick, bpm)).toThrow(RangeError);
    }
  });
});

describe('IF-03/04 fixed-generation clock', () => {
  it('applies the signed offset once and does not replace the anchor after an observation', () => {
    const clock = unwrap(createFixedAudioClock(anchor, 200_000 as Us));
    const before = clock.convertEventTime(2200 as Ms, anchor.generation);
    expect(unwrap(before)).toEqual({ generation: 3, songTimeUs: 1_200_000, judgeTimeUs: 1_000_000 });
    expect(unwrap(clock.observe({ contextTime: 10.12, performanceTime: 1100 })).differenceUs).toBe(20_000);
    expect(clock.convertEventTime(2200 as Ms, anchor.generation)).toEqual(before);
    const negativeOffset = unwrap(createFixedAudioClock(anchor, -200_000 as Us));
    expect(unwrap(negativeOffset.convertEventTime(1800 as Ms, anchor.generation)).judgeTimeUs).toBe(1_000_000);
  });

  it('TC-D4-030 checks the 20 ms / +1 μs boundary and prohibits continuation', () => {
    const clock = unwrap(createFixedAudioClock(anchor, 0 as Us));
    expect(clock.observe({ contextTime: 10.12, performanceTime: 1100 }).ok).toBe(true);
    expect(clock.observe({ contextTime: 10.220001, performanceTime: 1200 })).toMatchObject({
      ok: false, error: { code: 'ERR-006', messageKey: 'clock.outOfSync' },
    });
    expect(clock.convertEventTime(1400 as Ms, anchor.generation).ok).toBe(false);
  });

  it('stops on the first out-of-band sample before output diagnostics round to μs', () => {
    const upper = unwrap(createFixedAudioClock(anchor, 0 as Us));
    const lower = unwrap(createFixedAudioClock(anchor, 0 as Us));
    expect(upper.observe({ contextTime: 10.1200001, performanceTime: 1100 })).toMatchObject({
      ok: false, error: { code: 'ERR-006', messageKey: 'clock.outOfSync' },
    });
    expect(lower.observe({ contextTime: 10.0799999, performanceTime: 1100 })).toMatchObject({
      ok: false, error: { code: 'ERR-006', messageKey: 'clock.outOfSync' },
    });
    expect(unwrap(unwrap(createFixedAudioClock(anchor, 0 as Us)).observe(
      { contextTime: 10.08, performanceTime: 1100 },
    )).differenceUs).toBe(20_000);
  });

  it('rejects backward, stalled and unavailable observations, invalid opening anchors and stale generations', () => {
    expect(createFixedAudioClock({ ...anchor, anchorPerformanceMs: 0 as Ms }, 0 as Us).ok).toBe(false);
    expect(createFixedAudioClock({ ...anchor, anchorAudioSec: 0 as Sec }, 0 as Us).ok).toBe(false);
    const clock = unwrap(createFixedAudioClock(anchor, 0 as Us));
    expect(clock.convertEventTime(2000 as Ms, 2 as Gen).ok).toBe(false);
    expect(clock.convertEventTime(NaN as Ms, 3 as Gen).ok).toBe(false);
    for (const sample of [
      undefined,
      { contextTime: NaN, performanceTime: 1100 },
      { contextTime: 9.99, performanceTime: 1000 },
      { contextTime: 10, performanceTime: 1000 },
    ]) {
      expect(unwrap(createFixedAudioClock(anchor, 0 as Us)).observe(sample).ok).toBe(false);
    }
  });
});
