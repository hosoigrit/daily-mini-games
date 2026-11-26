import { describe, expect, it } from 'vitest';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import type {
  ChartData, ChartEvent, ChartMusicContext, ChartNote, FinalResult, Gen, Lane, Ms, MusicId, Tick, Us,
} from '../../src/contracts/interface_contracts';
import { tickToUs } from '../../src/domain/audio-clock';
import {
  buildIdealInputs, compileChart, createChartMusicContext, createChartMusicLookup, validateChart,
  validateChartOperations, validateIdealReplay,
} from '../../src/domain/chart-compiler';

const tick = (value: number) => value as Tick;
const us = (value: number) => value as Us;
const context = (bpm = 100): ChartMusicContext => ({
  musicId: 'music-01', bpm, ppq: 480, totalTicks: tick(1920), durationUs: tickToUs(tick(1920), bpm),
  sections: [{ id: 'local', type: 'MAIN', startBar: 0, barCount: 1 }], musicEventIds: ['event-1'],
});
const chart = (notes: readonly ChartNote[]): ChartData => ({
  schemaVersion: 1, chartId: 'CHART-01-H', musicId: 'music-01', difficulty: 'HARD', level: 5, notes,
});
const tap = (id: string, lane: Lane, at: number): ChartNote => ({ id, type: 'TAP', lane, tick: tick(at) });
const hold = (id: string, lane: Lane, from: number, to: number): ChartNote =>
  ({ id, type: 'HOLD', lane, startTick: tick(from), endTick: tick(to) });
const chord = (id: string, lanes: readonly [Lane, Lane], at: number): ChartNote => ({ id, type: 'CHORD', lanes, tick: tick(at) });
const rapid = (id: string, lane: Lane, strikes: number[]): ChartNote => ({ id, type: 'RAPID', lane, ticks: strikes.map(tick) });
const atUs = (id: string, lane: Lane, time: number, type: ChartEvent['type'] = 'TAP'): ChartEvent => ({
  eventId: `${id}:${type}`, noteId: id, lane, type, targetTimeUs: us(time), targetTick: tick(0), groupId: `time:${time}`,
});

function compiled(data: ChartData, music = context()) {
  const result = compileChart(data, music);
  if (!result.ok) throw new Error(JSON.stringify(validateChart(data, music)));
  return result.value;
}

const codes = (data: unknown, music = context()) => validateChart(data, music).issues.map(issue => issue.code);

it('IF-02 gives the original 24-second trial master projection and returns ERR-001 for unknown IDs', () => {
  const lookup = createChartMusicLookup([stageA2TrialMusic]);
  const result = lookup('music-01');
  expect(result).toEqual({ ok: true, value: createChartMusicContext(stageA2TrialMusic) });
  if (!result.ok) throw new Error('Expected an isolated trial music context');
  expect(result.value).toMatchObject({ bpm: 120, ppq: 480, durationUs: 24_000_000, totalTicks: 23_040 });
  expect(result.value.sections).toEqual(stageA2TrialMusic.master.sections);
  expect(result.value.musicEventIds).toEqual(stageA2TrialMusic.events.map(event => event.id));
  expect(lookup('music-99' as MusicId)).toMatchObject({ ok: false, error: { code: 'ERR-001' } });
  expect(createChartMusicLookup([stageA2TrialMusic, stageA2TrialMusic])('music-01')).toMatchObject({ ok: false, error: { code: 'ERR-001' } });
});

it.each([
  ['TC-D2-016 TAP', tap('tap', 1, 480), [[1, 600_000, 'TAP']]],
  ['TC-D2-017 HOLD', hold('hold', 1, 480, 960), [[1, 600_000, 'HOLD_START'], [1, 1_200_000, 'HOLD_END']]],
  ['TC-D2-018 CHORD', chord('chord', [1, 3], 480), [[1, 600_000, 'TAP'], [3, 600_000, 'TAP']]],
  ['TC-D2-019 RAPID', rapid('rapid', 3, [480, 600, 720, 840]), [600_000, 750_000, 900_000, 1_050_000].map(time => [3, time, 'TAP'])],
] as const)('%s expands into its specified chart events', (_case, note, expected) => {
  const result = compiled(chart([note]));
  expect(result.events.map(event => [event.lane, event.targetTimeUs, event.type])).toEqual(expected);
  expect(result.events.every(event => event.noteId === note.id)).toBe(true);
  expect(new Set(result.events.map(event => event.eventId)).size).toBe(expected.length);
  if (note.type === 'CHORD') expect(new Set(result.events.map(event => event.groupId)).size).toBe(1);
});

it('IF-05 sorts unsorted notes, merges exact-time groups across source notes, and exposes immutable results', () => {
  const data = chart([rapid('rapid', 4, [1440, 1560, 1680]), chord('chord', [4, 2], 240), hold('hold', 1, 840, 1200), tap('tap', 3, 1200)]);
  const result = compiled(data);
  expect(result.totalJudgements).toBe(8);
  expect(result.events.map(event => [event.lane, event.targetTimeUs])).toEqual([
    [2, 300_000], [4, 300_000], [1, 1_050_000], [1, 1_500_000], [3, 1_500_000],
    [4, 1_800_000], [4, 1_950_000], [4, 2_100_000],
  ]);
  expect(result.events[3]?.groupId).toBe(result.events[4]?.groupId);
  expect(new Set(result.events.map(event => event.eventId)).size).toBe(8);
  expect(result.notes).toEqual(data.notes);
  expect(Object.isFrozen(result) && Object.isFrozen(result.events) && Object.isFrozen(result.events[0])).toBe(true);
  expect(Object.isFrozen(result.notes) && Object.isFrozen(result.notes[0]) && Object.isFrozen(result.notes[1])).toBe(true);
  for (const bad of [chart([tap('bad', 0 as Lane, 0)]), { ...data, musicId: 'music-02' } as ChartData]) {
    expect(compileChart(bad, context())).toMatchObject({ ok: false, error: { code: 'ERR-002' } });
  }
});

it('IF-19 CHART validates unknown input without modifying it and returns actionable issue fields', () => {
  const data: unknown = { ...chart([]), musicId: 'music-99', notes: [{ id: 'bad', type: 'TAP', lane: 5, tick: -1 }] };
  const original = structuredClone(data);
  const report = validateChart(data, context());
  expect(report).toEqual({ valid: false, issues: expect.arrayContaining([
    { code: 'CHART-E02', path: 'musicId', message: expect.any(String) },
    { code: 'CHART-E03', path: 'notes[0].lane', message: expect.any(String) },
    { code: 'CHART-E04', path: 'notes[0].tick', message: expect.any(String) },
  ]) });
  expect(data).toEqual(original);
  expect(validateChart(null, context()).valid).toBe(false);
  expect(validateChart(chart([tap('valid', 1, 480)]), context())).toEqual({ valid: true, issues: [] });
});

const header = chart([tap('tap', 1, 480)]);
it.each([
  ['CHART-E01', chart([tap('same', 1, 480), tap('same', 3, 960)])],
  ['CHART-E02', { ...header, musicId: 'music-99' }],
  ['CHART-E03', { ...header, notes: [{ ...header.notes[0], lane: 0 }] }],
  ['CHART-E03', { ...header, notes: [{ ...header.notes[0], lane: 5 }] }],
  ['CHART-E04', chart([tap('invalid', 1, -1)])],
  ['CHART-E04', chart([tap('invalid', 1, 0.5)])],
  ['CHART-E04', chart([tap('invalid', 1, NaN)])],
  ['CHART-E05', chart([tap('past-end', 1, 1921)])],
  ['CHART-E05', chart([hold('past-end', 1, 1440, 1921)])],
  ['CHART-E06', chart([hold('same-time', 1, 480, 480)])],
  ['CHART-E06', chart([hold('reversed', 1, 480, 479)])],
  ['CHART-E07', chart([hold('short', 1, 480, 799)])],
  ['CHART-E08', chart([tap('left-one', 1, 480), tap('left-two', 2, 480)])],
  ['CHART-E08', chart([tap('right-one', 3, 480), tap('right-two', 4, 480)])],
  ['CHART-E09', chart([hold('one', 1, 480, 960), tap('during', 2, 720)])],
  ['CHART-E09', chart([hold('one', 1, 480, 960), hold('three', 3, 480, 960), tap('during', 4, 720)])],
  ['CHART-E10', chart([tap('first', 1, 480), tap('too-soon', 2, 599)])],
  ['CHART-E10', chart([hold('first', 1, 0, 480), tap('too-soon', 2, 599)])],
  ['CHART-E11', chart([chord('left', [1, 2], 480)])],
  ['CHART-E11', chart([chord('right', [3, 4], 480)])],
  ['CHART-E12', chart([rapid('few', 3, [480, 600])])],
  ['CHART-E12', chart([rapid('many', 3, [0, 120, 240, 360, 480, 600, 720, 840, 960])])],
  ['CHART-E12', chart([rapid('reversed', 3, [720, 600, 480])])],
  ['CHART-E12', chart([rapid('duplicate', 3, [480, 480, 600])])],
  ['CHART-E12', chart([rapid('too-soon', 3, [480, 599, 720])])],
  ['CHART-E13', { ...header, chartId: 'CHART-02-H' }],
  ['CHART-E13', { ...header, chartId: 'CHART-01-N' }],
  ['CHART-E13', { ...header, notes: [{ ...header.notes[0], sourceMusicEventIds: ['missing-event'] }] }],
  ['CHART-E15', chart([])],
  ['CHART-E16', chart([tap('overlap-a', 1, 480), tap('overlap-b', 1, 480)])],
  ['CHART-E16', chart([hold('hold', 1, 0, 480), tap('overlap-hold-release', 1, 480)])],
] as const)('%s rejects the isolated invalid chart %#', (code, data) => {
  expect(codes(data)).toContain(code);
});

it('TC-D2-023 permits a TAP or HOLD release exactly at totalTicks', () => {
  expect(codes(chart([tap('ending', 1, 1920)]))).toEqual([]);
  expect(codes(chart([hold('ending', 1, 960, 1920)]))).toEqual([]);
});

it('TC-D2-025/026 accepts tick-representable 400ms HOLD and three or eight 150ms RAPID strikes', () => {
  expect(codes(chart([hold('hold', 1, 480, 800)]))).toEqual([]);
  expect(codes(chart([rapid('rapid', 3, [480, 600, 720])]))).toEqual([]);
  expect(codes(chart([rapid('rapid', 3, [480, 600, 720, 840, 960, 1080, 1200, 1320])]))).toEqual([]);
});

it.each([[1, 3], [1, 4], [2, 3], [2, 4]] as const)('TC-D2-029 accepts opposite-side chord [%i, %i]', (left, right) => {
  expect(codes(chart([chord('pair', [left, right], 480)]))).toEqual([]);
});

it.each([3, 4] as const)('TC-D2-032 accepts lane %i during a left-thumb hold', lane => {
  expect(codes(chart([hold('left', 1, 480, 960), tap('right', lane, 720)]))).toEqual([]);
});

it('TC-D2-035/037 accepts tick-representable 150ms same-thumb press and release intervals', () => {
  expect(codes(chart([tap('first', 1, 480), tap('next', 2, 600)]))).toEqual([]);
  expect(codes(chart([hold('hold', 1, 0, 480), tap('next', 2, 600)]))).toEqual([]);
});

it('TC-D2-039/040 rejects 160 BPM same-thumb 16ths and permits alternating thumbs', () => {
  expect(codes(chart([rapid('rapid', 1, [480, 600, 720])]), context(160))).toContain('CHART-E12');
  expect(codes(chart([tap('a', 1, 480), tap('b', 3, 600), tap('c', 1, 720), tap('d', 3, 840)]), context(160))).toEqual([]);
});

it.each([399_999, 400_000])('TC-D2-025 accepts the exact %i µs duration only at or beyond 400000', (duration) => {
  const report = validateChartOperations([atUs('hold', 1, 600_000, 'HOLD_START'), atUs('hold', 1, 600_000 + duration, 'HOLD_END')]);
  expect(report.valid).toBe(duration === 400_000);
  if (!report.valid) expect(report.issues.map(issue => issue.code)).toContain('CHART-E07');
});

it.each([149_999, 150_000])('TC-D2-036/038 accepts %i µs after a press or HOLD release only at or beyond 150000', (gap) => {
  const press = validateChartOperations([atUs('first', 1, 600_000), atUs('next', 2, 600_000 + gap)]);
  const release = validateChartOperations([atUs('hold', 1, 0, 'HOLD_START'), atUs('hold', 1, 600_000, 'HOLD_END'), atUs('next', 2, 600_000 + gap)]);
  for (const report of [press, release]) {
    expect(report.valid).toBe(gap === 150_000);
    if (!report.valid) expect(report.issues.map(issue => issue.code)).toContain('CHART-E10');
  }
});

it('makes a clock-correct and ordered ideal sequence with 50ms taps, RAPID releases and HOLD ownership', () => {
  const result = compiled(chart([
    tap('first', 1, 480), hold('left-hold', 2, 600, 960), chord('pair', [1, 4], 1080), rapid('rapid', 3, [1320, 1440, 1560]),
  ]));
  const input = buildIdealInputs(result, { sessionId: 'session', clockGeneration: 2 as Gen, offsetUs: us(-200_000),
    performanceOriginMs: 1000 as Ms });
  expect(input.map(event => [event.lane, event.action, event.judgeTimeUs])).toEqual([
    [1, 'DOWN', 600_000], [1, 'UP', 650_000], [2, 'DOWN', 750_000], [2, 'UP', 1_200_000],
    [1, 'DOWN', 1_350_000], [4, 'DOWN', 1_350_000], [1, 'UP', 1_400_000], [4, 'UP', 1_400_000],
    [3, 'DOWN', 1_650_000], [3, 'UP', 1_700_000], [3, 'DOWN', 1_800_000], [3, 'UP', 1_850_000],
    [3, 'DOWN', 1_950_000], [3, 'UP', 2_000_000],
  ]);
  expect(input[2]?.inputId).toBe(input[3]?.inputId);
  expect(input[4]?.inputId).not.toBe(input[5]?.inputId);
  expect(input.map(event => event.sequence)).toEqual(input.map((_event, index) => index));
  expect(new Set(input.map(event => event.eventId)).size).toBe(input.length);
  for (const event of input) {
    expect(event).toMatchObject({ sessionId: 'session', clockGeneration: 2, songTimeUs: event.judgeTimeUs - 200_000,
      eventPerformanceMs: 1000 + (event.judgeTimeUs - 200_000) / 1000, receivedPerformanceMs: event.eventPerformanceMs });
  }
});

it('CHART-E14 rejects a completed replay with one missed ideal action', () => {
  const result = compiled(header);
  const missed: FinalResult = {
    sessionId: 'session', chartId: result.chartId, musicId: result.musicId, difficulty: result.difficulty,
    outcome: 'CLEAR', score: 0, rank: 'D', counts: { perfect: 0, great: 0, good: 0, miss: 1, unplayed: 0, ghost: 0 },
    totalJudgements: 1, maxCombo: 0, remainingLifeUnits: 180, endJudgeTimeUs: result.durationUs, durationUs: result.durationUs,
  };
  expect(validateIdealReplay(result, missed)).toMatchObject({ valid: false, issues: [{ code: 'CHART-E14', path: 'result' }] });
  expect(validateIdealReplay(result, null).valid).toBe(false);
});

describe('complete trial chart profile', () => {
  const music = createChartMusicContext(stageA2TrialMusic);

  it('checks all four note types, four lanes and hard density while allowing structural-only local fixtures', () => {
    expect(validateChart(header, context()).valid).toBe(true);
    expect(validateChart(header, context(), 'complete').issues.map(issue => issue.code)).toEqual(['CHART-COVERAGE', 'CHART-DENSITY']);
    expect(validateChart(stageA2TrialChart, music, 'complete')).toEqual({ valid: true, issues: [] });
    const result = compiled(stageA2TrialChart, music);
    expect(result.totalJudgements).toBe(82);
    expect(result.events.at(0)?.targetTimeUs).toBe(0);
    expect(result.events.at(-1)?.targetTimeUs).toBe(23_677_083);
  });

  it('uses real aligned composition references for TAP, CHORD, RAPID, and HOLD endpoints', () => {
    const sounds = new Map(stageA2TrialMusic.events.map(event => [event.id, event]));
    for (const note of stageA2TrialChart.notes) {
      const mapped = note.sourceMusicEventIds?.map(id => sounds.get(id));
      expect(mapped?.length).toBeGreaterThan(0);
      if (!mapped?.[0]) throw new Error(`Missing musical cue for ${note.id}`);
      if (note.type === 'HOLD') {
        expect(mapped[0].startTick).toBe(note.startTick);
        expect(mapped[0].startTick + mapped[0].durationTicks).toBe(note.endTick);
      } else if (note.type === 'RAPID') {
        expect(mapped.map(source => source?.startTick)).toEqual(note.ticks);
      } else {
        expect(mapped.every(source => source?.startTick === note.tick)).toBe(true);
      }
    }
  });
});
