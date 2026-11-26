export type FixtureId = 'rotation-24' | 'load-84';
export type Outcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'ABORTED' | 'NOT RUN';

export const TEST_CASES = [
  { id: 'DEV-AUD-01', label: '音声有効化・初期アンカー', profile: 'screening', fixtureId: 'rotation-24', planned: 1, mode: 'anchor' },
  { id: 'DEV-AUD-02', label: '24秒正常再生', profile: 'screening', fixtureId: 'rotation-24', planned: 1, mode: 'natural' },
  { id: 'DEV-AUD-03', label: '停止・新世代再開', profile: 'screening', fixtureId: 'rotation-24', planned: 1, mode: 'restart' },
  { id: 'DEV-AUD-04', label: '84秒冷生成・正常再生', profile: 'screening', fixtureId: 'load-84', planned: 1, mode: 'natural' },
  { id: 'DEV-AUD-05', label: '結果保存・再実行', profile: 'screening', fixtureId: 'rotation-24', planned: 1, mode: 'export' },
  { id: 'DEV-AUD-06', label: '24秒正常完走', profile: 'repetition', fixtureId: 'rotation-24', planned: 10, mode: 'natural' },
  { id: 'DEV-AUD-07', label: '停止・新世代再開', profile: 'repetition', fixtureId: 'rotation-24', planned: 3, mode: 'restart' },
  { id: 'DEV-AUD-08', label: '84秒冷生成・正常完走', profile: 'repetition', fixtureId: 'load-84', planned: 3, mode: 'natural' },
] as const;

export type TestCaseId = (typeof TEST_CASES)[number]['id'];
export type TestProfile = (typeof TEST_CASES)[number]['profile'];

export interface DeviceInput {
  environmentId: string;
  deviceType: string;
  os: string;
  browser: string;
  browserVersion: string;
  audioOutputType: string;
  powerState: string;
}

export interface Viewport { width: number; height: number; orientation: string }

export interface ClockObservation {
  generation: number;
  a0: number;
  p0: number;
  performanceNow: number;
  currentTime: number | null;
  contextTime: number | null;
  performanceTime: number | null;
  intervalMs: number | null;
  signedResidualMs: number | null;
  absoluteDifferenceMs: number | null;
  audioContextState: string | null;
  valid: boolean;
  overLimit: boolean;
  reason: string | null;
  safetyStopReason: string | null;
}

export interface Preparation {
  startedAtMs: number;
  completedAtMs: number;
  generationMs: number;
  durationSec: number;
  channels: number;
  sampleRate: number;
  frames: number;
  pcmBytes: number;
  nonfiniteSamples: number;
  bgmPeak: number | null;
  float32: boolean;
  audibleHalfSecondBlocks: number;
  cacheCount: number;
  renderingCount: number;
  maxSimultaneousRenders: number;
}

export interface AnchorRecord {
  generation: number;
  a0: number;
  p0: number;
  performanceNow: number;
  currentTime: number | null;
  contextTime: number | null;
  performanceTime: number | null;
  audioContextState: string | null;
  startAudioSec: number;
  startSongUs: number;
}

export interface Trial {
  schemaVersion: 1;
  qaHarnessVersion: string;
  qaHarnessCommit: string;
  productImplementationCommit: string;
  baselineCommit: string;
  fixtureId: FixtureId;
  fixtureHash: string;
  runId: string;
  trialId: string;
  testCaseId: TestCaseId;
  testProfile: TestProfile;
  recordedAt: string;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  browserVersion: string | null;
  audioOutputType: string | null;
  viewport: Viewport;
  testConditions: {
    source: 'browser-qa';
    physicalDeviceVerified: false;
    diagnosticsEnabled: boolean;
    environmentId: string | null;
    powerState: string | null;
    deviceFieldsSource: 'user';
    viewportSource: 'browser';
    visibilityAtStart: string;
    activationObservationLimitMs: number;
  };
  status: Outcome;
  activation: 'SUCCESS' | 'FAIL' | 'PENDING' | 'NOT RUN';
  anchor: 'SUCCESS' | 'FAIL' | 'NOT RUN';
  naturalCompletion: boolean;
  restarted: boolean;
  released: boolean | null;
  reason: string | null;
  anchors: AnchorRecord[];
  observations: ClockObservation[];
  preparations: Preparation[];
  events: { atMs: number; kind: string; detail?: string }[];
}

export interface Distribution {
  count: number;
  median: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

const generationReference = { minimumTrials: 3, medianLimitMs: 5_000, maxLimitMs: 10_000 } as const;

export function distribution(values: readonly number[]): Distribution {
  const ordered = values.filter(value => Number.isFinite(value) && value >= 0).sort((first, second) => first - second);
  const count = ordered.length;
  if (count === 0) return { count, median: null, p95: null, p99: null, max: null };

  const middle = Math.floor(count / 2);
  const middleValue = ordered[middle]!;
  const median = count % 2 ? middleValue : ordered[middle - 1]! / 2 + middleValue / 2;
  return { count, median, p95: ordered[Math.ceil(count * 95 / 100) - 1]!, p99: ordered[Math.ceil(count * 99 / 100) - 1]!, max: ordered[count - 1]! };
}

function groupFields(trial: Trial) {
  return {
    testCaseId: trial.testCaseId,
    testProfile: trial.testProfile,
    fixtureId: trial.fixtureId,
    fixtureHash: trial.fixtureHash,
    qaHarnessCommit: trial.qaHarnessCommit,
    productImplementationCommit: trial.productImplementationCommit,
    baselineCommit: trial.baselineCommit,
    environmentId: trial.testConditions.environmentId,
    deviceType: trial.deviceType,
    os: trial.os,
    browser: trial.browser,
    browserVersion: trial.browserVersion,
    audioOutputType: trial.audioOutputType,
    powerState: trial.testConditions.powerState,
    diagnosticsEnabled: trial.testConditions.diagnosticsEnabled,
    visibilityAtStart: trial.testConditions.visibilityAtStart,
    activationObservationLimitMs: trial.testConditions.activationObservationLimitMs,
    viewport: trial.viewport,
  };
}

function groupTrials(trials: readonly Trial[]) {
  const catalog = new Map<string, { condition: ReturnType<typeof groupFields>; trials: Trial[] }>();
  for (const trial of trials) {
    const condition = groupFields(trial);
    const key = JSON.stringify(condition);
    let group = catalog.get(key);
    if (!group) {
      group = { condition, trials: [] };
      catalog.set(key, group);
    }
    group.trials.push(trial);
  }
  return [...catalog.values()];
}

function summarizeCondition(trials: readonly Trial[], plannedTrials: number) {
  const completed = trials.filter(trial => trial.status !== 'NOT RUN');
  const preparations = completed.flatMap(trial => trial.preparations);
  const generationMs = distribution(preparations.map(preparation => preparation.generationMs));
  const validSamples: number[] = [];
  let invalidObservations = 0;
  let overLimitCount = 0;
  let firstOverLimit: { runId: string; trialId: string; generation: number; performanceNow: number; absoluteDifferenceMs: number } | null = null;
  for (const trial of completed) {
    for (const observation of trial.observations) {
      const difference = observation.absoluteDifferenceMs;
      if (!observation.valid || difference === null || !Number.isFinite(difference) || difference < 0) {
        invalidObservations++;
        continue;
      }
      validSamples.push(difference);
      // Boundary classification comes only from the product clock, never the displayed residual.
      if (observation.overLimit) {
        overLimitCount++;
        firstOverLimit ??= { runId: trial.runId, trialId: trial.trialId, generation: observation.generation,
          performanceNow: observation.performanceNow, absoluteDifferenceMs: difference };
      }
    }
  }

  return {
    plannedTrials,
    executedTrials: completed.length,
    successfulTrials: completed.filter(trial => trial.status === 'PASS').length,
    failedTrials: completed.filter(trial => trial.status === 'FAIL').length,
    blockedTrials: completed.filter(trial => trial.status === 'BLOCKED').length,
    abortedTrials: completed.filter(trial => trial.status === 'ABORTED').length,
    unexecutedTrials: Math.max(0, plannedTrials - completed.length),
    validObservations: validSamples.length,
    invalidObservations,
    generationMs,
    syncDifferenceMs: distribution(validSamples),
    overLimitCount,
    firstOverLimit,
    restartSuccesses: completed.filter(trial => trial.restarted).length,
  };
}

function assessGeneration(trials: readonly Trial[], generationMs: Distribution) {
  const preparations = trials.filter(trial => trial.status !== 'NOT RUN').flatMap(trial => trial.preparations);
  const resourceCapExceeded = preparations.some(preparation =>
    preparation.cacheCount > 1 || preparation.renderingCount > 1 || preparation.maxSimultaneousRenders > 1);
  const sufficient = generationMs.count >= generationReference.minimumTrials;
  const tooSlow = (generationMs.max ?? 0) > generationReference.maxLimitMs ||
    (sufficient && (generationMs.median ?? 0) > generationReference.medianLimitMs);
  const status: 'NOT RUN' | 'PASS' | 'FAIL' = resourceCapExceeded || tooSlow ? 'FAIL' : sufficient ? 'PASS' : 'NOT RUN';
  return { ...generationReference, status, sampleCount: generationMs.count, resourceCapExceeded };
}

export function summarize(trials: readonly Trial[], testCaseId?: TestCaseId) {
  const selectedCases = TEST_CASES.filter(testCase => testCaseId === undefined || testCase.id === testCaseId);
  const selected = testCaseId === undefined ? trials : trials.filter(trial => trial.testCaseId === testCaseId);
  const groups = groupTrials(selected);
  const plannedTrials = selectedCases.reduce((count, testCase) =>
    count + testCase.planned * Math.max(1, groups.filter(group => group.condition.testCaseId === testCase.id).length), 0);
  const result = summarizeCondition(selected, plannedTrials);
  // Cross-condition generation percentiles and timing gates stay in the per-condition groups.
  const conditions = groups.map(group => ({ condition: group.condition,
    ...assessGeneration(group.trials, summarizeCondition(group.trials, 0).generationMs) }));
  const mixedConditions = groups.length > 1;
  const emptyDistribution = distribution([]);
  return {
    ...result,
    generationMs: mixedConditions ? { ...emptyDistribution, count: result.generationMs.count } : result.generationMs,
    syncDifferenceMs: mixedConditions ? { ...emptyDistribution, count: result.syncDifferenceMs.count } : result.syncDifferenceMs,
    mixedConditions,
    generationPerformance: conditions,
  };
}

export function makeEvidence(trials: readonly Trial[]) {
  const groups = groupTrials(trials).map(group => {
    const planned = TEST_CASES.find(testCase => testCase.id === group.condition.testCaseId)!.planned;
    const summary = summarizeCondition(group.trials, planned);
    return { condition: group.condition, trialIds: group.trials.map(trial => trial.trialId),
      summary: { ...summary, generationPerformance: assessGeneration(group.trials, summary.generationMs) } };
  });
  return { schemaVersion: 1 as const, formalStatus: 'HOLD' as const, physicalDeviceVerified: false as const,
    percentileMethod: 'nearest-rank' as const, summary: summarize(trials), groups, trials: [...trials] };
}
