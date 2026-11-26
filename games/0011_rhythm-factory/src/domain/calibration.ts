import type {
  CalibrationResult, CalibrationSample, NormalizedInput, StatisticalUs, Tick, Us,
} from '../contracts/interface_contracts';
import { tickToUs } from './audio-clock';
import { deliveryWaitUs } from './input-queue';

const bpm = 100;
const beats = 16;
const warmupBeats = 4;
const beatSpacingUs = tickToUs(480 as Tick, bpm);
const captureRadiusUs = 300_000;

type CalibrationInput = Pick<NormalizedInput, 'action' | 'songTimeUs' | 'sequence'>;
type SampleCandidate = CalibrationSample & Pick<CalibrationInput, 'sequence'>;

function median(values: readonly number[]): StatisticalUs {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return (sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2) as StatisticalUs;
}

function summarize(samples: readonly CalibrationSample[]): CalibrationResult {
  if (samples.length < 10) return Object.freeze({ kind: 'RETRY', reason: 'INSUFFICIENT' });
  const errors = samples.map(sample => sample.errorUs);
  const medianUs = median(errors);
  if (Math.abs(medianUs) > 200_000) return Object.freeze({ kind: 'RETRY', reason: 'OUT_OF_RANGE' });
  const madUs = median(errors.map(error => Math.abs(error - medianUs)));
  if (madUs > 50_000) return Object.freeze({ kind: 'RETRY', reason: 'SPREAD' });

  const steps = Math.round(Math.abs(medianUs) / 5_000);
  const proposedOffsetMs = steps === 0 ? 0 : Math.sign(medianUs) * steps * 5;
  return Object.freeze({ kind: 'PROPOSED', samples, medianUs, madUs, proposedOffsetMs });
}

/** The session clock supplies uncorrected song time. The controller owns input and lease eligibility. */
export function createCalibration(firstBeatUs: Us = 0 as Us) {
  const lastInputUs = (firstBeatUs + (beats - 1) * beatSpacingUs + captureRadiusUs) as Us;
  const finalizeAfterUs = (lastInputUs + deliveryWaitUs) as Us;
  if (!Number.isSafeInteger(firstBeatUs) || !Number.isSafeInteger(firstBeatUs - captureRadiusUs)
    || !Number.isSafeInteger(finalizeAfterUs)) throw new RangeError('Calibration beat times must be integer microseconds');

  const beatTimesUs = Object.freeze(Array.from({ length: beats }, (_, index) =>
    (firstBeatUs + index * beatSpacingUs) as Us));
  const candidates = new Map<number, SampleCandidate>();
  let result: CalibrationResult | null = null;

  function acceptInput(input: CalibrationInput): boolean {
    const { action, songTimeUs, sequence } = input;
    if (result || action !== 'DOWN' || !Number.isSafeInteger(songTimeUs) || !Number.isSafeInteger(sequence)
      || sequence < 0 || songTimeUs < firstBeatUs - captureRadiusUs || songTimeUs > lastInputUs) return false;

    let beatIndex = 0;
    let nearestError = songTimeUs - firstBeatUs;
    for (const [index, time] of beatTimesUs.entries()) {
      const error = songTimeUs - time;
      if (Math.abs(error) < Math.abs(nearestError)) {
        beatIndex = index;
        nearestError = error;
      }
    }
    if (beatIndex < warmupBeats || Math.abs(nearestError) > captureRadiusUs) return false;

    const first = candidates.get(beatIndex);
    if (first && (first.errorUs < nearestError || (first.errorUs === nearestError && first.sequence <= sequence))) {
      return false;
    }

    // Delivery can be reversed. Retain the first occurrence on its nearest beat before finalizing.
    candidates.set(beatIndex, { beatIndex: beatIndex + 1, errorUs: nearestError as Us, sequence });
    return true;
  }

  return {
    beatTimesUs,
    lastInputUs,
    finalizeAfterUs,
    acceptInput,
    advance(songNowUs: Us): CalibrationResult | null {
      if (!result && Number.isSafeInteger(songNowUs) && songNowUs > finalizeAfterUs) {
        const samples = [...candidates.values()].sort((a, b) => a.beatIndex - b.beatIndex)
          .map(({ beatIndex, errorUs }) => Object.freeze({ beatIndex, errorUs }));
        result = summarize(Object.freeze(samples));
        candidates.clear();
      }
      return result;
    },
    interrupt(): CalibrationResult {
      if (result?.kind === 'RETRY' && result.reason === 'INTERRUPTED') return result;
      candidates.clear();
      result = Object.freeze({ kind: 'RETRY', reason: 'INTERRUPTED' });
      return result;
    },
    read: () => result,
  };
}
