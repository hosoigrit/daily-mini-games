import type {
  AchievementId, AchievementRecord, ChartId, ClearRecord, CollectionRecord, CompiledChart, FailedRecord, FinalResult,
  GameSettings, JudgementCounts, MusicId, RecordUpdate, Result, ResultSummary, SaveDataV1, TutorialId, ValidationIssue,
  ValidationReport,
} from '../contracts/interface_contracts';
import { rankForScore } from './judgement-reducers';

export type SaveChartEntry = Pick<CompiledChart, 'chartId' | 'musicId' | 'difficulty' | 'totalJudgements' | 'durationUs'>;

const musicIds = ['music-01', 'music-02', 'music-03', 'music-04', 'music-05'] as const;
const suffixes = ['E', 'N', 'H'] as const;
const difficulties = { E: 'EASY', N: 'NORMAL', H: 'HARD' } as const;
const tutorialIds = ['TUT-01', 'TUT-02', 'TUT-03', 'TUT-04', 'TUT-05', 'TUT-06'] as const;
const chartIds = musicIds.flatMap(music => suffixes.map(suffix => `CHART-${music.slice(-2)}-${suffix}` as ChartId));

const saveFields = ['schemaVersion', 'saveEpoch', 'revision', 'settings', 'progress', 'records', 'collection', 'achievements', 'commitReceipt'];
const settingsFields = ['musicVolume', 'sfxVolume', 'noteSpeed', 'timingOffsetMs', 'showFastSlow', 'effectQuality', 'vibrationEnabled', 'keyBindings'];
const summaryFields = ['sessionId', 'score', 'rank', 'counts', 'maxCombo', 'remainingLifeUnits'];
const countFields = ['perfect', 'great', 'good', 'miss', 'unplayed', 'ghost'];
const clearFields = ['bestScore', 'bestRank', 'bestCombo', 'clearCount', 'fullComboAchieved', 'allPerfectAchieved', 'bestScoreResult'];
const failedFields = ['bestScore', 'bestProgressPermille', 'bestCombo', 'failureCount', 'latestResult', 'latestEndJudgeTimeUs'];
const resultFields = [...summaryFields, 'musicId', 'chartId', 'difficulty', 'outcome', 'totalJudgements', 'endJudgeTimeUs', 'durationUs'];

function initialSettings(): GameSettings {
  return { musicVolume: 70, sfxVolume: 50, noteSpeed: 1, timingOffsetMs: 0, showFastSlow: true,
    effectQuality: 'NORMAL', vibrationEnabled: false, keyBindings: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function count(value: unknown): value is number {
  return integer(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return count(value) && value > 0;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function uniqueStrings(value: unknown, allowed: (item: string) => boolean, length?: number): value is string[] {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function failure(code: 'ERR-012' | 'ERR-014' | 'ERR-018', messageKey: string): Result<never> {
  return { ok: false, error: { code, severity: 'ERROR', messageKey, recoverable: false } };
}

function checkSettings(value: unknown): ValidationIssue | null {
  if (!hasFields(value, settingsFields)) return issue('SD-V04', 'settings', 'Settings fields are invalid');
  for (const key of ['musicVolume', 'sfxVolume'] as const) {
    const volume = value[key];
    if (!count(volume) || volume > 100) return issue('SD-V04', `settings.${key}`, 'Volume must be an integer from 0 to 100');
  }
  const { noteSpeed, timingOffsetMs } = value;
  if (typeof noteSpeed !== 'number' || noteSpeed < 0.5 || noteSpeed > 2 || !integer(noteSpeed * 10)) {
    return issue('SD-V04', 'settings.noteSpeed', 'Note speed must be from 0.5 to 2.0 in steps of 0.1');
  }
  if (!integer(timingOffsetMs) || Math.abs(timingOffsetMs) > 200 || timingOffsetMs % 5 !== 0) {
    return issue('SD-V04', 'settings.timingOffsetMs', 'Timing offset must be from −200 to 200 ms in steps of 5');
  }
  if (typeof value.showFastSlow !== 'boolean' || typeof value.vibrationEnabled !== 'boolean'
      || (value.effectQuality !== 'NORMAL' && value.effectQuality !== 'LIGHT')) {
    return issue('SD-V04', 'settings', 'An effect or display setting is invalid');
  }
  if (!uniqueStrings(value.keyBindings, key => /^(?:Key[A-Z]|Digit[0-9])$/.test(key), 4)) {
    return issue('SD-V05', 'settings.keyBindings', 'Four unique letter or digit key codes are required');
  }
  return null;
}

function scoreMatchesRank(score: unknown, rank: unknown): boolean {
  if (!count(score)) return false;
  const classified = rankForScore(score);
  return classified.ok && classified.value === rank;
}

function expectedScore(counts: JudgementCounts, total: number): number {
  const weight = 10n * BigInt(counts.perfect) + 7n * BigInt(counts.great) + 3n * BigInt(counts.good);
  const denominator = 10n * BigInt(total);
  // Recheck the persisted score against the approved integer rounding and ghost penalty.
  const score = (2_000_000n * weight + denominator) / (2n * denominator) - 1_000n * BigInt(counts.ghost);
  return score < 0n ? 0 : Number(score);
}

function checkSummary(summary: Record<string, unknown>, entry: SaveChartEntry, clear: boolean, path: string): ValidationIssue | null {
  if (!text(summary.sessionId)) return issue('SD-V06', `${path}.sessionId`, 'A session ID is required');
  if (!count(summary.score) || summary.score > 1_000_000) return issue('SD-V07', `${path}.score`, 'Score is out of range');
  if (!scoreMatchesRank(summary.score, summary.rank)) return issue('SD-V08', `${path}.rank`, 'Rank does not match the score');
  const rawCounts = summary.counts;
  if (!hasFields(rawCounts, countFields) || !countFields.every(field => count(rawCounts[field]))) {
    return issue('SD-V09', `${path}.counts`, 'Judgement counts must be nonnegative safe integers');
  }
  const counts = rawCounts as unknown as JudgementCounts;
  const successful = counts.perfect + counts.great + counts.good;
  if (successful + counts.miss + counts.unplayed !== entry.totalJudgements || (clear && counts.unplayed !== 0)) {
    return issue('SD-V09', `${path}.counts`, 'Judgement counts do not match the chart and outcome');
  }
  if (summary.score !== expectedScore(counts, entry.totalJudgements)) return issue('SD-V08', `${path}.score`, 'Score does not match the judgements');
  if (!count(summary.maxCombo) || summary.maxCombo > successful
      || (clear && fullCombo(counts) && summary.maxCombo !== entry.totalJudgements)) {
    return issue('SD-V09', `${path}.maxCombo`, 'Combo is inconsistent with successful judgements');
  }
  const life = summary.remainingLifeUnits;
  if (!count(life) || life > 200 || (clear ? life === 0 : life !== 0)) {
    return issue('SD-V10', `${path}.remainingLifeUnits`, 'Life does not match the outcome');
  }
  return null;
}

function fullCombo(counts: JudgementCounts): boolean {
  return counts.miss === 0 && counts.unplayed === 0 && counts.ghost === 0;
}

function allPerfect(counts: JudgementCounts, total: number): boolean {
  return counts.perfect === total && counts.ghost === 0;
}

function checkClear(record: unknown, entry: SaveChartEntry, path: string): ValidationIssue | null {
  if (!hasFields(record, clearFields)) return issue('SD-V06', path, 'Clear record fields are invalid');
  if (!positive(record.clearCount)) return issue('SD-V15', `${path}.clearCount`, 'Clear count must be a positive safe integer');
  if (!count(record.bestScore) || record.bestScore > 1_000_000) return issue('SD-V07', `${path}.bestScore`, 'Best score is out of range');
  if (!scoreMatchesRank(record.bestScore, record.bestRank)) return issue('SD-V08', `${path}.bestRank`, 'Best rank does not match the best score');
  if (!hasFields(record.bestScoreResult, summaryFields)) return issue('SD-V06', `${path}.bestScoreResult`, 'Result fields are invalid');

  const summaryIssue = checkSummary(record.bestScoreResult, entry, true, `${path}.bestScoreResult`);
  if (summaryIssue) return summaryIssue;
  const summary = record.bestScoreResult as unknown as ResultSummary;
  if (summary.score !== record.bestScore) return issue('SD-V08', `${path}.bestScoreResult.score`, 'The retained result must have the best score');
  if (!count(record.bestCombo) || record.bestCombo < summary.maxCombo || record.bestCombo > entry.totalJudgements) {
    return issue('SD-V09', `${path}.bestCombo`, 'Best combo is inconsistent');
  }
  if (typeof record.fullComboAchieved !== 'boolean' || typeof record.allPerfectAchieved !== 'boolean'
      || (record.fullComboAchieved && record.bestCombo !== entry.totalJudgements)
      || (record.allPerfectAchieved && (!record.fullComboAchieved || record.bestScore !== 1_000_000))
      || (fullCombo(summary.counts) && !record.fullComboAchieved)
      || (allPerfect(summary.counts, entry.totalJudgements) && !record.allPerfectAchieved)) {
    return issue('SD-V09', path, 'Completion flags are inconsistent');
  }
  return null;
}

function progressPermille(endJudgeTimeUs: number, durationUs: number): number {
  return Math.max(0, Math.min(1, endJudgeTimeUs / durationUs)) * 1_000;
}

function checkFailed(record: unknown, entry: SaveChartEntry, path: string): ValidationIssue | null {
  if (!hasFields(record, failedFields)) return issue('SD-V06', path, 'Failed record fields are invalid');
  if (!positive(record.failureCount)) return issue('SD-V15', `${path}.failureCount`, 'Failure count must be a positive safe integer');
  if (!count(record.bestScore) || record.bestScore > 1_000_000) return issue('SD-V07', `${path}.bestScore`, 'Best score is out of range');
  if (!hasFields(record.latestResult, summaryFields)) return issue('SD-V06', `${path}.latestResult`, 'Result fields are invalid');

  const summaryIssue = checkSummary(record.latestResult, entry, false, `${path}.latestResult`);
  if (summaryIssue) return summaryIssue;
  const latest = record.latestResult as unknown as ResultSummary;
  if (latest.score > record.bestScore) return issue('SD-V07', `${path}.bestScore`, 'The best score is below the latest score');
  if (!count(record.bestCombo) || record.bestCombo < latest.maxCombo || record.bestCombo > entry.totalJudgements) {
    return issue('SD-V09', `${path}.bestCombo`, 'Best combo is inconsistent');
  }
  if (!integer(record.latestEndJudgeTimeUs)) return issue('SD-V09', `${path}.latestEndJudgeTimeUs`, 'The end time must be integer microseconds');
  const best = record.bestProgressPermille;
  if (typeof best !== 'number' || !Number.isFinite(best) || best > 1_000
      || best < progressPermille(record.latestEndJudgeTimeUs, entry.durationUs)) {
    return issue('SD-V09', `${path}.bestProgressPermille`, 'Best progress is inconsistent with the end time');
  }
  return null;
}

function hasMusicClear(records: SaveDataV1['records'], music: MusicId): boolean {
  return suffixes.some(suffix => !!records[`CHART-${music.slice(-2)}-${suffix}` as ChartId]?.clear);
}

function unlockedTracks(records: SaveDataV1['records']): readonly MusicId[] {
  const result: MusicId[] = [musicIds[0]];
  for (let i = 1; i < musicIds.length; i++) {
    if (!hasMusicClear(records, musicIds[i - 1]!)) break;
    result.push(musicIds[i]!);
  }
  return result;
}

function achieved(records: SaveDataV1['records']): Readonly<Record<AchievementId, boolean>> {
  const clears = Object.values(records).map(record => record.clear);
  return {
    'ACH-01': clears.some(clear => clear !== null),
    'ACH-02': clears.some(clear => clear?.fullComboAchieved === true),
    'ACH-03': clears.some(clear => clear?.allPerfectAchieved === true),
    'ACH-04': musicIds.every(music => hasMusicClear(records, music)),
    'ACH-05': chartIds.every(chart => !!records[chart]?.clear),
    'ACH-06': musicIds.every(music => !!records[`CHART-${music.slice(-2)}-H` as ChartId]?.clear),
    'ACH-07': chartIds.every(chart => records[chart]?.clear?.bestRank === 'S' || records[chart]?.clear?.bestRank === 'SS'),
    'ACH-08': chartIds.every(chart => records[chart]?.clear?.allPerfectAchieved === true),
  };
}

function checkAchievements(values: unknown, records: SaveDataV1['records']): ValidationIssue | null {
  if (!Array.isArray(values)) return issue('SD-V12', 'achievements', 'Achievements must be an array');
  const earned = achieved(records);
  const ids = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!hasFields(value, ['achievementId', 'unlockedAt']) || !text(value.achievementId)
        || ids.has(value.achievementId) || earned[value.achievementId as AchievementId] !== true || !text(value.unlockedAt)) {
      return issue('SD-V12', `achievements.${index}`, 'An achievement is unknown, duplicate, unearned or missing its timestamp');
    }
    ids.add(value.achievementId);
  }
  return null;
}

function addAchievements(records: SaveDataV1['records'], existing: readonly AchievementRecord[], recordedAt: string) {
  const previousIds = new Set(existing.map(item => item.achievementId));
  const ids = (Object.entries(achieved(records)) as [AchievementId, boolean][])
    .filter(([id, earned]) => earned && !previousIds.has(id)).map(([id]) => id);
  return { ids, records: [...existing, ...ids.map(achievementId => ({ achievementId, unlockedAt: recordedAt }))] };
}

function checkReceipt(receipt: unknown, epoch: string, revision: number): ValidationIssue | null {
  if (receipt === null) return null;
  if (!hasFields(receipt, ['sessionId', 'saveEpoch', 'revision', 'resultDigest']) || !text(receipt.sessionId)
      || receipt.saveEpoch !== epoch || !positive(receipt.revision) || receipt.revision > revision || !text(receipt.resultDigest)) {
    return issue('SD-V14', 'commitReceipt', 'The receipt does not belong to this save epoch and revision');
  }
  return null;
}

function summaryOf(result: FinalResult): ResultSummary {
  return { sessionId: result.sessionId, score: result.score, rank: result.rank, counts: { ...result.counts },
    maxCombo: result.maxCombo, remainingLifeUnits: result.remainingLifeUnits };
}

function nextClear(previous: ClearRecord | null, result: FinalResult): ClearRecord {
  const exceedsBest = !previous || result.score > previous.bestScore;
  return {
    bestScore: exceedsBest ? result.score : previous.bestScore,
    bestRank: exceedsBest ? result.rank : previous.bestRank,
    bestCombo: Math.max(result.maxCombo, previous?.bestCombo ?? 0),
    clearCount: (previous?.clearCount ?? 0) + 1,
    fullComboAchieved: !!previous?.fullComboAchieved || fullCombo(result.counts),
    allPerfectAchieved: !!previous?.allPerfectAchieved || allPerfect(result.counts, result.totalJudgements),
    bestScoreResult: exceedsBest ? summaryOf(result) : previous.bestScoreResult,
  };
}

function nextFailed(previous: FailedRecord | null, result: FinalResult): FailedRecord {
  return {
    bestScore: Math.max(result.score, previous?.bestScore ?? 0),
    bestProgressPermille: Math.max(progressPermille(result.endJudgeTimeUs, result.durationUs), previous?.bestProgressPermille ?? 0),
    bestCombo: Math.max(result.maxCombo, previous?.bestCombo ?? 0),
    failureCount: (previous?.failureCount ?? 0) + 1,
    latestResult: summaryOf(result), latestEndJudgeTimeUs: result.endJudgeTimeUs,
  };
}

export function createSaveRules(catalog: readonly SaveChartEntry[]) {
  const catalogById = new Map<string, SaveChartEntry>();
  for (const entry of catalog) {
    const chart = entry.chartId;
    if (!chartIds.includes(chart) || entry.musicId !== `music-${chart.slice(6, 8)}`
        || entry.difficulty !== difficulties[chart.at(-1) as keyof typeof difficulties]
        || !positive(entry.totalJudgements) || !positive(entry.durationUs) || catalogById.has(chart)) {
      throw new RangeError('Save chart catalog contains invalid or duplicate metadata');
    }
    catalogById.set(chart, { chartId: chart, musicId: entry.musicId, difficulty: entry.difficulty,
      totalJudgements: entry.totalJudgements, durationUs: entry.durationUs });
  }

  function inspectSave(value: unknown): ValidationIssue | null {
    if (!isObject(value)) return issue('SD-V01', '$', 'A saved JSON object is required');
    if (integer(value.schemaVersion) && value.schemaVersion !== 1) return issue('SD-V02', 'schemaVersion', 'Unknown schema version');
    if (value.schemaVersion !== 1 || !hasFields(value, saveFields)) return issue('SD-V01', '$', 'Save fields are invalid');
    if (!text(value.saveEpoch)) return issue('SD-V03', 'saveEpoch', 'A save epoch is required');
    if (typeof value.revision === 'number' && value.revision < 0) return issue('SD-V03', 'revision', 'Revision must be nonnegative');
    if (!count(value.revision)) return issue('SD-V15', 'revision', 'Revision must be a safe integer');

    const invalidSettings = checkSettings(value.settings);
    if (invalidSettings) return invalidSettings;
    if (!isObject(value.records) || !isObject(value.collection)) return issue('SD-V06', 'records', 'Record maps are required');
    for (const [chartId, record] of Object.entries(value.records)) {
      const entry = catalogById.get(chartId);
      const path = `records.${chartId}`;
      if (!entry || !hasFields(record, ['clear', 'failed'])) return issue('SD-V06', path, 'Chart record is unknown or malformed');
      const invalidClear = record.clear === null ? null : checkClear(record.clear, entry, `${path}.clear`);
      if (invalidClear) return invalidClear;
      const invalidFailed = record.failed === null ? null : checkFailed(record.failed, entry, `${path}.failed`);
      if (invalidFailed) return invalidFailed;
    }

    const records = value.records as SaveDataV1['records'];
    for (const [chartId, item] of Object.entries(value.collection)) {
      const entry = catalogById.get(chartId);
      const path = `collection.${chartId}`;
      if (!entry || !hasFields(item, ['musicId', 'chartId', 'bestQuality']) || item.musicId !== entry.musicId || item.chartId !== chartId) {
        return issue('SD-V06', path, 'Collection IDs do not match the chart');
      }
      const expected = records[entry.chartId]?.clear?.bestRank;
      if (expected === undefined || item.bestQuality !== expected) return issue('SD-V11', `${path}.bestQuality`, 'Quality must match the best clear rank');
    }
    for (const [id, record] of Object.entries(records)) {
      if (record.clear && !Object.hasOwn(value.collection, id)) return issue('SD-V11', `collection.${id}`, 'A cleared chart is missing its collection record');
    }

    const expectedTracks = unlockedTracks(records);
    if (!hasFields(value.progress, ['unlockedMusicIds', 'completedTutorialIds'])
        || !uniqueStrings(value.progress.unlockedMusicIds, music => expectedTracks.some(expected => expected === music), expectedTracks.length)
        || !uniqueStrings(value.progress.completedTutorialIds, id => tutorialIds.some(expected => expected === id))) {
      return issue('SD-V13', 'progress', 'Unlock sequence or tutorial progress is inconsistent');
    }
    if (Object.keys(records).some(id => !expectedTracks.includes(catalogById.get(id)!.musicId))) {
      return issue('SD-V13', 'records', 'A record belongs to a locked track');
    }
    return checkAchievements(value.achievements, records) ?? checkReceipt(value.commitReceipt, value.saveEpoch, value.revision);
  }

  function validateSaveData(value: unknown): ValidationReport {
    try {
      const problem = inspectSave(value);
      return { valid: problem === null, issues: problem ? [problem] : [] };
    } catch {
      return { valid: false, issues: [issue('SD-V01', '$', 'Save values cannot be read')] };
    }
  }

  function validateSave(value: unknown): Result<SaveDataV1> {
    const problem = validateSaveData(value).issues[0];
    if (problem) return failure(problem.code === 'SD-V02' ? 'ERR-014' : 'ERR-012', `save.${problem.code}`);
    return { ok: true, value: value as SaveDataV1 };
  }

  function parseSave(raw: string): Result<SaveDataV1> {
    if (typeof raw !== 'string') return failure('ERR-012', 'save.SD-V01');
    try {
      return validateSave(JSON.parse(raw) as unknown);
    } catch {
      return failure('ERR-012', 'save.SD-V01');
    }
  }

  function createInitialSave(epoch: string): Result<SaveDataV1> {
    if (!text(epoch)) return failure('ERR-018', 'save.invalidEpoch');
    return { ok: true, value: { schemaVersion: 1, saveEpoch: epoch, revision: 0, settings: initialSettings(),
      progress: { unlockedMusicIds: [musicIds[0]], completedTutorialIds: [] }, records: {}, collection: {},
      achievements: [], commitReceipt: null } };
  }

  function buildRecordUpdate(save: SaveDataV1, result: FinalResult, recordedAt: string): Result<RecordUpdate> {
    const baseline = validateSave(save);
    if (!baseline.ok) return baseline;
    try {
      const entry = catalogById.get(result?.chartId);
      if (!entry || !hasFields(result, resultFields) || !text(recordedAt) || result.musicId !== entry.musicId
          || result.difficulty !== entry.difficulty || result.totalJudgements !== entry.totalJudgements
          || result.durationUs !== entry.durationUs || !integer(result.endJudgeTimeUs)
          || (result.outcome !== 'CLEAR' && result.outcome !== 'FAILED') || !save.progress.unlockedMusicIds.includes(entry.musicId)
          || checkSummary(result, entry, result.outcome === 'CLEAR', 'result')) {
        return failure('ERR-018', 'save.invalidResult');
      }

      const prior = save.records[entry.chartId];
      if (result.outcome === 'FAILED') {
        const failed = nextFailed(prior?.failed ?? null, result);
        if (!positive(failed.failureCount)) return failure('ERR-018', 'save.failureCountOverflow');
        const records = { ...save.records, [entry.chartId]: { clear: prior?.clear ?? null, failed } };
        return { ok: true, value: { data: { ...save, records }, newAchievements: [], newlyUnlocked: [] } };
      }

      const clear = nextClear(prior?.clear ?? null, result);
      if (!positive(clear.clearCount)) return failure('ERR-018', 'save.clearCountOverflow');
      const records = { ...save.records, [entry.chartId]: { clear, failed: prior?.failed ?? null } };
      const item: CollectionRecord = { chartId: entry.chartId, musicId: entry.musicId, bestQuality: clear.bestRank };
      const unlockedMusicIds = unlockedTracks(records);
      const newlyUnlocked = unlockedMusicIds.filter(id => !save.progress.unlockedMusicIds.includes(id));
      const achievements = addAchievements(records, save.achievements, recordedAt);
      const data: SaveDataV1 = { ...save, records, collection: { ...save.collection, [entry.chartId]: item },
        progress: { ...save.progress, unlockedMusicIds }, achievements: achievements.records };
      return { ok: true, value: { data, newAchievements: achievements.ids, newlyUnlocked } };
    } catch {
      return failure('ERR-018', 'save.invalidResult');
    }
  }

  function updateSettings(save: SaveDataV1, settings: GameSettings): Result<SaveDataV1> {
    const baseline = validateSave(save);
    if (!baseline.ok) return baseline;
    try {
      if (checkSettings(settings)) return failure('ERR-018', 'save.invalidSettings');
      return { ok: true, value: { ...save, settings: { ...settings, keyBindings: [...settings.keyBindings] } } };
    } catch {
      return failure('ERR-018', 'save.invalidSettings');
    }
  }

  function resetSettings(save: SaveDataV1): Result<SaveDataV1> {
    return updateSettings(save, initialSettings());
  }

  function resetProgress(save: SaveDataV1, newEpoch: string): Result<SaveDataV1> {
    const baseline = validateSave(save);
    if (!baseline.ok) return baseline;
    if (!text(newEpoch) || newEpoch === save.saveEpoch) return failure('ERR-018', 'save.invalidEpoch');
    const reset = createInitialSave(newEpoch);
    return reset.ok ? { ok: true, value: { ...reset.value, settings: save.settings } } : reset;
  }

  function completePractice(save: SaveDataV1, tutorialId: TutorialId): Result<SaveDataV1> {
    const baseline = validateSave(save);
    if (!baseline.ok) return baseline;
    if (!tutorialIds.includes(tutorialId)) return failure('ERR-018', 'save.invalidTutorial');
    const previous = save.progress.completedTutorialIds;
    if (previous.includes(tutorialId)) return baseline;
    return { ok: true, value: { ...save, progress: { ...save.progress, completedTutorialIds: [...previous, tutorialId] } } };
  }

  return { createInitialSave, parseSave, validateSave, validateSaveData, buildRecordUpdate,
    updateSettings, resetSettings, resetProgress, completePractice };
}
