import { describe, expect, it } from 'vitest';
import type { Gen, Ms, NormalizedInput, Result, Sec, Us } from '../../src/contracts/interface_contracts';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { createFixedAudioClock } from '../../src/domain/audio-clock';
import {
  buildIdealInputs, compileChart, createChartMusicLookup, validateChart, validateIdealReplay,
} from '../../src/domain/chart-compiler';
import { createJudgementEngine } from '../../src/domain/judgement-engine';

const sessionId = 'stage-a2b-trial';
const generation = 3 as Gen;
const offsetUs = 25_000 as Us;
const clockOrigin = 1_000 as Ms;

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code + ' ' + result.error.messageKey);
  return result.value;
}

const music = value(createChartMusicLookup([stageA2TrialMusic])(stageA2TrialChart.musicId));
const compiled = value(compileChart(stageA2TrialChart, music, 'complete'));
const makeEngine = () => value(createJudgementEngine(compiled, { sessionId, generation, offsetUs }));
const getInputs = () => buildIdealInputs(compiled, { sessionId, clockGeneration: generation, offsetUs, performanceOriginMs: clockOrigin });

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x100000000;
  };
}

function replay(seed: number | null, frameIntervals: readonly number[], readsPerFrame: number) {
  const engine = makeEngine();
  const random = seed === null ? () => 0 : seeded(seed);
  const inputs = getInputs().map(input => ({
    ...input,
    receivedPerformanceMs: (input.eventPerformanceMs + Math.floor(random() * 40_000) / 1_000) as Ms,
  })).sort((left, right) => left.receivedPerformanceMs - right.receivedPerformanceMs || left.sequence - right.sequence);
  const delivered: NormalizedInput[] = [];
  let performanceNow = clockOrigin as number;

  for (let frame = 0, next = 0; performanceNow < clockOrigin + 24_300; frame++) {
    let input = inputs[next];
    while (input && input.receivedPerformanceMs <= performanceNow) {
      const current = input;
      delivered.push(current);
      value(engine.enqueueInput(current));
      if (seed !== null) {
        value(engine.enqueueInput(current));
        value(engine.enqueueInput({ ...current, clockGeneration: 1 as Gen }));
      }
      input = inputs[++next];
    }
    value(engine.advance((Math.round((performanceNow - clockOrigin) * 1_000) - offsetUs) as Us));
    for (let read = 0; read < readsPerFrame; read++) engine.read();
    performanceNow += frameIntervals[frame % frameIntervals.length] ?? 16;
  }
  const { official, summary } = engine.read();
  return {
    official, summary: value(summary), final: engine.getFinalResult(),
    reversedDeliveries: delivered.filter((record, index) => record.sequence < (delivered[index - 1]?.sequence ?? 0)).length,
  };
}

describe('回転灯のStage A-2b実証', () => {
  it('原曲の24秒コンテキストと4種類をコンパイルし、実判定でALL PERFECT', () => {
    expect(music).toMatchObject({ bpm: 120, ppq: 480, totalTicks: 23_040, durationUs: 24_000_000 });
    expect(validateChart(stageA2TrialChart, music, 'complete').valid).toBe(true);
    expect([compiled.notes.length, compiled.totalJudgements]).toEqual([63, 82]);
    expect(new Set(compiled.notes.map(note => note.type))).toEqual(new Set(['TAP', 'HOLD', 'CHORD', 'RAPID']));
    const { final, summary } = replay(null, [16], 0);
    expect(final).toMatchObject({
      outcome: 'CLEAR', score: 1_000_000, rank: 'SS', maxCombo: compiled.totalJudgements,
      remainingLifeUnits: 200, totalJudgements: compiled.totalJudgements,
      counts: { perfect: compiled.totalJudgements, great: 0, good: 0, miss: 0, ghost: 0, unplayed: 0 },
    });
    expect(validateIdealReplay(compiled, final).valid).toBe(true);
    expect(summary).toMatchObject({ fullCombo: true, allPerfect: true, accuracy: 1 });
  });

  it.each([1, 42, 100, 20261126])('同じ履歴をseed %iで再配送しフレーム・読取りの頻度を変えても確定結果を維持', seed => {
    const original = replay(null, [16], 0);
    const changed = replay(seed, [3, 23, 112, 9, 5], 3);
    expect(changed.reversedDeliveries).toBeGreaterThan(0);
    expect(changed.official).toEqual(original.official);
    expect(changed.summary).toEqual(original.summary);
    expect(changed.final).toEqual(original.final);
  });

  it('IF-04の実時計変換で補正を一度だけ適用し、試験譜面の全判定を確定', () => {
    const clock = value(createFixedAudioClock({
      playbackId: 'fixture', sessionId, generation, startSongUs: 0 as Us,
      startAudioSec: 5 as Sec, anchorAudioSec: 5 as Sec, anchorPerformanceMs: clockOrigin,
    }, offsetUs));
    const engine = makeEngine();
    for (const input of getInputs()) {
      const converted = value(clock.convertEventTime(input.eventPerformanceMs, generation));
      expect(converted).toEqual({
        generation, songTimeUs: input.songTimeUs, judgeTimeUs: input.judgeTimeUs,
      });
      value(engine.enqueueInput({ ...input, songTimeUs: converted.songTimeUs, judgeTimeUs: converted.judgeTimeUs }));
    }
    value(engine.advance(24_100_000 as Us));
    expect(engine.getFinalResult()?.score).toBe(1_000_000);
  });

  it('理想入力の独立TAPを1件落とすと、実判定後の理想再生検証はCHART-E14で拒否する', () => {
    const engine = makeEngine();
    const inputs = getInputs();
    const omitted = inputs.find(input => input.action === 'DOWN' && input.lane === 1 && input.judgeTimeUs === 0);
    expect(omitted).toBeDefined();
    for (const input of inputs) if (input !== omitted) value(engine.enqueueInput(input));
    value(engine.advance(24_100_000 as Us));
    const result = engine.getFinalResult();
    expect(result).toMatchObject({ outcome: 'CLEAR', counts: { perfect: 81, miss: 1, ghost: 0 } });
    expect(validateIdealReplay(compiled, result)).toMatchObject({
      valid: false, issues: [{ code: 'CHART-E14' }],
    });
  });

  it('無操作の試験譜面でライフ0となり、後続の判定は未プレイになる', () => {
    const engine = makeEngine();
    expect(engine.getFinalResult()).toBeNull();
    value(engine.advance(24_100_000 as Us));
    const final = engine.getFinalResult();
    expect(final).toMatchObject({
      outcome: 'FAILED', score: 0, remainingLifeUnits: 0, maxCombo: 0, endJudgeTimeUs: 2_750_000,
      counts: { perfect: 0, great: 0, good: 0, ghost: 0, miss: 10, unplayed: 72 },
    });
    const { counts } = value(engine.read().summary);
    expect(counts.miss).toBeGreaterThanOrEqual(10);
    expect(counts.unplayed).toBeGreaterThan(0);
    expect(counts.miss + counts.unplayed).toBe(compiled.totalJudgements);
    expect(value(engine.enqueueInput(getInputs()[0]!)).reason).toBe('IGNORED_STATE');
    expect(engine.getFinalResult()).toBe(final);
  });
});
