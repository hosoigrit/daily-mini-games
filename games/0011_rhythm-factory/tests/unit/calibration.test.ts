import { describe, expect, it } from 'vitest';
import type { CalibrationResult, NormalizedInput, Us } from '../../src/contracts/interface_contracts';
import { createCalibration } from '../../src/domain/calibration';

const us = (value: number) => value as Us;
const repeat = (value: number, count: number) => Array<number>(count).fill(value);
const down = (atUs: number, sequence = 0) => ({
  action: 'DOWN' as const, songTimeUs: us(atUs), sequence,
});

function simulate(errors: readonly number[], startUs = 0) {
  const calibration = createCalibration(us(startUs));
  for (let beat = 1; beat <= 4; beat++) {
    const beatUs = startUs + (beat - 1) * 600_000;
    expect(calibration.acceptInput(down(beatUs - 150_000, beat))).toBe(false);
  }
  errors.forEach((error, index) => {
    const inputUs = startUs + (index + 4) * 600_000 + error;
    expect(calibration.acceptInput(down(inputUs, 5 + index))).toBe(true);
  });
  return calibration;
}

function completed(calibration: ReturnType<typeof createCalibration>) {
  return calibration.advance(us(calibration.finalizeAfterUs + 1));
}

function proposal(result: CalibrationResult | null) {
  if (result?.kind !== 'PROPOSED') throw new Error('Expected a calibration proposal');
  return result;
}

describe('A-2c timing calibration (POC-08)', () => {
  it('uses fixed 100 BPM and 16 beats relative to its first beat', () => {
    const calibration = createCalibration(us(1_400_000));
    expect(calibration.beatTimesUs).toEqual(Array.from({ length: 16 }, (_, i) => 1_400_000 + i * 600_000));
    expect(calibration.lastInputUs).toBe(10_700_000);
    expect(calibration.finalizeAfterUs).toBe(10_750_000);
    expect(Object.isFrozen(calibration.beatTimesUs)).toBe(true);
  });

  it('returns no proposal for 9 valid evaluation presses (TC-D3-027)', () => {
    const calibration = simulate(repeat(0, 9));
    expect(completed(calibration)).toEqual({ kind: 'RETRY', reason: 'INSUFFICIENT' });
  });

  it.each([10, 11, 12])('excludes warmup and includes %i valid presses (TC-D3-028)', count => {
    const calibration = simulate(repeat(45_000, count));
    expect(calibration.advance(us(calibration.finalizeAfterUs))).toBeNull();
    const result = proposal(completed(calibration));
    expect(result.samples).toEqual(Array.from({ length: count }, (_, i) => ({ beatIndex: i + 5, errorUs: 45_000 })));
    expect(result).toMatchObject({ medianUs: 45_000, madUs: 0, proposedOffsetMs: 45 });
    expect(Object.isFrozen(result) && Object.isFrozen(result.samples) && Object.isFrozen(result.samples[0])).toBe(true);
    expect(completed(calibration)).toBe(result);
  });

  it('accepts MAD exactly 50 ms and rejects 50.001 ms (TC-D3-029/030)', () => {
    const atLimit = simulate([...repeat(-50_000, 6), ...repeat(50_000, 6)]);
    expect(completed(atLimit)).toMatchObject({ kind: 'PROPOSED', medianUs: 0, madUs: 50_000, proposedOffsetMs: 0 });
    const beyond = simulate([...repeat(-50_001, 6), ...repeat(50_001, 6)]);
    expect(completed(beyond)).toEqual({ kind: 'RETRY', reason: 'SPREAD' });
  });

  it.each([-1, 1])('checks unrounded median magnitude for sign %i (TC-D3-031)', sign => {
    expect(completed(simulate(repeat(sign * 200_000, 12)))).toMatchObject({
      kind: 'PROPOSED', medianUs: sign * 200_000, proposedOffsetMs: sign * 200,
    });
    expect(completed(simulate(repeat(sign * 200_001, 12)))).toEqual({
      kind: 'RETRY', reason: 'OUT_OF_RANGE',
    });
  });

  it.each([-1, 1])('rounds exact halves away from zero for sign %i (TC-D3-032)', sign => {
    expect(completed(simulate(repeat(sign * 2_500, 12)))).toMatchObject({
      kind: 'PROPOSED', medianUs: sign * 2_500, proposedOffsetMs: sign * 5,
    });
    const fractional = proposal(completed(simulate([...repeat(sign * 2_499, 5), ...repeat(sign * 2_500, 5)])));
    expect(fractional).toMatchObject({ medianUs: sign * 2_499.5, madUs: 0.5, proposedOffsetMs: 0 });
    expect(Object.is(fractional.proposedOffsetMs, -0)).toBe(false);
  });

  it('uses only the first press and excludes UP, even with reordered delivery (TC-D3-033)', () => {
    const calibration = simulate(repeat(20_000, 9));
    expect(calibration.acceptInput({ ...down(7_815_000), action: 'UP' })).toBe(false);
    expect(calibration.acceptInput(down(7_830_000, 90))).toBe(true);
    expect(calibration.acceptInput(down(7_820_000, 89))).toBe(true);
    expect(calibration.acceptInput(down(7_820_000, 89))).toBe(false);
    expect(calibration.acceptInput(down(7_835_000, 91))).toBe(false);
    expect(proposal(completed(calibration)).samples.at(-1)).toEqual({ beatIndex: 14, errorUs: 20_000 });
  });

  it('interrupts an active measurement or invalidates a proposal (TC-D3-034 logic)', () => {
    const during = simulate(repeat(45_000, 5));
    const interrupted = during.interrupt();
    expect(interrupted).toEqual({ kind: 'RETRY', reason: 'INTERRUPTED' });
    expect(during.interrupt()).toBe(interrupted);
    expect(during.acceptInput(down(6_600_000))).toBe(false);
    expect(completed(during)).toBe(interrupted);
    const after = simulate(repeat(45_000, 10));
    expect(completed(after)?.kind).toBe('PROPOSED');
    expect(after.interrupt()).toEqual({ kind: 'RETRY', reason: 'INTERRUPTED' });
    expect(after.read()).toEqual({ kind: 'RETRY', reason: 'INTERRUPTED' });
  });

  it('uses uncorrected song time despite the previous +100 ms setting (TC-D3-036)', () => {
    const calibration = createCalibration();
    for (let index = 4; index < 16; index++) {
      const songTimeUs = index * 600_000 + 45_000;
      const input: Pick<NormalizedInput, 'songTimeUs' | 'judgeTimeUs' | 'sequence' | 'action'> = {
        ...down(songTimeUs, index), judgeTimeUs: us(songTimeUs - 100_000),
      };
      expect(calibration.acceptInput(input)).toBe(true);
    }
    expect(completed(calibration)).toMatchObject({ medianUs: 45_000, proposedOffsetMs: 45 });
  });

  it('accepts last beat +300 ms but defers through +50 ms exactly (TC-D4-067)', () => {
    const calibration = simulate(repeat(0, 9));
    const end = calibration.lastInputUs;
    expect(calibration.acceptInput(down(end + 1, 20))).toBe(false);
    expect(calibration.advance(us(end + 49_999))).toBeNull();
    expect(calibration.advance(us(end + 50_000))).toBeNull();
    expect(calibration.acceptInput(down(end, 21))).toBe(true);
    const result = proposal(calibration.advance(us(end + 50_001)));
    expect(result.samples.at(-1)).toEqual({ beatIndex: 16, errorUs: 300_000 });
    expect(calibration.acceptInput(down(end - 1, 22))).toBe(false);
    expect(completed(calibration)).toBe(result);
  });

  it.each([false, true])('assigns the midpoint to the earlier beat even if used=%s (TC-D4-068)', used => {
    const calibration = simulate(repeat(0, 9));
    if (used) expect(calibration.acceptInput(down(7_800_000, 20))).toBe(true);
    expect(calibration.acceptInput(down(8_100_000, 21))).toBe(!used);
    expect(proposal(completed(calibration)).samples.at(-1)).toEqual({
      beatIndex: 14, errorUs: used ? 0 : 300_000,
    });
    expect(proposal(completed(calibration)).samples).toHaveLength(10);
  });

  it('never reassigns a tie with the final warmup beat', () => {
    const calibration = createCalibration();
    expect(calibration.acceptInput(down(2_100_000))).toBe(false);
    expect(calibration.acceptInput(down(2_100_001))).toBe(true);
  });

  it('rejects fractional and nonfinite clock times and invalid sequences', () => {
    const calibration = createCalibration();
    expect(calibration.acceptInput(down(2_400_000.1))).toBe(false);
    expect(calibration.acceptInput(down(Infinity))).toBe(false);
    expect(calibration.acceptInput(down(2_400_000, -1))).toBe(false);
    expect(calibration.acceptInput(down(2_400_000, NaN))).toBe(false);
    expect(calibration.advance(us(Infinity))).toBeNull();
    expect(() => createCalibration(us(Number.MAX_SAFE_INTEGER))).toThrow(RangeError);
  });
});
