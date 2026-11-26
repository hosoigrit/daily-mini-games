type ObservationStatus = 'WITHIN_REFERENCE' | 'OUTSIDE_REFERENCE' | 'UNMEASURED';

export const performanceReference = Object.freeze({
  frameWarmupMs: 3000,
  minimumMedianFps: 55,
  maximumFrameP95Ms: 33.4,
  maximumFrameMs: 100,
  maximumSyncDifferenceUs: 20_000,
  longDeliveryMs: 50,
  coldGenerationTrials: 3,
  maximumColdGenerationMedianMs: 5000,
  maximumColdGenerationMs: 10_000,
  maximumColdMenuMedianMs: 10_000,
  maximumInitialTransferBytes: 3_000_000,
  internalTransferBudgetBytes: 1_200_000,
  lifecycleCycles: 20,
});

export interface FrameMeasurement {
  readonly atMs: number;
  readonly state: string;
  readonly sessionId?: string;
  readonly generation?: number;
}

export interface InputMeasurement {
  readonly eventPerformanceMs: number;
  readonly receivedPerformanceMs: number;
}

export interface AudioMeasurement {
  readonly differenceUs?: number | null;
  readonly errorCode?: string;
}

export interface ResourceMeasurement {
  readonly cacheTracks?: number;
  readonly activeRenders?: number;
  readonly activeSources?: number;
  readonly activeListeners?: number;
  readonly activeRafLoops?: number;
}

const validNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function summarizeSamples(values: readonly number[]) {
  const sorted = values.filter(validNonnegative).sort((a, b) => a - b);
  function nearestRank(quantile: number) {
    return sorted[Math.ceil(quantile * sorted.length) - 1] ?? null;
  }
  return {
    sampleCount: sorted.length,
    invalidSampleCount: values.length - sorted.length,
    median: median(sorted),
    p95: nearestRank(0.95),
    p99: nearestRank(0.99),
    maximum: sorted.at(-1) ?? null,
  };
}

export function summarizeFrames(events: readonly FrameMeasurement[]) {
  const deltas: number[] = [];
  let segmentStart: number | null = null;
  let previous: FrameMeasurement | null = null;
  let invalidEventCount = 0;
  for (const event of events) {
    if (!validNonnegative(event.atMs) || (previous && event.atMs <= previous.atMs)) {
      invalidEventCount++;
      segmentStart = null;
      previous = null;
      continue;
    }
    if (event.state !== 'PLAYING') {
      segmentStart = null;
      previous = null;
      continue;
    }
    if (!previous || previous.sessionId !== event.sessionId || previous.generation !== event.generation) {
      segmentStart = event.atMs;
    } else if (segmentStart !== null && previous.atMs - segmentStart >= performanceReference.frameWarmupMs) {
      deltas.push(event.atMs - previous.atMs);
    }
    previous = event;
  }
  const intervalMs = summarizeSamples(deltas);
  const medianFps = intervalMs.median === null ? null : 1000 / intervalMs.median;
  const status: ObservationStatus = medianFps === null ? 'UNMEASURED'
    : medianFps >= performanceReference.minimumMedianFps
        && intervalMs.p95! <= performanceReference.maximumFrameP95Ms
        && intervalMs.maximum! <= performanceReference.maximumFrameMs && invalidEventCount === 0
      ? 'WITHIN_REFERENCE' : 'OUTSIDE_REFERENCE';
  return { medianFps, intervalMs, invalidEventCount, status };
}

export function summarizeInputDelivery(events: readonly InputMeasurement[]) {
  const delays = events.map(({ eventPerformanceMs, receivedPerformanceMs }) =>
    validNonnegative(eventPerformanceMs) && validNonnegative(receivedPerformanceMs)
      ? receivedPerformanceMs - eventPerformanceMs : NaN);
  return {
    ...summarizeSamples(delays),
    over50msCount: delays.filter(delay => Number.isFinite(delay) && delay > performanceReference.longDeliveryMs).length,
  };
}

export function summarizeAudioSync(events: readonly AudioMeasurement[]) {
  const observations = summarizeSamples(events.flatMap(event =>
    event.differenceUs === undefined || event.differenceUs === null ? [] : [Math.abs(event.differenceUs)]));
  const safetyErrors = events.flatMap(event => event.errorCode === undefined ? [] : [event.errorCode]);
  const status: ObservationStatus = (observations.maximum !== null
    && observations.maximum > performanceReference.maximumSyncDifferenceUs) || safetyErrors.includes('ERR-006')
    ? 'OUTSIDE_REFERENCE' : observations.sampleCount === 0 || safetyErrors.length || observations.invalidSampleCount
      ? 'UNMEASURED' : 'WITHIN_REFERENCE';
  return { differenceUs: observations, safetyErrors, status };
}

export function summarizeResources(events: readonly ResourceMeasurement[]) {
  function peaks(field: keyof ResourceMeasurement) {
    const counts = events.flatMap(event => typeof event[field] === 'number' ? [event[field]] : []);
    return summarizeSamples(counts.filter(Number.isSafeInteger));
  }
  return {
    cacheTracks: peaks('cacheTracks'), activeRenders: peaks('activeRenders'), activeSources: peaks('activeSources'),
    activeListeners: peaks('activeListeners'), activeRafLoops: peaks('activeRafLoops'),
    last: events.at(-1) ?? null,
  };
}
