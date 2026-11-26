import { describe, expect, it } from 'vitest';
import type {
  CommittedJudgementGroup, Difficulty, Judgement, JudgementResult, LifeState, Rank, Result, ScoreEvent, ScoreState, Us,
} from '../../src/contracts/interface_contracts';
import {
  createLifeState, createScoreState, rankForScore, reduceLife, reduceScore, summarizeScore,
} from '../../src/domain/judgement-reducers';
import { classifyTimingError, goodWindowUs } from '../../src/domain/judgement-timing';

const target = 50_000_000 as Us;
const referenceErrors: Record<Judgement, Us | null> = {
  PERFECT: 0 as Us, GREAT: -50_001 as Us, GOOD: 100_001 as Us, MISS: null,
};

function group(id: string, ...judgements: Judgement[]): CommittedJudgementGroup {
  return {
    groupId: id,
    targetTimeUs: target,
    results: judgements.map((judgement, index) => ({ eventId: `${id}/${index}`, groupId: id,
      targetTimeUs: target, judgement, errorUs: referenceErrors[judgement] })),
  };
}

function scoreGroup(value: CommittedJudgementGroup): ScoreEvent {
  return { kind: 'GROUP', group: value };
}

function ghost(eventId: string, judgeTimeUs = target): ScoreEvent {
  return { kind: 'GHOST', eventId, judgeTimeUs };
}

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.messageKey);
  return result.value;
}

function expectRejection(result: Result<unknown>): void {
  expect(result).toMatchObject({ ok: false, error: { code: 'ERR-018' } });
}

function playJudgements(input: readonly Judgement[], total = input.length): ScoreState {
  return input.reduce((state, judgement, index) => {
    const committed = group(`note-${index}`, judgement);
    const targetTimeUs = ((index + 1) * 200_000) as Us;
    const results = committed.results.map(result => ({ ...result, targetTimeUs }));
    return value(reduceScore(state, scoreGroup({ ...committed, targetTimeUs, results })));
  }, createScoreState(total));
}

describe('IF-07 score reducer', () => {
  it('TC-D4-007 commits the group before its same-time ghost and preserves the input states', () => {
    const initial = createScoreState(200);
    const committed = value(reduceScore(initial, scoreGroup(group('chord', 'PERFECT', 'PERFECT'))));
    const result = value(reduceScore(committed, ghost('empty-input')));
    expect(value(summarizeScore(result))).toMatchObject({ score: 9_000, combo: 0, maxCombo: 2,
      counts: { perfect: 2, great: 0, good: 0, miss: 0, ghost: 1, unplayed: 198 } });
    expect(initial).toMatchObject({ perfect: 0, ghost: 0, combo: 0, maxCombo: 0,
      committedEventIds: [], committedGhostIds: [] });
    expect(committed).toMatchObject({ perfect: 2, ghost: 0, combo: 2, maxCombo: 2,
      committedEventIds: ['chord/0', 'chord/1'], committedGhostIds: [] });
  });

  it('TC-D1-042〜044 only grows combo and peak for a successful group', () => {
    const before = playJudgements(Array<Judgement>(50).fill('PERFECT'), 100);
    const mixed = group('mixed', 'PERFECT', 'MISS');
    for (const results of [mixed.results, [...mixed.results].reverse()]) {
      expect(value(reduceScore(before, scoreGroup({ ...mixed, results }))))
        .toMatchObject({ perfect: 51, miss: 1, combo: 0, maxCombo: 50 });
    }
    expect(reduceScore(before, scoreGroup(mixed)))
      .toEqual(reduceScore(before, scoreGroup({ ...mixed, results: [...mixed.results].reverse() })));

    const success = group('success', 'PERFECT', 'PERFECT');
    for (const results of [success.results, [...success.results].reverse()]) {
      const committed = value(reduceScore(before, scoreGroup({ ...success, results })));
      expect(committed).toMatchObject({ perfect: 52, miss: 0, combo: 52, maxCombo: 52 });
      expect(value(reduceScore(committed, ghost('after-success'))))
        .toMatchObject({ perfect: 52, miss: 0, ghost: 1, combo: 0, maxCombo: 52 });
    }
  });

  it('TC-D1-045〜046 derives the approved scores without including ghost in accuracy or N', () => {
    const state = playJudgements([
      ...Array<Judgement>(180).fill('PERFECT'), ...Array<Judgement>(17).fill('GREAT'), ...Array<Judgement>(3).fill('GOOD'),
    ]);
    const penalized = ['g1', 'g2', 'g3'].reduce((score, id) => value(reduceScore(score, ghost(id))), state);
    expect(value(summarizeScore(state))).toMatchObject({ score: 964_000, accuracy: 0.964, rank: 'S', totalJudgements: 200,
      counts: { perfect: 180, great: 17, good: 3, miss: 0, unplayed: 0, ghost: 0 }, fullCombo: true, allPerfect: false });
    expect(value(summarizeScore(penalized))).toMatchObject({ score: 961_000, accuracy: 0.964, rank: 'S', totalJudgements: 200,
      counts: { perfect: 180, great: 17, good: 3, miss: 0, unplayed: 0, ghost: 3 }, fullCombo: false, allPerfect: false });
  });

  it('TC-D1-047 derives ALL PERFECT only for every judgement and no ghost', () => {
    const complete = playJudgements(Array<Judgement>(200).fill('PERFECT'));
    expect(value(summarizeScore(complete))).toMatchObject({ score: 1_000_000, accuracy: 1, rank: 'SS',
      counts: { perfect: 200, unplayed: 0 }, fullCombo: true, allPerfect: true });
    expect(value(summarizeScore(value(reduceScore(complete, ghost('ghost'))))))
      .toMatchObject({ score: 999_000, fullCombo: false, allPerfect: false });
    expect(value(summarizeScore(playJudgements(['PERFECT'], 2))))
      .toMatchObject({ score: 500_000, accuracy: 0.5, counts: { unplayed: 1 }, fullCombo: false, allPerfect: false });
  });

  it('rounds the weighted score once at a positive exact half and clamps the penalized score', () => {
    expect(value(summarizeScore(playJudgements(['PERFECT'], 1_999_999))).score).toBe(1);
    expect(value(summarizeScore(playJudgements(['PERFECT'], 2_000_000))).score).toBe(1);
    expect(value(summarizeScore(playJudgements(['PERFECT'], 2_000_001))).score).toBe(0);
    expect(value(summarizeScore(playJudgements(['PERFECT'], Number.MAX_SAFE_INTEGER))).score).toBe(0);
    const onlyGhost = value(reduceScore(createScoreState(1), ghost('preroll-input', -1 as Us)));
    expect(value(summarizeScore(onlyGhost))).toMatchObject({ score: 0, accuracy: 0, counts: { ghost: 1, unplayed: 1 } });
  });

  it('rejects repeated identities, cross-kind identity reuse and an overfilled group atomically', () => {
    const initial = playJudgements(['PERFECT'], 4);
    const future = group('future', 'PERFECT', 'GREAT');
    const reusedEvent = { ...future.results[1]!, eventId: 'note-0/0' };
    expectRejection(reduceScore(initial, scoreGroup({ ...future, results: [future.results[0]!, reusedEvent] })));
    expectRejection(reduceScore(initial, ghost('note-0/0')));
    expectRejection(reduceScore(initial, scoreGroup(group('overfilled', 'PERFECT', 'PERFECT', 'GREAT', 'GOOD'))));

    const withGhost = value(reduceScore(initial, ghost('future/1')));
    expectRejection(reduceScore(withGhost, ghost('future/1')));
    expectRejection(reduceScore(withGhost, scoreGroup(future)));
    expect(initial).toMatchObject({ perfect: 1, ghost: 0, committedEventIds: ['note-0/0'], committedGhostIds: [] });
    expect(withGhost).toMatchObject({ perfect: 1, ghost: 1, committedEventIds: ['note-0/0'], committedGhostIds: ['future/1'] });
  });

  it('rejects structurally inconsistent score state and malformed ghost times', () => {
    const valid = createScoreState(1);
    for (const invalidState of [
      { ...valid, totalJudgements: 0 }, { ...valid, perfect: -1 }, { ...valid, miss: NaN }, { ...valid, combo: 1 },
      { ...valid, ghost: 1 }, { ...valid, committedEventIds: ['unexpected'] },
      { ...valid, perfect: 2, combo: 2, maxCombo: 2, committedEventIds: ['a', 'b'] },
      { ...valid, perfect: 1, combo: 1, maxCombo: 1, ghost: 1, committedEventIds: ['a'], committedGhostIds: ['a'] },
    ]) {
      expectRejection(reduceScore(invalidState, ghost('input')));
      expectRejection(summarizeScore(invalidState));
    }
    expectRejection(reduceScore(valid, ghost('', target)));
    expectRejection(reduceScore(valid, ghost('fraction', 0.25 as Us)));
    expectRejection(reduceScore(valid, ghost('unsafe', (Number.MAX_SAFE_INTEGER + 1) as Us)));
    expectRejection(reduceScore(valid, { kind: 'INVALID' } as unknown as ScoreEvent));
  });
});

describe('IF-08 life reducer', () => {
  it.each<readonly [Difficulty, readonly number[]]>([
    ['EASY', [106, 104, 102, 88]], ['NORMAL', [104, 102, 100, 84]], ['HARD', [102, 101, 100, 80]],
  ])('TC-D4-008 derives the %s life table in double integer units', (difficulty, expected) => {
    const initial = createLifeState();
    expect(initial).toEqual({ currentUnits: 200, maxUnits: 200 });
    const middle = Object.freeze({ ...initial, currentUnits: 100 });
    const judgementKinds: Judgement[] = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
    expect(judgementKinds.map(judgement => value(reduceLife(middle, difficulty, group(judgement, judgement))).currentUnits))
      .toEqual(expected);
    expect(middle).toEqual({ currentUnits: 100, maxUnits: 200 });
  });

  it.each<readonly [Difficulty, number, Judgement, Judgement, number]>([
    ['NORMAL', 14, 'PERFECT', 'MISS', 2], ['NORMAL', 12, 'PERFECT', 'MISS', 0],
    ['HARD', 20, 'GREAT', 'MISS', 1], ['EASY', 196, 'PERFECT', 'GREAT', 200],
    ['EASY', 200, 'PERFECT', 'MISS', 194],
  ])('TC-D1-038〜041 sums %s life changes before one clamp at %i units', (difficulty, currentUnits, first, second, result) => {
    const initial: LifeState = { currentUnits, maxUnits: 200 };
    expect(value(reduceLife(initial, difficulty, group('simultaneous', first, second))).currentUnits).toBe(result);
    expect(value(reduceLife(initial, difficulty, group('simultaneous', second, first))).currentUnits).toBe(result);
  });

  it('rejects out-of-range life, wrong scales and unknown difficulties', () => {
    const committed = group('single', 'PERFECT');
    for (const currentUnits of [-1, 201, 0.5, NaN, Infinity]) {
      expectRejection(reduceLife({ ...createLifeState(), currentUnits }, 'EASY', committed));
    }
    expectRejection(reduceLife({ currentUnits: 100, maxUnits: 100 as 200 }, 'EASY', committed));
    expectRejection(reduceLife(createLifeState(), 'UNKNOWN' as Difficulty, committed));
  });
});

describe('judgement data and boundary integrity', () => {
  it('refuses malformed groups for both reducers, including an otherwise valid first result', () => {
    const valid = group('chord', 'PERFECT', 'GREAT');
    const bad = (patch: Partial<JudgementResult>) => ({ ...valid, results: [valid.results[0]!, { ...valid.results[1]!, ...patch }] });
    const invalidGroups = [
      { ...valid, results: [] }, { ...valid, groupId: '' }, { ...valid, targetTimeUs: -1 as Us },
      bad({ eventId: valid.results[0]!.eventId }), bad({ groupId: 'other' }), bad({ targetTimeUs: 120 as Us }),
      bad({ judgement: 'UNKNOWN' as Judgement }), bad({ errorUs: null }), bad({ errorUs: NaN as Us }),
      bad({ errorUs: -50_000 as Us }), bad({ errorUs: 150_001 as Us }), bad({ judgement: 'MISS', errorUs: 2.5 as Us }),
    ];
    for (const invalid of invalidGroups) {
      expectRejection(reduceScore(createScoreState(2), scoreGroup(invalid)));
      expectRejection(reduceLife(createLifeState(), 'EASY', invalid));
    }
  });

  it('classifies equal positive and negative edges in integers and declines out-of-window inputs', () => {
    for (const sign of [-1, 1]) {
      for (const [magnitude, judgement] of [
        [0, 'PERFECT'], [50_000, 'PERFECT'], [50_001, 'GREAT'], [100_000, 'GREAT'], [100_001, 'GOOD'],
        [goodWindowUs, 'GOOD'], [goodWindowUs + 1, null],
      ] as const) expect(classifyTimingError(sign * magnitude)).toBe(judgement);
    }
    for (const errorUs of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(classifyTimingError(errorUs)).toBeNull();
  });

  it('derives the approved rank at every inclusive boundary', () => {
    const boundaries: readonly (readonly [number, Rank])[] = [
      [0, 'D'], [699_999, 'D'], [700_000, 'C'], [700_001, 'C'], [799_999, 'C'], [800_000, 'B'], [800_001, 'B'],
      [899_999, 'B'], [900_000, 'A'], [900_001, 'A'], [949_999, 'A'], [950_000, 'S'], [950_001, 'S'],
      [979_999, 'S'], [980_000, 'SS'], [980_001, 'SS'], [1_000_000, 'SS'],
    ];
    for (const [score, expected] of boundaries) expect(value(rankForScore(score))).toBe(expected);
    for (const invalid of [-1, 1.5, 1_000_001, NaN]) expectRejection(rankForScore(invalid));
  });
});
