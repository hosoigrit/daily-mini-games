import { describe, expect, it } from 'vitest';
import type {
  ChartEvent, CompiledChart, Gen, Lane, Ms, NormalizedInput, Result, Tick, Us,
} from '../../src/contracts/interface_contracts';
import { createInputQueue } from '../../src/domain/input-queue';
import { createJudgementEngine } from '../../src/domain/judgement-engine';

const sessionId = 'synthetic-microseconds';
const generation = 5 as Gen;

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code + ' ' + result.error.messageKey);
  return result.value;
}

function event(eventId: string, time: number, lane: Lane = 1, type: ChartEvent['type'] = 'TAP', noteId = eventId): ChartEvent {
  return { eventId, noteId, groupId: `time-${time}`, lane, type, targetTimeUs: time as Us, targetTick: 0 as Tick };
}

function chart(events: ChartEvent[], difficulty: CompiledChart['difficulty'] = 'HARD'): CompiledChart {
  return {
    chartId: 'CHART-01-H', musicId: 'music-01', difficulty, totalJudgements: events.length,
    durationUs: 3_000_000 as Us, events, notes: [],
  };
}

function engine(events: ChartEvent[], difficulty?: CompiledChart['difficulty'], offsetUs = 0) {
  return value(createJudgementEngine(chart(events, difficulty), { sessionId, generation, offsetUs: offsetUs as Us }));
}

function input(
  sequence: number, time: number, lane: Lane = 1, action: NormalizedInput['action'] = 'DOWN', inputId = 'A',
  delayMs = 0, offsetUs = 0,
): NormalizedInput {
  const eventPerformanceMs = 100 + (time + offsetUs) / 1_000;
  return {
    sequence, action, lane, inputId, sessionId, clockGeneration: generation, eventId: `input-${sequence}`,
    eventPerformanceMs: eventPerformanceMs as Ms, receivedPerformanceMs: (eventPerformanceMs + delayMs) as Ms,
    judgeTimeUs: time as Us, songTimeUs: (time + offsetUs) as Us,
  };
}

type Engine = ReturnType<typeof engine>;

function advance(to: Engine, watermark: number) {
  value(to.advance((watermark + 50_000) as Us));
}

function results(from: Engine) {
  return from.read().official.flatMap(entry => entry.kind === 'GROUP' ? entry.group.results : []);
}

function error(result: Result<unknown>) {
  return result.ok ? null : result.error.code;
}

describe('判定器専用μs fixture', () => {
  it.each([
    [0, 'PERFECT'], [-50_000, 'PERFECT'], [50_000, 'PERFECT'],
    [-50_001, 'GREAT'], [50_001, 'GREAT'], [-100_000, 'GREAT'], [100_000, 'GREAT'],
    [-100_001, 'GOOD'], [100_001, 'GOOD'], [-150_000, 'GOOD'], [150_000, 'GOOD'],
    [-150_001, 'MISS'], [150_001, 'MISS'],
  ] as const)('時刻誤差 %iμs → %s (TC-D1-005〜011)', (signedError, expected) => {
    const judge = engine([event('target', 1_000_000)]);
    const down = 1_000_000 + signedError;
    value(judge.enqueueInput(input(1, down)));
    value(judge.enqueueInput(input(2, down + 50_000, 1, 'UP')));
    advance(judge, 1_300_000);
    expect(results(judge)).toMatchObject([{
      eventId: 'target', judgement: expected, errorUs: expected === 'MISS' ? null : signedError,
    }]);
    expect(value(judge.read().summary).counts.ghost).toBe(expected === 'MISS' ? 1 : 0);
  });

  it.each([-200_000, 200_000])('補正済み時刻をそのまま使う %iμs (TC-D1-012/013)', offset => {
    const judge = engine([event('target', 1_000_000)], 'HARD', offset);
    value(judge.enqueueInput(input(1, 1_000_000, 1, 'DOWN', 'A', 0, offset)));
    advance(judge, 1_000_001);
    expect(results(judge)[0]).toMatchObject({ judgement: 'PERFECT', errorUs: 0 });
  });

  it.each([
    [1_050_000, 'early'], [1_050_001, 'late'],
  ])('重なる受付範囲で最短距離を選び、等距離なら早い方を選ぶ (%i → %s)', (time, chosen) => {
    const judge = engine([event('late', 1_100_000), event('early', 1_000_000)]);
    value(judge.enqueueInput(input(1, time)));
    advance(judge, 1_300_000);
    expect(results(judge).filter(result => result.judgement !== 'MISS').map(result => result.eventId)).toEqual([chosen]);
  });

  it('所有者以外のUP、別レーンへの重複DOWN、同レーンの奪取を判定・空打ちから除外する', () => {
    const judge = engine([event('A', 1_000_000), event('B', 1_100_000)]);
    const steps = [
      input(1, 1_000_000), input(2, 1_020_000, 1, 'UP', 'B'),
      input(3, 1_025_000, 1, 'DOWN', 'B'), input(4, 1_030_000, 2),
      input(5, 1_040_000), input(6, 1_050_000, 1, 'UP'),
      input(7, 1_100_000, 1, 'DOWN', 'B'),
    ];
    for (const step of steps.reverse()) value(judge.enqueueInput(step));
    advance(judge, 1_300_000);
    expect(results(judge).map(result => [result.eventId, result.judgement])).toEqual([
      ['A', 'PERFECT'], ['B', 'PERFECT'],
    ]);
    expect(value(judge.read().summary).counts.ghost).toBe(0);
    expect(judge.read().pressedLanes).toEqual([1]);
  });

  it.each([true, false])('50ms配送かつ期限同値の入力を先に処理する (TC-D1-023)', timerFirst => {
    const judge = engine([event('target', 1_000_000)]);
    if (timerFirst) advance(judge, 1_150_000);
    value(judge.enqueueInput(input(1, 1_150_000, 1, 'DOWN', 'A', 50)));
    if (!timerFirst) advance(judge, 1_150_000);
    expect(results(judge)).toEqual([]);
    advance(judge, 1_150_001);
    expect(results(judge)[0]).toMatchObject({ judgement: 'GOOD', errorUs: 150_000 });
    expect(judge.read().deliveryDelaysOver50Ms).toBe(0);
  });

  it('入力と期限それぞれの排他的境界を1μs刻みで判定する (TC-D1-024/025)', () => {
    const withInput = engine([event('target', 1_000_000)]);
    value(withInput.enqueueInput(input(1, 1_000_000)));
    for (const boundary of [999_999, 1_000_000]) {
      advance(withInput, boundary);
      expect(results(withInput)).toEqual([]);
    }
    advance(withInput, 1_000_001);
    expect(results(withInput)[0]?.judgement).toBe('PERFECT');

    const withoutInput = engine([event('target', 1_000_000)]);
    for (const boundary of [1_149_999, 1_150_000]) {
      advance(withoutInput, boundary);
      expect(results(withoutInput)).toEqual([]);
    }
    advance(withoutInput, 1_150_001);
    expect(results(withoutInput)[0]?.judgement).toBe('MISS');
  });

  it('重複、旧セッション、旧時計世代は境界通過後も成績・保持を変更しない', () => {
    const judge = engine([event('target', 1_000_000)]);
    const press = input(1, 1_000_000);
    value(judge.enqueueInput(press));
    advance(judge, 1_000_001);
    expect(value(judge.enqueueInput(press)).reason).toBe('DUPLICATE');
    expect(value(judge.enqueueInput({ ...press, sessionId: 'old' })).reason).toBe('STALE_SESSION');
    expect(value(judge.enqueueInput({ ...press, clockGeneration: 4 as Gen })).reason).toBe('STALE_SESSION');
    expect(results(judge)).toHaveLength(1);
    expect(judge.read().stopError).toBeNull();
  });

  it('50ms超の配送記録と処理境界より古い入力を区別する (TC-D1-026)', () => {
    const judge = engine([event('target', 1_000_000)]);
    value(judge.enqueueInput(input(1, 1_000_000, 1, 'DOWN', 'A', 50.125)));
    advance(judge, 1_000_001);
    expect(judge.read().deliveryDelaysOver50Ms).toBe(1);
    const history = judge.read().official;
    expect(error(judge.enqueueInput(input(2, 1_000_000, 2, 'DOWN', 'B', 51)))).toBe('ERR-007');
    expect(error(judge.advance(2_000_000 as Us))).toBe('ERR-007');
    expect(judge.read()).toMatchObject({ official: history, lateInputs: 1, deliveryDelaysOver50Ms: 2 });
    expect(judge.getFinalResult()).toBeNull();
  });
});

describe('IF-06 / IF-18', () => {
  it('排出順は時刻からsequence、逆行はERR-006、同値は空 (TC-D4-018)', () => {
    const queue = createInputQueue(sessionId, generation, 3_000_000 as Us);
    const before = input(1, 1_149_999);
    const equal1 = input(2, 1_150_000, 1, 'UP');
    const equal2 = input(3, 1_150_000, 2, 'DOWN', 'B');
    const after = input(4, 1_150_001, 1);
    for (const entry of [after, equal2, before, equal1]) value(queue.enqueueInput(entry));
    expect(value(queue.drainBefore(1_150_000 as Us)).events).toEqual([before]);
    expect(value(queue.drainBefore(1_150_000 as Us)).events).toEqual([]);
    expect(value(queue.drainBefore(1_150_001 as Us)).events).toEqual([equal1, equal2]);
    expect(value(queue.drainBefore(1_150_002 as Us)).events).toEqual([after]);
    expect(error(queue.drainBefore(1_150_001 as Us))).toBe('ERR-006');
    expect(queue.processedBeforeUs).toBe(1_150_002);
  });

  it('不正レーン・時刻・ID・順序を拒否し、正常入力を変更しない (TC-D4-006)', () => {
    const queue = createInputQueue(sessionId, generation, 3_000_000 as Us);
    const valid = input(1, 1_000_000);
    expect(value(queue.enqueueInput(valid)).reason).toBe('QUEUED');
    expect(value(queue.enqueueInput(valid)).reason).toBe('DUPLICATE');
    expect(value(queue.enqueueInput({ ...valid, sessionId: 'previous' })).reason).toBe('STALE_SESSION');
    const bad = { ...valid, eventId: 'bad' };
    for (const malformed of [
      { ...bad, lane: 5 as Lane }, { ...bad, judgeTimeUs: NaN as Us },
      { ...bad, receivedPerformanceMs: 0 as Ms }, { ...bad, eventId: '' },
      { ...bad, songTimeUs: 1_020_000 as Us }, bad,
    ]) expect(error(queue.enqueueInput(malformed))).toBe('ERR-018');
    expect(value(queue.drainBefore(1_000_001 as Us)).events).toEqual([valid]);
  });
});

describe('ロング保持と正式集計', () => {
  const hold = [event('start', 1_000_000, 1, 'HOLD_START', 'hold'), event('end', 2_000_000, 1, 'HOLD_END', 'hold')];

  it.each([
    [2_000_000, 'PERFECT'], [1_850_000, 'GOOD'], [1_849_999, 'MISS'],
    [2_150_000, 'GOOD'], [2_150_001, 'MISS'],
  ] as const)('HOLD終端 %iμs → %s (TC-D1-029〜033)', (release, expected) => {
    const judge = engine(hold, 'EASY');
    value(judge.enqueueInput(input(1, 1_000_000)));
    advance(judge, 1_000_001);
    expect(judge.read().activeHolds).toEqual([{ lane: 1, noteId: 'hold', holder: 'A' }]);
    value(judge.enqueueInput(input(2, release, 1, 'UP')));
    advance(judge, 2_200_000);
    expect(results(judge).map(result => result.judgement)).toEqual(['PERFECT', expected]);
    expect(value(judge.read().summary).counts.ghost).toBe(0);
    expect(judge.read().activeHolds).toEqual([]);
    expect(judge.read().pressedLanes).toEqual([]);
  });

  it('開始MISSの終了MISSを正解時刻より前に集計しない (TC-D1-034)', () => {
    const judge = engine(hold, 'NORMAL');
    advance(judge, 1_150_001);
    expect(results(judge).map(result => result.eventId)).toEqual(['start']);
    expect(judge.read().lifeUnits).toBe(184);
    advance(judge, 2_000_000);
    expect(results(judge).map(result => result.eventId)).toEqual(['start']);
    advance(judge, 2_000_001);
    expect(results(judge).map(result => result.judgement)).toEqual(['MISS', 'MISS']);
    expect(judge.read().lifeUnits).toBe(168);
  });

  it('早期解放後の再押下は保持を復活させず、別主体のUPは正常保持を変更しない (TC-D1-035/036)', () => {
    const broken = engine(hold);
    for (const step of [
      input(1, 1_000_000), input(2, 1_700_000, 1, 'UP'), input(3, 1_800_000),
      input(4, 2_000_000, 1, 'UP'),
    ]) value(broken.enqueueInput(step));
    advance(broken, 1_900_000);
    expect(broken.read().activeHolds).toEqual([]);
    expect(results(broken).map(result => result.judgement)).toEqual(['PERFECT']);
    advance(broken, 2_000_001);
    expect(results(broken).map(result => result.judgement)).toEqual(['PERFECT', 'MISS']);
    expect(value(broken.read().summary).counts.ghost).toBe(1);

    const kept = engine(hold);
    for (const step of [input(1, 1_000_000), input(2, 1_800_000, 1, 'UP', 'B'), input(3, 2_000_000, 1, 'UP')]) {
      value(kept.enqueueInput(step));
    }
    advance(kept, 2_000_001);
    expect(results(kept).map(result => result.judgement)).toEqual(['PERFECT', 'PERFECT']);
  });

  it('未解決の先行グループを追い越さず、同時刻空打ちはグループの後に集計する', () => {
    const judge = engine([event('first', 1_000_000), event('right', 1_100_000, 4), event('left', 1_100_000, 2)]);
    for (const step of [
      input(3, 1_100_000, 3, 'DOWN', 'C'), input(2, 1_065_000, 4, 'DOWN', 'B'),
      input(1, 1_050_000, 2),
    ]) value(judge.enqueueInput(step));
    advance(judge, 1_149_999);
    expect(judge.read().official).toEqual([]);
    advance(judge, 1_150_001);
    expect(judge.read().official.map(entry => entry.kind)).toEqual(['GROUP', 'GROUP', 'GHOST']);
    expect(value(judge.read().summary)).toMatchObject({ maxCombo: 2, combo: 0 });
  });

  it('FAILEDの同時刻空打ちまで集計し、後続暫定成功と通知を破棄する (TC-D1-048相当)', () => {
    const misses = Array.from({ length: 10 }, (_, index) => event(`miss-${index}`, (index + 1) * 100_000, 2));
    const judge = engine([...misses, event('later', 1_100_000, 3)]);
    value(judge.enqueueInput(input(1, 1_000_000, 4, 'DOWN', 'ghost')));
    value(judge.enqueueInput(input(2, 1_050_000, 3)));
    advance(judge, 1_150_001);

    const sealed = judge.getFinalResult();
    expect(sealed).toMatchObject({
      outcome: 'FAILED', endJudgeTimeUs: 1_000_000, score: 0, remainingLifeUnits: 0,
      counts: { perfect: 0, miss: 10, unplayed: 1, ghost: 1 },
    });
    expect(judge.read().official.at(-1)?.kind).toBe('GHOST');
    expect(value(judge.enqueueInput(input(3, 1_000_001))).reason).toBe('IGNORED_STATE');
    advance(judge, 3_999_999);
    expect(judge.getFinalResult()).toBe(sealed);
  });

  it('入力締切同値まで受理し、終了境界同値では封印せず、低ランクも論理CLEARになる', () => {
    const judge = engine([event('miss', 1_000_000)]);
    value(judge.enqueueInput(input(1, 3_000_000, 4)));
    expect(value(judge.enqueueInput(input(2, 3_000_001, 3))).reason).toBe('IGNORED_STATE');
    advance(judge, 3_000_000);
    expect(judge.getFinalResult()).toBeNull();
    advance(judge, 3_000_001);
    expect(judge.getFinalResult()).toMatchObject({
      outcome: 'CLEAR', rank: 'D', counts: { miss: 1, ghost: 1, unplayed: 0 }, endJudgeTimeUs: 3_000_000,
    });
  });
});
