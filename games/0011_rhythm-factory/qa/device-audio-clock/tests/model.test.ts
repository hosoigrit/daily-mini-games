import { describe, expect, it } from 'vitest';
import { distribution, makeEvidence, summarize, TEST_CASES } from '../src/model';
import type { ClockObservation, Preparation, Trial } from '../src/model';

const TEST_FIXTURE: Trial = {
  schemaVersion: 1, qaHarnessVersion: 'TEST FIXTURE', qaHarnessCommit: 'a'.repeat(40),
  productImplementationCommit: 'b'.repeat(40), baselineCommit: 'c'.repeat(40),
  fixtureId: 'rotation-24', fixtureHash: 'd'.repeat(64), runId: 'TEST FIXTURE', trialId: 'sample-1',
  testCaseId: 'DEV-AUD-06', testProfile: 'repetition', recordedAt: '2026-11-26T00:00:00Z',
  deviceType: null, os: null, browser: null, browserVersion: null, audioOutputType: null,
  viewport: { width: 320, height: 568, orientation: 'portrait-primary' },
  testConditions: { source: 'browser-qa', physicalDeviceVerified: false, diagnosticsEnabled: false,
    environmentId: null, powerState: null, deviceFieldsSource: 'user', viewportSource: 'browser',
    visibilityAtStart: 'visible', activationObservationLimitMs: 1_800 },
  status: 'PASS', activation: 'SUCCESS', anchor: 'SUCCESS', naturalCompletion: true,
  restarted: false, released: true, reason: null, anchors: [], observations: [], preparations: [], events: [],
};

const observation = (overrides: Partial<ClockObservation> = {}): ClockObservation => ({
  generation: 1, a0: 0.01, p0: 10, performanceNow: 110, currentTime: 0.13, contextTime: 0.11,
  performanceTime: 110, intervalMs: 100, signedResidualMs: 0, absoluteDifferenceMs: 0,
  audioContextState: 'running', valid: true, overLimit: false, reason: null, safetyStopReason: null,
  ...overrides,
});

const preparation = (generationMs: number): Preparation => ({
  startedAtMs: 0, completedAtMs: generationMs, generationMs, durationSec: 24, channels: 2, sampleRate: 48_000,
  frames: 1_152_000, pcmBytes: 9_216_000, nonfiniteSamples: 0, bgmPeak: 0.2, float32: true,
  audibleHalfSecondBlocks: 48, cacheCount: 1, renderingCount: 0, maxSimultaneousRenders: 1,
});

describe('QA evidence aggregation', () => {
  it('defines the exact eight case plans and 24/84-second fixture assignments', () => {
    expect(TEST_CASES.map(({ id, planned }) => [id, planned])).toEqual([
      ['DEV-AUD-01', 1], ['DEV-AUD-02', 1], ['DEV-AUD-03', 1], ['DEV-AUD-04', 1],
      ['DEV-AUD-05', 1], ['DEV-AUD-06', 10], ['DEV-AUD-07', 3], ['DEV-AUD-08', 3],
    ]);
    expect(TEST_CASES.filter(({ fixtureId }) => fixtureId === 'load-84').map(({ id }) => id))
      .toEqual(['DEV-AUD-04', 'DEV-AUD-08']);
    expect(summarize([])).toMatchObject({ plannedTrials: 21, unexecutedTrials: 21, successfulTrials: 0 });
  });

  it('uses arithmetic median and nearest-rank percentiles without modifying the input', () => {
    const descending = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(distribution(descending)).toEqual({ count: 100, median: 50.5, p95: 95, p99: 99, max: 100 });
    expect(descending[0]).toBe(100);
  });

  it('uses null timing when measurements are absent or all invalid', () => {
    expect(distribution([NaN, -Infinity, Infinity, -1])).toEqual({ count: 0, median: null, p95: null, p99: null, max: null });
    expect(summarize([], 'DEV-AUD-06').syncDifferenceMs.max).toBeNull();
  });

  it('keeps failed, blocked and aborted trials alongside successes and counts unexecuted trials', () => {
    const trials = (['PASS', 'FAIL', 'BLOCKED', 'ABORTED', 'NOT RUN'] as const).map((status, index) => ({
      ...TEST_FIXTURE, trialId: String(index), status,
    }));
    const evidence = makeEvidence(trials);
    expect(evidence.trials.map(trial => trial.status)).toEqual(['PASS', 'FAIL', 'BLOCKED', 'ABORTED', 'NOT RUN']);
    expect(evidence.groups[0]?.summary).toMatchObject({ executedTrials: 4, successfulTrials: 1, failedTrials: 1,
      blockedTrials: 1, abortedTrials: 1, unexecutedTrials: 6 });
    expect(evidence).toMatchObject({ formalStatus: 'HOLD', physicalDeviceVerified: false });
  });

  it('uses only valid measurements for percentiles and retains the actual rejected sample', () => {
    const evidence = makeEvidence([{ ...TEST_FIXTURE, status: 'FAIL', observations: [
      observation({ absoluteDifferenceMs: 20.00000000001 }),
      observation({ absoluteDifferenceMs: 20.001, performanceNow: 210, overLimit: true, safetyStopReason: 'clock.outOfSync' }),
      observation({ absoluteDifferenceMs: 0, performanceNow: 310, valid: false, reason: 'clock.unavailable' }),
      observation({ absoluteDifferenceMs: Infinity, performanceNow: 410 }),
    ] }]);
    expect(evidence.summary).toMatchObject({ validObservations: 2, invalidObservations: 2, overLimitCount: 1,
      syncDifferenceMs: { count: 2, max: 20.001 }, firstOverLimit: { performanceNow: 210, absoluteDifferenceMs: 20.001 } });
    expect(evidence.trials[0]?.observations).toHaveLength(4);
  });

  it('separates test profiles, fixtures, and diagnostic conditions before comparing timings', () => {
    const trials: Trial[] = [
      { ...TEST_FIXTURE, preparations: [preparation(10)] },
      { ...TEST_FIXTURE, trialId: 'sample-2', testCaseId: 'DEV-AUD-04', testProfile: 'screening', fixtureId: 'load-84',
        preparations: [preparation(30)] },
      { ...TEST_FIXTURE, trialId: 'sample-3', testConditions: { ...TEST_FIXTURE.testConditions, diagnosticsEnabled: true },
        preparations: [preparation(50)] },
    ];
    const evidence = makeEvidence(trials);
    expect(evidence.groups.map(group => group.summary.generationMs.median)).toEqual([10, 30, 50]);
    expect(evidence.summary.generationMs).toMatchObject({ count: 3, median: null });
    expect(evidence.summary.mixedConditions).toBe(true);
  });

  it('requires three cold measurements to pass and includes the reference boundaries', () => {
    const trials = [4_999, 5_000, 10_000].map((generationMs, index) => ({
      ...TEST_FIXTURE, trialId: String(index), preparations: [preparation(generationMs)],
    }));
    expect(makeEvidence(trials.slice(0, 2)).groups[0]?.summary.generationPerformance.status).toBe('NOT RUN');
    expect(makeEvidence(trials).groups[0]?.summary.generationPerformance).toMatchObject({ status: 'PASS', sampleCount: 3 });
  });

  it('reports maximum, median and render-resource breaches in the measured condition', () => {
    const medianTooSlow = makeEvidence([5_001, 6_000, 7_000].map((ms, index) => ({
      ...TEST_FIXTURE, trialId: String(index), preparations: [preparation(ms)],
    })));
    const maximumTooSlow = makeEvidence([{ ...TEST_FIXTURE, preparations: [preparation(10_001)] }]);
    const resourceCap = makeEvidence([{ ...TEST_FIXTURE, preparations: [{ ...preparation(10), maxSimultaneousRenders: 2 }] }]);
    expect(medianTooSlow.groups[0]?.summary.generationPerformance.status).toBe('FAIL');
    expect(maximumTooSlow.groups[0]?.summary.generationPerformance.status).toBe('FAIL');
    expect(resourceCap.groups[0]?.summary.generationPerformance).toMatchObject({ status: 'FAIL', resourceCapExceeded: true });
  });
});
