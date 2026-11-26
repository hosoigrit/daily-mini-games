import type { ConvertedTime, Gen, Ms, PlaybackAnchor, Result, Tick, Us } from '../contracts/interface_contracts';
import type { TimePort } from '../contracts/ports';

export const clockSampleIntervalMs = 100;
export const maximumClockDifferenceUs = 20_000;
const ticksPerQuarter = 480;

export function tickToUs(tick: Tick, bpm: number): Us {
  if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(bpm) || bpm < 1) {
    throw new RangeError('The tick must be a non-negative integer and the BPM a positive integer');
  }
  const microseconds = Math.round(tick * 60_000_000 / (ticksPerQuarter * bpm));
  if (!Number.isSafeInteger(microseconds)) throw new RangeError('Tick conversion exceeds safe integer precision');
  return microseconds as Us;
}

export interface OutputClockSample {
  readonly contextTime: number;
  readonly performanceTime: number;
}

type ClockError = 'ERR-005' | 'ERR-006';

function failure(code: ClockError, sessionId: string, messageKey: string): Result<never> {
  return { ok: false, error: { code, severity: 'ERROR', messageKey, recoverable: false, sessionId } };
}

export function isUsableClockSample(sample: OutputClockSample | undefined): sample is OutputClockSample {
  return sample !== undefined
    && Number.isFinite(sample.contextTime) && sample.contextTime > 0
    && Number.isFinite(sample.performanceTime) && sample.performanceTime > 0;
}

interface ClockObservation {
  readonly differenceUs: Us;
}

function decimalInMicroseconds(value: number, unitExponent: number) {
  const parts = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if (!parts?.[1]) throw new RangeError('Expected a finite positive clock reading');
  const fraction = parts[2] ?? '';
  return {
    digits: BigInt(parts[1] + fraction),
    exponent: unitExponent + Number(parts[3] ?? 0) - fraction.length,
  };
}

function preciseDifferenceUs(reference: OutputClockSample, observed: OutputClockSample): Us | null {
  // Compare the canonical decimal readings at the same scale without a tolerance or an early round.
  const observedAudio = decimalInMicroseconds(observed.contextTime, 6);
  const referenceAudio = decimalInMicroseconds(reference.contextTime, 6);
  const observedPerformance = decimalInMicroseconds(observed.performanceTime, 3);
  const referencePerformance = decimalInMicroseconds(reference.performanceTime, 3);
  const exponent = Math.min(0, observedAudio.exponent, referenceAudio.exponent,
    observedPerformance.exponent, referencePerformance.exponent);
  const scaled = (reading: ReturnType<typeof decimalInMicroseconds>) =>
    reading.digits * 10n ** BigInt(reading.exponent - exponent);
  const unitsPerMicrosecond = 10n ** BigInt(-exponent);
  const signedDifference = scaled(observedAudio) - scaled(referenceAudio)
    - (scaled(observedPerformance) - scaled(referencePerformance));
  const absoluteDifference = signedDifference < 0n ? -signedDifference : signedDifference;

  if (absoluteDifference > BigInt(maximumClockDifferenceUs) * unitsPerMicrosecond) return null;
  return Number((absoluteDifference * 2n + unitsPerMicrosecond) / (2n * unitsPerMicrosecond)) as Us;
}

export function createFixedAudioClock(anchor: PlaybackAnchor, offsetUs: Us): Result<TimePort & {
  observe(sample: OutputClockSample | undefined): Result<ClockObservation>;
}> {
  const { sessionId, generation, anchorAudioSec, anchorPerformanceMs, startAudioSec, startSongUs } = anchor;
  if (!isUsableClockSample({ contextTime: anchorAudioSec, performanceTime: anchorPerformanceMs })
      || !Number.isSafeInteger(generation) || generation < 0
      || !Number.isFinite(startAudioSec) || startAudioSec < 0
      || !Number.isSafeInteger(startSongUs) || !Number.isSafeInteger(offsetUs)) {
    return failure('ERR-005', sessionId, 'clock.invalidAnchor');
  }

  const reference: OutputClockSample = { contextTime: anchorAudioSec, performanceTime: anchorPerformanceMs };
  let lastSample = reference;
  let stopped = false;
  const estimateAudioSeconds = (atMs: number) => anchorAudioSec + (atMs - anchorPerformanceMs) / 1000;

  return {
    ok: true,
    value: {
      convertEventTime(time: Ms, expectedGeneration: Gen): Result<ConvertedTime> {
        if (stopped || generation !== expectedGeneration) return failure('ERR-006', sessionId, 'clock.invalidGeneration');
        if (!Number.isFinite(time) || time < 0) return failure('ERR-005', sessionId, 'clock.invalidEventTime');
        const song = startSongUs + Math.round((estimateAudioSeconds(time) - startAudioSec) * 1_000_000);
        const judge = song - offsetUs;
        if (!Number.isSafeInteger(song) || !Number.isSafeInteger(judge)) {
          return failure('ERR-005', sessionId, 'clock.invalidConvertedTime');
        }
        return { ok: true, value: { generation, songTimeUs: song as Us, judgeTimeUs: judge as Us } };
      },
      observe(sample) {
        if (stopped) return failure('ERR-006', sessionId, 'clock.stopped');
        if (!isUsableClockSample(sample)) {
          stopped = true;
          return failure('ERR-005', sessionId, 'clock.unavailable');
        }
        if (sample.contextTime < lastSample.contextTime || sample.performanceTime < lastSample.performanceTime
            || (sample.contextTime === lastSample.contextTime && sample.performanceTime === lastSample.performanceTime)) {
          stopped = true;
          return failure('ERR-006', sessionId, 'clock.notAdvancing');
        }
        const differenceUs = preciseDifferenceUs(reference, sample);
        if (differenceUs === null) {
          stopped = true;
          return failure('ERR-006', sessionId, 'clock.outOfSync');
        }
        lastSample = { ...sample };
        return { ok: true, value: { differenceUs } };
      },
    },
  };
}
