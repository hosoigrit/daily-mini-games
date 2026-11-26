import { describe, expect, it } from 'vitest';
import type { ChartEvent, CompiledChart, Gen, Ms, NormalizedInput, Result, Tick, Us } from '../../src/contracts/interface_contracts';
import { createInputQueue } from '../../src/domain/input-queue';
import { createJudgementEngine } from '../../src/domain/judgement-engine';

const sessionId = 'a2d-r1-controlled-delivery';
const resumedGeneration = 4 as Gen;
const previousGeneration = 3 as Gen;
const durationUs = 24_000_000 as Us;
const deliveryWaitUs = 50_000;
const targetUs = 1_000_000;
const deadlineUs = 1_150_000;

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code} ${result.error.messageKey}`);
  return result.value;
}

function input(sequence: number, judgeTimeUs: number, overrides: Partial<NormalizedInput> = {}): NormalizedInput {
  return {
    sessionId, eventId: `fixture-${sequence}`, inputId: 'fixture-key', sequence,
    clockGeneration: resumedGeneration, action: 'DOWN', lane: 3,
    eventPerformanceMs: 0 as Ms, receivedPerformanceMs: 0 as Ms,
    judgeTimeUs: judgeTimeUs as Us, songTimeUs: judgeTimeUs as Us,
    ...overrides,
  };
}

function engine(targetTimeUs = targetUs, generation = resumedGeneration) {
  const note: ChartEvent = {
    eventId: 'chart-target', noteId: 'chart-target', groupId: 'target-group',
    lane: 3, type: 'TAP', targetTick: 0 as Tick, targetTimeUs: targetTimeUs as Us,
  };
  const chart: CompiledChart = {
    chartId: 'CHART-01-H', musicId: 'music-01', difficulty: 'HARD', totalJudgements: 1,
    durationUs, events: [note], notes: [],
  };
  return value(createJudgementEngine(chart, { sessionId, generation }));
}

const lateEvent = {
  // Stage A-2d handoff, independent-cycle3-targeted-e2e.json, Chromium dist rehold.
  // The test overwrote Event.timeStamp with the planned timestamp. Native creation/dispatch,
  // event ID, session ID and sequence were unavailable. This replay supplies fixture IDs.
  assignedTimestampMs: 31_210.16699999851,
  receivedPerformanceMs: 31_284.10000000149,
  judgeTimeUs: 12_878_600,
  precedingDown: {
    assignedTimestampMs: 31_160.16699999851,
    receivedPerformanceMs: 31_164.10000000149,
    judgeTimeUs: 12_828_600,
  },
  precedingJudgeNowUs: 12_930_633,
  processedBeforeUs: 12_880_633,
  pauseBoundaryUs: 4_203_733 as Us,
} as const;

function lateUp(): NormalizedInput {
  return input(2, lateEvent.judgeTimeUs, {
    action: 'UP', eventPerformanceMs: lateEvent.assignedTimestampMs as Ms,
    receivedPerformanceMs: lateEvent.receivedPerformanceMs as Ms,
  });
}

const expectedLateError = {
  ok: false, error: { code: 'ERR-007', messageKey: 'input.lateEvent', sessionId, severity: 'ERROR', recoverable: false },
};

describe('Stage A-2d-R1 制御時計入力配送境界', () => {
  it.each([[49_999, 0], [50_000, 0], [50_001, 1]])(
    '%iμsの配送を診断件数%iとして扱い、未処理入力を受理する (TC-D1-023〜026部分)', (delayUs, expectedCount) => {
      const queue = createInputQueue(sessionId, resumedGeneration, durationUs);
      const pending = input(1, targetUs, { receivedPerformanceMs: (delayUs / 1000) as Ms });
      expect(value(queue.enqueueInput(pending)).reason).toBe('QUEUED');
      expect(queue.delaysOver50Ms).toBe(expectedCount);
      expect(queue.lateInputs).toBe(0);
      expect(value(queue.drainBefore(targetUs as Us)).events).toEqual([]);
      expect(value(queue.drainBefore((targetUs + 1) as Us)).events).toEqual([pending]);
      expect(queue.stopError).toBeNull();
    },
  );

  it.each([false, true])('期限同値の入力はW同値で待機し、Wを1μs進めると期限より先 (timerFirst=%s)', timerFirst => {
    const judge = engine();
    const judgeNowUs = (deadlineUs + deliveryWaitUs) as Us;
    if (timerFirst) value(judge.advance(judgeNowUs));
    const down = input(1, deadlineUs, { receivedPerformanceMs: 50 as Ms });
    expect(value(judge.enqueueInput(down)).reason).toBe('QUEUED');
    if (!timerFirst) value(judge.advance(judgeNowUs));
    expect(judge.read()).toMatchObject({ processedBeforeUs: deadlineUs, official: [], pressedLanes: [] });
    value(judge.advance((judgeNowUs + 1) as Us));
    expect(judge.read().official).toMatchObject([{
      kind: 'GROUP', group: { results: [{ judgement: 'GOOD', errorUs: 150_000 }] },
    }]);
  });

  it('入力がなければ期限同値のWでは保留し、期限を1μs越えた観測でMISSを確定する', () => {
    const judge = engine();
    for (const boundaryUs of [deadlineUs - 1, deadlineUs]) {
      value(judge.advance((boundaryUs + deliveryWaitUs) as Us));
      expect(judge.read()).toMatchObject({ processedBeforeUs: boundaryUs, official: [] });
    }
    value(judge.advance((deadlineUs + deliveryWaitUs + 1) as Us));
    expect(judge.read().official).toMatchObject([{ kind: 'GROUP', group: { results: [{ judgement: 'MISS' }] } }]);
  });

  it('processedBefore同値の新規入力は50,001μsでも受理し、その境界では排出しない', () => {
    const queue = createInputQueue(sessionId, resumedGeneration, durationUs);
    value(queue.drainBefore(targetUs as Us));
    const pending = input(1, targetUs, { receivedPerformanceMs: 50.001 as Ms });
    expect(value(queue.enqueueInput(pending)).reason).toBe('QUEUED');
    expect(value(queue.drainBefore(targetUs as Us))).toEqual({ processedBeforeUs: targetUs, events: [] });
    expect(value(queue.drainBefore((targetUs + 1) as Us)).events).toEqual([pending]);
    expect(queue.delaysOver50Ms).toBe(1);
    expect(queue.lateInputs).toBe(0);
    expect(queue.stopError).toBeNull();
  });

  it('processedBeforeより1μs古い新規入力は50ms未満でもERR-007で停止する', () => {
    const queue = createInputQueue(sessionId, resumedGeneration, durationUs);
    value(queue.drainBefore(targetUs as Us));
    expect(queue.enqueueInput(input(1, targetUs - 1, { receivedPerformanceMs: 49.999 as Ms }))).toEqual(expectedLateError);
    expect(queue.processedBeforeUs).toBe(targetUs);
    expect(queue.delaysOver50Ms).toBe(0);
    expect(queue.lateInputs).toBe(1);
  });

  it('再開後の旧世代は停止境界後を除外し、境界同値の新規遅着は停止する', () => {
    const queue = createInputQueue(sessionId, previousGeneration, durationUs);
    const oldClock = { clockGeneration: previousGeneration };
    value(queue.openPause(targetUs as Us));
    value(queue.drainBefore((targetUs + 1) as Us));
    value(queue.resumeGeneration(resumedGeneration));
    expect(value(queue.enqueueInput(input(1, targetUs + 1, oldClock))).reason).toBe('STALE_SESSION');
    expect(queue.stopError).toBeNull();
    expect(queue.enqueueInput(input(2, targetUs, oldClock))).toEqual(expectedLateError);
    expect(queue.lateInputs).toBe(1);
  });

  it('処理済みイベントIDの重複は別sequenceかつ50ms超でも診断や正式履歴を追加しない', () => {
    const judge = engine();
    const original = input(1, targetUs);
    value(judge.enqueueInput(original));
    value(judge.advance((targetUs + deliveryWaitUs + 1) as Us));
    const before = judge.read();
    const duplicate = { ...original, sequence: 2, receivedPerformanceMs: 50.001 as Ms };
    expect(value(judge.enqueueInput(duplicate)).reason).toBe('DUPLICATE');
    expect(judge.read()).toEqual(before);
  });

  it('正式結果封印後の遅着は履歴と同一の結果オブジェクトを保つ', () => {
    const judge = engine();
    value(judge.enqueueInput(input(1, targetUs)));
    value(judge.advance((durationUs + deliveryWaitUs + 1) as Us));
    const sealed = judge.getFinalResult();
    expect(sealed).toMatchObject({ outcome: 'CLEAR', score: 1_000_000, counts: { perfect: 1 } });
    const before = judge.read();
    expect(value(judge.enqueueInput(lateUp())).reason).toBe('IGNORED_STATE');
    value(judge.advance((durationUs + deliveryWaitUs + 2) as Us));
    expect(judge.getFinalResult()).toBe(sealed);
    expect(judge.read()).toEqual(before);
  });

  it('73.933msのモデル化遅着は実際の水位を2,033μs越えて停止し、確定済み履歴を保つ', () => {
    const judge = engine(lateEvent.precedingDown.judgeTimeUs, previousGeneration);
    value(judge.openPause(lateEvent.pauseBoundaryUs));
    value(judge.drainThroughPause(lateEvent.pauseBoundaryUs));
    value(judge.resumeGeneration(resumedGeneration, new Map()));
    value(judge.enqueueInput(input(1, lateEvent.precedingDown.judgeTimeUs, {
      eventPerformanceMs: lateEvent.precedingDown.assignedTimestampMs as Ms,
      receivedPerformanceMs: lateEvent.precedingDown.receivedPerformanceMs as Ms,
    })));
    value(judge.advance(lateEvent.precedingJudgeNowUs as Us));
    const before = judge.read();
    expect(before).toMatchObject({
      generation: resumedGeneration, processedBeforeUs: lateEvent.processedBeforeUs, pressedLanes: [3],
      official: [{ kind: 'GROUP', group: { results: [{ judgement: 'PERFECT' }] } }],
      deliveryDelaysOver50Ms: 0, lateInputs: 0, stopError: null,
    });
    const release = lateUp();
    expect(release.receivedPerformanceMs - release.eventPerformanceMs).toBeCloseTo(73.933, 6);
    expect(before.processedBeforeUs - release.judgeTimeUs).toBe(2_033);
    expect(judge.enqueueInput(release)).toEqual(expectedLateError);
    expect(judge.advance(13_000_000 as Us)).toEqual(expectedLateError);
    expect(judge.read()).toEqual({
      ...before, deliveryDelaysOver50Ms: 1, lateInputs: 1, stopError: expectedLateError.error,
    });
    expect(judge.getFinalResult()).toBeNull();
  });
});
