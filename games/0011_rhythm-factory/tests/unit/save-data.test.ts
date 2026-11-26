import { describe, expect, it } from 'vitest';
import type {
  ChartId, Contracts, FinalResult, JudgementCounts, Rank, Result, SaveDataV1, TutorialId, Us,
} from '../../src/contracts/interface_contracts';
import { createSaveRules, type SaveChartEntry } from '../../src/domain/save-data';
import { rankForScore } from '../../src/domain/judgement-reducers';

const durationUs = 2_000_000 as Us;
const timestamp = '2026-11-26T01:23:45Z';
const chart = 'CHART-01-N';
const catalog: SaveChartEntry[] = (['01', '02', '03', '04', '05'] as const).flatMap(music =>
  (['E', 'N', 'H'] as const).map(suffix => ({ chartId: `CHART-${music}-${suffix}`,
    musicId: `music-${music}`, difficulty: { E: 'EASY', N: 'NORMAL', H: 'HARD' }[suffix] as SaveChartEntry['difficulty'],
    totalJudgements: 20, durationUs })));
const rules = createSaveRules(catalog);
const buildRecordUpdate: Contracts['buildRecordUpdate'] = rules.buildRecordUpdate;

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.messageKey);
  return result.value;
}

function initial(): SaveDataV1 {
  return value(rules.createInitialSave('E0'));
}

function result(chartId: ChartId, sessionId: string, override: Partial<FinalResult> = {}): FinalResult {
  const entry = catalog.find(item => item.chartId === chartId)!;
  return { ...entry, sessionId, outcome: 'CLEAR', score: 1_000_000, rank: 'SS',
    counts: { perfect: 20, great: 0, good: 0, miss: 0, ghost: 0, unplayed: 0 }, maxCombo: 20,
    remainingLifeUnits: 200, endJudgeTimeUs: durationUs, ...override };
}

function performance(counts: Partial<JudgementCounts>, score: number, maxCombo: number) {
  return { counts: { perfect: 0, great: 0, good: 0, miss: 0, ghost: 0, unplayed: 0, ...counts },
    score, rank: value(rankForScore(score)), maxCombo };
}

function update(save: SaveDataV1, final: FinalResult, now = timestamp): SaveDataV1 {
  const next = value(buildRecordUpdate(save, final, now)).data;
  expect(rules.validateSaveData(next)).toEqual({ valid: true, issues: [] });
  return next;
}

function saveWithClear() {
  return update(initial(), result(chart, 'first-clear', performance({ perfect: 19, miss: 1 }, 950_000, 10)));
}

function failed(sessionId = 'failed', endJudgeTimeUs = 1_000_000 as Us): FinalResult {
  return result(chart, sessionId, { outcome: 'FAILED', remainingLifeUnits: 0, endJudgeTimeUs,
    ...performance({ perfect: 7, miss: 13 }, 350_000, 7) });
}

function expectError(result: Result<unknown>, code: 'ERR-012' | 'ERR-014' | 'ERR-018'): void {
  expect(result).toMatchObject({ ok: false, error: { code } });
}

describe('SaveDataV1 defaults and SD-V01 through SD-V15', () => {
  it('TC-D3-041 prepares defaults, Track01, epoch and revision with no progress', () => {
    expect(initial()).toEqual({ schemaVersion: 1, saveEpoch: 'E0', revision: 0,
      settings: { musicVolume: 70, sfxVolume: 50, noteSpeed: 1, timingOffsetMs: 0, showFastSlow: true,
        effectQuality: 'NORMAL', vibrationEnabled: false, keyBindings: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'] },
      progress: { unlockedMusicIds: ['music-01'], completedTutorialIds: [] },
      records: {}, collection: {}, achievements: [], commitReceipt: null });
  });

  it('TC-D3-052 classifies malformed text and unknown schema without replacing either raw value', () => {
    const invalid = '{invalid';
    const newer = JSON.stringify({ ...initial(), schemaVersion: 999 });
    expectError(rules.parseSave(invalid), 'ERR-012');
    expectError(rules.parseSave(newer), 'ERR-014');
    expect(invalid).toBe('{invalid');
    expect(JSON.parse(newer)).toMatchObject({ schemaVersion: 999 });
    expect(rules.parseSave(JSON.stringify(initial()))).toEqual({ ok: true, value: initial() });
  });

  it('TC-D4-063 and TC-D5-027 identify each independent malformed value by field and code', () => {
    const clearSave = saveWithClear();
    const both = update(clearSave, failed());
    const records = both.records;
    const entry = records[chart]!;
    const clear = entry.clear!;
    const failure = entry.failed!;
    const quality = both.collection[chart]!;
    const validReceipt = { sessionId: 'first-clear', saveEpoch: both.saveEpoch, revision: 1, resultDigest: 'identity-digest' };
    const receiptSave = { ...both, revision: 3, commitReceipt: validReceipt };
    const clearPatch = (patch: Partial<typeof clear>) =>
      ({ ...both, records: { ...records, [chart]: { ...entry, clear: { ...clear, ...patch } } } });
    const failedPatch = (patch: Partial<typeof failure>) =>
      ({ ...both, records: { ...records, [chart]: { ...entry, failed: { ...failure, ...patch } } } });
    const qualityPatch = (patch: object) => ({ ...both, collection: { ...both.collection, [chart]: { ...quality, ...patch } } });
    const root = `records.${chart}`;
    const cases: readonly (readonly [string, string, unknown])[] = [
      ['SD-V01', '$', { ...both, unexpected: 1 }],
      ['SD-V02', 'schemaVersion', { ...both, schemaVersion: 999 }],
      ['SD-V03', 'saveEpoch', { ...both, saveEpoch: '' }],
      ['SD-V03', 'revision', { ...both, revision: -1 }],
      ['SD-V04', 'settings.musicVolume', { ...both, settings: { ...both.settings, musicVolume: 101 } }],
      ['SD-V04', 'settings.timingOffsetMs', { ...both, settings: { ...both.settings, timingOffsetMs: 201 } }],
      ['SD-V05', 'settings.keyBindings', { ...both, settings: { ...both.settings, keyBindings: ['KeyD', 'KeyD', 'KeyJ', 'KeyK'] } }],
      ['SD-V06', 'records.CHART-99-N', { ...both, records: { ...records, 'CHART-99-N': entry } }],
      ['SD-V06', `collection.${chart}`, qualityPatch({ musicId: 'music-05' })],
      ['SD-V07', `${root}.clear.bestScore`, clearPatch({ bestScore: 1_000_001 })],
      ['SD-V08', `${root}.clear.bestScoreResult.rank`, clearPatch({ bestScoreResult: { ...clear.bestScoreResult, rank: 'D' } })],
      ['SD-V09', `${root}.clear.bestScoreResult.counts`, clearPatch({ bestScoreResult: { ...clear.bestScoreResult,
        counts: { ...clear.bestScoreResult.counts, perfect: 18 } } })],
      ['SD-V10', `${root}.clear.bestScoreResult.remainingLifeUnits`, clearPatch({ bestScoreResult: { ...clear.bestScoreResult, remainingLifeUnits: 0 } })],
      ['SD-V10', `${root}.failed.latestResult.remainingLifeUnits`, failedPatch({ latestResult: { ...failure.latestResult, remainingLifeUnits: 1 } })],
      ['SD-V11', `collection.${chart}.bestQuality`, qualityPatch({ bestQuality: 'D' })],
      ['SD-V12', 'achievements.0', { ...both, achievements: [{ achievementId: 'ACH-99', unlockedAt: timestamp }] }],
      ['SD-V12', 'achievements.1', { ...both, achievements: [...both.achievements, both.achievements[0]] }],
      ['SD-V12', 'achievements.1', { ...both, achievements: [...both.achievements, { achievementId: 'ACH-08', unlockedAt: timestamp }] }],
      ['SD-V13', 'progress', { ...both, progress: { ...both.progress, unlockedMusicIds: ['music-01', 'music-02', 'music-03'] } }],
      ['SD-V14', 'commitReceipt', { ...receiptSave, commitReceipt: { ...validReceipt, saveEpoch: 'E1' } }],
      ['SD-V14', 'commitReceipt', { ...receiptSave, commitReceipt: { ...validReceipt, revision: 4 } }],
      ['SD-V15', `${root}.clear.clearCount`, clearPatch({ clearCount: -1 })],
      ['SD-V15', `${root}.failed.failureCount`, failedPatch({ failureCount: 1.5 })],
      ['SD-V15', 'revision', { ...both, revision: Number.MAX_SAFE_INTEGER + 1 }],
    ];
    for (const [code, path, test] of cases) {
      expect(rules.validateSaveData(test), code).toMatchObject({ valid: false, issues: [{ code, path }] });
      expectError(rules.validateSave(test), code === 'SD-V02' ? 'ERR-014' : 'ERR-012');
    }
    expect(rules.validateSave(receiptSave)).toEqual({ ok: true, value: receiptSave });
  });

  it('rejects valid-looking chart IDs omitted from the supplied catalog and invalid settings variants', () => {
    const reducedRules = createSaveRules(catalog.filter(entry => entry.chartId !== chart));
    expectError(reducedRules.validateSave(saveWithClear()), 'ERR-012');
    const save = initial();
    expectError(rules.updateSettings(save, { ...save.settings, noteSpeed: 1.27 }), 'ERR-018');
    expectError(rules.updateSettings(save, { ...save.settings, timingOffsetMs: 7 }), 'ERR-018');
    expectError(rules.updateSettings(save, { ...save.settings, keyBindings: ['Escape', 'KeyF', 'KeyJ', 'KeyK'] }), 'ERR-018');
  });
});

describe('IF-12 pure record updates', () => {
  it('TC-D4-012 and TC-D3-042 proposes a CLEAR record, collection, sequential unlock and three achievements', () => {
    const original = initial();
    const copy = structuredClone(original);
    const outcome = value(buildRecordUpdate(original, result(chart, 'perfect'), timestamp));
    expect(original).toEqual(copy);
    expect(outcome.newAchievements).toEqual(['ACH-01', 'ACH-02', 'ACH-03']);
    expect(outcome.newlyUnlocked).toEqual(['music-02']);
    expect(outcome.data).toMatchObject({ revision: 0, commitReceipt: null,
      progress: { unlockedMusicIds: ['music-01', 'music-02'] },
      records: { [chart]: { clear: { bestScore: 1_000_000, bestRank: 'SS', bestCombo: 20, clearCount: 1,
        allPerfectAchieved: true, fullComboAchieved: true }, failed: null } },
      collection: { [chart]: { musicId: 'music-01', chartId: chart, bestQuality: 'SS' } } });
    expect(outcome.data.achievements.every(item => item.unlockedAt === timestamp)).toBe(true);
    expect(rules.validateSaveData(outcome.data).valid).toBe(true);
  });

  it('TC-D3-045 and TC-D4-066 updates separate combo and completion flags and retains the highest or tied result', () => {
    const best = saveWithClear();
    const weaker = result(chart, 'weaker', performance({ great: 20 }, 700_000, 20));
    const next = update(best, weaker);
    const tie = result(chart, 'tie', performance({ perfect: 19, miss: 1 }, 950_000, 19));
    const last = update(next, tie);
    expect(last.records[chart]?.clear).toMatchObject({ bestScore: 950_000, bestRank: 'S', clearCount: 3, bestCombo: 20,
      fullComboAchieved: true, allPerfectAchieved: false, bestScoreResult: { sessionId: 'first-clear' } });
    expect(last.collection[chart]?.bestQuality).toBe('S');
    expect(best.records[chart]?.clear?.bestCombo).toBe(10);
  });

  it('TC-D3-046 separates FAILED reference records, best values and latest attempt', () => {
    const clear = result(chart, 'prior-d', performance({ good: 20 }, 300_000, 20));
    const previous = update(initial(), clear);
    const first = update(previous, failed('longer', 1_600_000 as Us));
    const final = failed('latest', 1_400_000 as Us);
    const second = update(first, { ...final, ...performance({ perfect: 6, miss: 13, unplayed: 1 }, 300_000, 6) });
    expect(second.records[chart]?.clear).toEqual(previous.records[chart]?.clear);
    expect(second.collection).toEqual(previous.collection);
    expect(second.achievements).toEqual(previous.achievements);
    expect(second.progress).toEqual(previous.progress);
    expect(second.records[chart]?.failed).toMatchObject({ bestScore: 350_000, bestProgressPermille: 800,
      bestCombo: 7, failureCount: 2, latestEndJudgeTimeUs: 1_400_000, latestResult: { sessionId: 'latest', score: 300_000 } });
  });

  it('TC-D5-008 clamps exact and fractional FAILED progress from logical endJudgeTime', () => {
    for (const [endJudgeTimeUs, expected] of [[-1, 0], [0, 0], [1, 0.0005], [1_000_000, 500], [2_000_000, 1000], [2_000_001, 1000]] as const) {
      const next = update(initial(), failed('clamped', endJudgeTimeUs as Us));
      expect(next.records[chart]?.failed?.bestProgressPermille).toBe(expected);
      expect(next.progress.unlockedMusicIds).toEqual(['music-01']);
      expect(next.achievements).toEqual([]);
    }
  });

  it('TC-D4-064 and TC-D4-065 unlocks across any difficulty and retains all eight achievement timestamps', () => {
    let save = initial();
    for (const entry of catalog) save = update(save, result(entry.chartId, `pass-${entry.chartId}`));
    expect(Object.keys(save.collection)).toHaveLength(15);
    expect(save.progress.unlockedMusicIds).toEqual(['music-01', 'music-02', 'music-03', 'music-04', 'music-05']);
    expect(save.achievements.map(item => item.achievementId).sort()).toEqual(
      ['ACH-01', 'ACH-02', 'ACH-03', 'ACH-04', 'ACH-05', 'ACH-06', 'ACH-07', 'ACH-08']);
    const replay = value(buildRecordUpdate(save, result(chart, 'replay'), '2026-11-27T00:00:00Z'));
    expect(replay.newAchievements).toEqual([]);
    expect(replay.newlyUnlocked).toEqual([]);
    expect(replay.data.achievements).toEqual(save.achievements);
  });

  it.each(['E', 'N', 'H'] as const)('TC-D4-065 independently unlocks the next track on a %s clear', suffix => {
    let save = initial();
    for (const [index, music] of (['01', '02', '03', '04', '05'] as const).entries()) {
      const next = value(buildRecordUpdate(save, result(`CHART-${music}-${suffix}`, `pass-${music}`), timestamp));
      expect(next.newlyUnlocked).toEqual(index === 4 ? [] : [`music-0${index + 2}`]);
      expect(rules.validateSaveData(next.data).valid).toBe(true);
      save = next.data;
    }
    expect(save.progress.unlockedMusicIds).toHaveLength(5);
  });

  it('rejects any inconsistent or nonformal result, a locked chart, and count overflow', () => {
    const save = initial();
    const valid = result(chart, 'session');
    for (const rejected of [
      { ...valid, outcome: 'ABORTED' as FinalResult['outcome'] }, { ...valid, outcome: 'ERROR' as FinalResult['outcome'] },
      { ...valid, difficulty: 'HARD' as const }, { ...valid, musicId: 'music-02' as const }, { ...valid, rank: 'D' as Rank },
      { ...valid, durationUs: 1_000_000 as Us }, { ...valid, totalJudgements: 19 }, { ...valid, remainingLifeUnits: 0 },
      { ...valid, score: 980_001 }, { ...valid, maxCombo: 1 }, result('CHART-02-N', 'locked'),
    ]) expectError(buildRecordUpdate(save, rejected, timestamp), 'ERR-018');
    const existing = saveWithClear();
    const record = existing.records[chart]!;
    const exhausted: SaveDataV1 = { ...existing, records: { ...existing.records, [chart]: { ...record,
      clear: { ...record.clear!, clearCount: Number.MAX_SAFE_INTEGER } } } };
    expectError(buildRecordUpdate(exhausted, valid, timestamp), 'ERR-018');
    expectError(buildRecordUpdate({ ...save, saveEpoch: '' }, valid, timestamp), 'ERR-012');
  });
});

describe('settings, practice and progress reset', () => {
  it('TC-D4-061 separates settings-only reset and progress reset with fresh epoch', () => {
    const withResult = saveWithClear();
    const receipt = { sessionId: 'first-clear', saveEpoch: 'E0', revision: 1, resultDigest: 'same-receipt' };
    const progressed = { ...withResult, revision: 2, commitReceipt: receipt };
    const tuned = value(rules.updateSettings(progressed, { ...progressed.settings, musicVolume: 15, timingOffsetMs: -200 }));
    const completed = value(rules.completePractice(tuned, 'TUT-02'));
    expect(completed.progress.completedTutorialIds).toEqual(['TUT-02']);
    expect(completed.records).toBe(tuned.records);
    expect(completed.collection).toBe(tuned.collection);
    expect(completed.achievements).toBe(tuned.achievements);
    expect(value(rules.completePractice(completed, 'TUT-02'))).toBe(completed);
    expectError(rules.completePractice(completed, 'TUT-99' as TutorialId), 'ERR-018');

    const settings = value(rules.resetSettings(completed));
    expect(settings.settings).toEqual(initial().settings);
    expect(settings.progress).toEqual(completed.progress);
    expect(settings.saveEpoch).toBe('E0');
    expect(settings.revision).toBe(2);
    expect(settings.commitReceipt).toEqual(receipt);

    const reset = value(rules.resetProgress(completed, 'E1'));
    expect(reset).toEqual({ ...initial(), saveEpoch: 'E1', settings: completed.settings });
    expectError(rules.resetProgress(completed, 'E0'), 'ERR-018');
  });
});
