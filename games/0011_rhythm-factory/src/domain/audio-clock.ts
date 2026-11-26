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

  let lastSample: OutputClockSample = { contextTime: anchorAudioSec, performanceTime: anchorPerformanceMs };
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
        const predicted = estimateAudioSeconds(sample.performanceTime);
        const limitSeconds = maximumClockDifferenceUs / 1_000_000;
        // Compare the observed seconds against the inclusive band before rounding the reported difference to μs.
        if (sample.contextTime < predicted - limitSeconds || sample.contextTime > predicted + limitSeconds) {
          stopped = true;
          return failure('ERR-006', sessionId, 'clock.outOfSync');
        }
        lastSample = { ...sample };
        const differenceUs = Math.round(Math.abs(sample.contextTime - predicted) * 1_000_000) as Us;
        return { ok: true, value: { differenceUs } };
      },
    },
  };
}
