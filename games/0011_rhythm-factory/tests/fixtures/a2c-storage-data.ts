import type { FinalResult, Us } from '../../src/contracts/interface_contracts';
import type { SaveChartEntry } from '../../src/domain/save-data';

export const storageTrialEntry: SaveChartEntry = {
  chartId: 'CHART-01-E', musicId: 'music-01', difficulty: 'EASY', totalJudgements: 4,
  durationUs: 2_000_000 as Us,
};
export const storageRecordedAt = '2026-11-26T12:00:00.000Z';

export function clearResult(sessionId: string): FinalResult {
  return {
    ...storageTrialEntry, sessionId, outcome: 'CLEAR', score: 1_000_000, rank: 'SS',
    counts: { perfect: 4, great: 0, good: 0, miss: 0, unplayed: 0, ghost: 0 },
    maxCombo: 4, remainingLifeUnits: 200, endJudgeTimeUs: storageTrialEntry.durationUs,
  };
}

export function failedResult(sessionId: string): FinalResult {
  return {
    ...storageTrialEntry, sessionId, outcome: 'FAILED', score: 0, rank: 'D',
    counts: { perfect: 0, great: 0, good: 0, miss: 1, unplayed: 3, ghost: 0 },
    maxCombo: 0, remainingLifeUnits: 0, endJudgeTimeUs: 123_456 as Us,
  };
}
