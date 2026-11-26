import type {
  CommittedJudgementGroup, Difficulty, Judgement, JudgementCounts, LifeState, Rank, Result, ScoreEvent, ScoreState,
} from '../contracts/interface_contracts';
import { classifyTimingError } from './judgement-timing';

const maximumLife = 200;
const maximumScore = 1_000_000;
const lifeChanges: Readonly<Record<Difficulty, Readonly<Record<Judgement, number>>>> = {
  EASY: { PERFECT: 6, GREAT: 4, GOOD: 2, MISS: -12 },
  NORMAL: { PERFECT: 4, GREAT: 2, GOOD: 0, MISS: -16 },
  HARD: { PERFECT: 2, GREAT: 1, GOOD: 0, MISS: -20 },
};
const judgements = ['PERFECT', 'GREAT', 'GOOD', 'MISS'] as const;
const rankThresholds: readonly (readonly [number, Rank])[] = [
  [980_000, 'SS'], [950_000, 'S'], [900_000, 'A'], [800_000, 'B'], [700_000, 'C'],
];

export interface ScoreSummary {
  readonly score: number;
  readonly rank: Rank;
  readonly accuracy: number;
  readonly counts: JudgementCounts;
  readonly totalJudgements: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly fullCombo: boolean;
  readonly allPerfect: boolean;
}

function invalid(messageKey: string): Result<never> {
  return { ok: false, error: { code: 'ERR-018', severity: 'ERROR', messageKey, recoverable: false } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim();
}

function isJudgement(value: unknown): value is Judgement {
  return judgements.some(judgement => judgement === value);
}

function appendUniqueIds(seen: Set<string>, values: unknown, count: number) {
  if (!Array.isArray(values) || values.length !== count) return false;
  for (const value of values) {
    if (!isId(value) || seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

function validateScoreState(state: ScoreState): Set<string> | null {
  if (!isRecord(state) || ![
    state.perfect, state.great, state.good, state.miss, state.ghost, state.combo, state.maxCombo, state.totalJudgements,
  ].every(isCount) || state.totalJudgements === 0) return null;

  const successes = state.perfect + state.great + state.good;
  const committed = successes + state.miss;
  if (!isCount(committed) || committed > state.totalJudgements || state.maxCombo > successes || state.combo > state.maxCombo) {
    return null;
  }
  if (state.miss === 0 && state.ghost === 0 && state.combo !== successes) return null;

  const seen = new Set<string>();
  if (!appendUniqueIds(seen, state.committedEventIds, committed)
      || !appendUniqueIds(seen, state.committedGhostIds, state.ghost)) return null;
  return seen;
}

function readGroup(group: unknown) {
  if (!isRecord(group) || !isId(group.groupId) || !isCount(group.targetTimeUs)
      || !Array.isArray(group.results) || group.results.length === 0) return null;

  const counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
  const eventIds = new Set<string>();
  for (const result of group.results) {
    if (!isRecord(result) || !isId(result.eventId) || eventIds.has(result.eventId) || result.groupId !== group.groupId
        || result.targetTimeUs !== group.targetTimeUs || !isJudgement(result.judgement)) return null;
    if (result.judgement === 'MISS') {
      if (result.errorUs !== null && (typeof result.errorUs !== 'number' || !Number.isSafeInteger(result.errorUs))) return null;
    } else if (typeof result.errorUs !== 'number' || classifyTimingError(result.errorUs) !== result.judgement) return null;

    eventIds.add(result.eventId);
    counts[result.judgement]++;
  }
  return { counts, eventIds: [...eventIds].sort() };
}

function rankForValidScore(score: number): Rank {
  return rankThresholds.find(([minimum]) => score >= minimum)?.[1] ?? 'D';
}

export function rankForScore(score: number): Result<Rank> {
  return isCount(score) && score <= maximumScore
    ? { ok: true, value: rankForValidScore(score) }
    : invalid('score.invalidValue');
}

export function createScoreState(totalJudgements: number): ScoreState {
  if (!isCount(totalJudgements) || totalJudgements === 0) throw new RangeError('A chart needs a positive safe judgement count');
  return Object.freeze({ perfect: 0, great: 0, good: 0, miss: 0, ghost: 0, combo: 0, maxCombo: 0, totalJudgements,
    committedEventIds: Object.freeze([]), committedGhostIds: Object.freeze([]) });
}

export function createLifeState(): LifeState {
  return Object.freeze({ currentUnits: maximumLife, maxUnits: maximumLife });
}

export function reduceScore(state: ScoreState, event: ScoreEvent): Result<ScoreState> {
  try {
    const seen = validateScoreState(state);
    if (!seen) return invalid('score.invalidState');
    if (!isRecord(event)) return invalid('score.invalidEvent');

    if (event.kind === 'GHOST') {
      if (!isId(event.eventId) || typeof event.judgeTimeUs !== 'number' || !Number.isSafeInteger(event.judgeTimeUs)) {
        return invalid('score.invalidEvent');
      }
      if (seen.has(event.eventId)) return invalid('score.duplicateEvent');
      return { ok: true, value: Object.freeze({ ...state, ghost: state.ghost + 1, combo: 0,
        committedGhostIds: Object.freeze([...state.committedGhostIds, event.eventId]) }) };
    }

    if (event.kind !== 'GROUP') return invalid('score.invalidEvent');
    const group = readGroup(event.group);
    if (!group || group.eventIds.length > state.totalJudgements - state.committedEventIds.length) {
      return invalid('score.invalidGroup');
    }
    if (group.eventIds.some(id => seen.has(id))) return invalid('score.duplicateEvent');
    const counts = group.counts;
    const combo = counts.MISS ? 0 : state.combo + group.eventIds.length;
    return { ok: true, value: Object.freeze({
      ...state,
      perfect: state.perfect + counts.PERFECT,
      great: state.great + counts.GREAT,
      good: state.good + counts.GOOD,
      miss: state.miss + counts.MISS,
      combo, maxCombo: Math.max(state.maxCombo, combo),
      committedEventIds: Object.freeze([...state.committedEventIds, ...group.eventIds]),
    }) };
  } catch {
    return invalid('score.invalidInput');
  }
}

export function reduceLife(state: LifeState, difficulty: Difficulty, group: CommittedJudgementGroup): Result<LifeState> {
  try {
    if (!isRecord(state) || state.maxUnits !== maximumLife || !isCount(state.currentUnits)
        || state.currentUnits > maximumLife) return invalid('life.invalidState');
    if (difficulty !== 'EASY' && difficulty !== 'NORMAL' && difficulty !== 'HARD') return invalid('life.invalidDifficulty');
    const committed = readGroup(group);
    if (!committed) return invalid('life.invalidGroup');

    const delta = judgements.reduce((sum, judgement) => sum + lifeChanges[difficulty][judgement] * committed.counts[judgement], 0);
    const currentUnits = Math.max(0, Math.min(maximumLife, state.currentUnits + delta));
    return { ok: true, value: Object.freeze({ currentUnits, maxUnits: maximumLife }) };
  } catch {
    return invalid('life.invalidInput');
  }
}

export function summarizeScore(state: ScoreState): Result<ScoreSummary> {
  try {
    if (!validateScoreState(state)) return invalid('score.invalidState');
    const { perfect, great, good, miss, ghost, totalJudgements, combo, maxCombo } = state;
    const weight = 10n * BigInt(perfect) + 7n * BigInt(great) + 3n * BigInt(good);
    const maximumWeight = 10n * BigInt(totalJudgements);
    // Round the unpenalized score once, using exact integers at half-point boundaries.
    const baseScore = (BigInt(maximumScore) * 2n * weight + maximumWeight) / (2n * maximumWeight);
    const penalizedScore = baseScore - 1_000n * BigInt(ghost);
    const score = penalizedScore < 0n ? 0 : Number(penalizedScore);
    const unplayed = totalJudgements - state.committedEventIds.length;
    return { ok: true, value: Object.freeze({
      score, rank: rankForValidScore(score), accuracy: Number(weight) / Number(maximumWeight),
      counts: Object.freeze({ perfect, great, good, miss, ghost, unplayed }),
      totalJudgements, combo, maxCombo,
      fullCombo: miss === 0 && ghost === 0 && unplayed === 0,
      allPerfect: perfect === totalJudgements && ghost === 0,
    }) };
  } catch {
    return invalid('score.invalidInput');
  }
}
