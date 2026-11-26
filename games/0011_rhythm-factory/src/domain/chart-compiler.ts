import type {
  ChartData, ChartEvent, ChartMusicContext, ChartNote, CompiledChart, Contracts, Difficulty, FinalResult,
  Gen, Lane, Ms, MusicDefinition, MusicId, NormalizedInput, Result, Tick, Us, ValidationIssue, ValidationReport,
} from '../contracts/interface_contracts';
import { tickToUs } from './audio-clock';

const tapHoldUs = 50_000;
const minThumbIntervalUs = 150_000;
const minHoldDurationUs = 400_000;
const difficultySuffix = { EASY: 'E', NORMAL: 'N', HARD: 'H' } as const;
const densityRange = { EASY: [0.8, 1.4], NORMAL: [1.5, 2.5], HARD: [2.6, 4.0] } as const;

export type ChartValidationProfile = 'structural' | 'complete';

type AddIssue = (code: string, path: string, message: string) => void;

function validationReport(issues: ValidationIssue[]): ValidationReport {
  return { valid: issues.length === 0, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isMusicId(value: unknown): value is MusicId {
  return typeof value === 'string' && /^music-0[1-5]$/.test(value);
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'EASY' || value === 'NORMAL' || value === 'HARD';
}

function isLane(value: unknown): value is Lane {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

const thumb = (lane: Lane) => lane <= 2 ? 0 : 1;

function contractFailure(code: 'ERR-001' | 'ERR-002', messageKey: string): Result<never> {
  return { ok: false, error: { code, severity: 'ERROR', messageKey, recoverable: true } };
}

export function createChartMusicContext(definition: MusicDefinition): ChartMusicContext {
  const { musicId, bpm, ppq, beatsPerBar, totalBars, sections } = definition.master;
  const totalTicks = (ppq * beatsPerBar * totalBars) as Tick;
  return Object.freeze({
    musicId, bpm, ppq, totalTicks,
    durationUs: tickToUs(totalTicks, bpm),
    sections: Object.freeze(sections.map(section => Object.freeze({ ...section }))),
    musicEventIds: Object.freeze(definition.events.map(event => event.id)),
  });
}

export function createChartMusicLookup(definitions: readonly MusicDefinition[]): Contracts['getChartMusicContext'] {
  const catalog = new Map<MusicId, ChartMusicContext | null>();
  for (const definition of definitions) {
    const { musicId } = definition.master;
    if (catalog.has(musicId)) {
      catalog.set(musicId, null);
    } else {
      catalog.set(musicId, createChartMusicContext(definition));
    }
  }
  return (musicId) => {
    const music = catalog.get(musicId);
    return music ? { ok: true, value: music } : contractFailure('ERR-001', 'music.unknownChartContext');
  };
}

function checkMusicContext(music: ChartMusicContext): boolean {
  if (!isRecord(music) || !isMusicId(music.musicId) || music.ppq !== 480
      || !isNonnegativeInteger(music.bpm) || music.bpm === 0
      || !isNonnegativeInteger(music.totalTicks) || music.totalTicks === 0
      || !isNonnegativeInteger(music.durationUs) || music.durationUs === 0
      || !Array.isArray(music.sections) || !Array.isArray(music.musicEventIds)) return false;
  const eventIds = new Set<string>();
  for (const eventId of music.musicEventIds) {
    if (!isId(eventId) || eventIds.has(eventId)) return false;
    eventIds.add(eventId);
  }
  try {
    return music.durationUs === tickToUs(music.totalTicks, music.bpm);
  } catch {
    return false;
  }
}

function parseNote(
  value: unknown, path: string, music: ChartMusicContext, musicEventIds: ReadonlySet<string>,
  noteIds: Map<string, string>, add: AddIssue,
): ChartNote | null {
  if (!isRecord(value) || !isId(value.id)) {
    add('CHART-SCHEMA', `${path}.id`, 'A note must have a non-empty ID.');
    return null;
  }
  const { id } = value;
  if (noteIds.has(id)) add('CHART-E01', `${path}.id`, 'The note ID is already in use.');
  else noteIds.set(id, path);

  const refs: string[] = [];
  if (value.sourceMusicEventIds !== undefined) {
    if (!Array.isArray(value.sourceMusicEventIds)) {
      add('CHART-E13', `${path}.sourceMusicEventIds`, 'Music-event references must be an array.');
    } else {
      for (const [index, reference] of value.sourceMusicEventIds.entries()) {
        if (!isId(reference) || !musicEventIds.has(reference)) {
          add('CHART-E13', `${path}.sourceMusicEventIds[${index}]`, 'The referenced music event does not exist.');
        } else refs.push(reference);
      }
    }
  }
  const base = value.sourceMusicEventIds === undefined ? { id } : { id, sourceMusicEventIds: Object.freeze(refs) };

  const readLane = (lane: unknown, field: string): Lane | null => {
    if (isLane(lane)) return lane;
    add('CHART-E03', `${path}.${field}`, 'The lane must be an integer from 1 to 4.');
    return null;
  };
  const readTick = (tick: unknown, field: string): Tick | null => {
    if (!isNonnegativeInteger(tick)) {
      add('CHART-E04', `${path}.${field}`, 'The tick must be a non-negative safe integer.');
      return null;
    }
    if (tick > music.totalTicks) {
      add('CHART-E05', `${path}.${field}`, 'The tick exceeds the end of the music.');
      return null;
    }
    return tick as Tick;
  };

  const type = value.type;
  if (type === 'CHORD') {
    const tick = readTick(value.tick, 'tick');
    if (!Array.isArray(value.lanes) || value.lanes.length !== 2) {
      add('CHART-E11', `${path}.lanes`, 'A chord needs one lane for each thumb.');
      return null;
    }
    const first = readLane(value.lanes[0], 'lanes[0]');
    const second = readLane(value.lanes[1], 'lanes[1]');
    if (first === null || second === null) return null;
    if (thumb(first) === thumb(second)) {
      add('CHART-E11', `${path}.lanes`, 'The two chord lanes must use opposite thumbs.');
      return null;
    }
    return tick === null ? null : { ...base, type, tick, lanes: Object.freeze([first, second] as const) };
  }
  if (type !== 'TAP' && type !== 'HOLD' && type !== 'RAPID') {
    add('CHART-SCHEMA', `${path}.type`, 'The note type must be TAP, HOLD, CHORD or RAPID.');
    return null;
  }
  const lane = readLane(value.lane, 'lane');
  if (type === 'TAP') {
    const tick = readTick(value.tick, 'tick');
    return lane === null || tick === null ? null : { ...base, type, lane, tick };
  }
  if (type === 'HOLD') {
    const startTick = readTick(value.startTick, 'startTick');
    const endTick = readTick(value.endTick, 'endTick');
    if (startTick === null || endTick === null || lane === null) return null;
    if (endTick <= startTick) {
      add('CHART-E06', `${path}.endTick`, 'A hold must end after it starts.');
      return null;
    }
    return { ...base, type, lane, startTick, endTick };
  }
  if (!Array.isArray(value.ticks) || value.ticks.length < 3 || value.ticks.length > 8) {
    add('CHART-E12', `${path}.ticks`, 'A rapid note needs 3 to 8 strikes.');
    return null;
  }
  const ticks: Tick[] = [];
  let previousUs: Us | null = null;
  for (const [index, rawTick] of value.ticks.entries()) {
    const field = `ticks[${index}]`;
    const tick = readTick(rawTick, field);
    if (tick === null) return null;
    const timeUs = tickToUs(tick, music.bpm);
    if (previousUs !== null && timeUs - previousUs < minThumbIntervalUs) {
      add('CHART-E12', `${path}.${field}`, 'Rapid strikes must increase with at least 150000 µs between them.');
      return null;
    }
    previousUs = timeUs;
    ticks.push(tick);
  }
  return lane === null ? null : { ...base, type, lane, ticks: Object.freeze(ticks) };
}

function expandNote(note: ChartNote, bpm: number): ChartEvent[] {
  function make(lane: Lane, tick: Tick, ordinal: number, type: ChartEvent['type'] = 'TAP'): ChartEvent {
    const targetTimeUs = tickToUs(tick, bpm);
    return Object.freeze({
      eventId: `${note.id}:${ordinal}`, noteId: note.id, groupId: `time:${targetTimeUs}`,
      lane, targetTick: tick, targetTimeUs, type,
    });
  }
  switch (note.type) {
    case 'TAP': return [make(note.lane, note.tick, 0)];
    case 'HOLD': return [make(note.lane, note.startTick, 0, 'HOLD_START'), make(note.lane, note.endTick, 1, 'HOLD_END')];
    case 'CHORD': return note.lanes.map((lane, ordinal) => make(lane, note.tick, ordinal));
    case 'RAPID': return note.ticks.map((tick, ordinal) => make(note.lane, tick, ordinal));
  }
}

interface Operation {
  readonly lane: Lane;
  readonly downUs: Us;
  readonly upUs: Us;
  readonly hold: boolean;
  readonly path: string;
}

function chartOperations(events: readonly ChartEvent[], paths?: ReadonlyMap<string, string>, add?: AddIssue): Operation[] {
  const holdEnds = new Map(events.filter(event => event.type === 'HOLD_END').map(event => [event.noteId, event]));
  const operations: Operation[] = [];
  for (const [index, event] of events.entries()) {
    if (event.type === 'HOLD_END') continue;
    const path = paths?.get(event.noteId) ?? `events[${index}]`;
    const downUs = event.targetTimeUs;
    const hold = event.type === 'HOLD_START';
    const end = hold ? holdEnds.get(event.noteId) : undefined;
    if (hold && (!end || end.lane !== event.lane || end.targetTimeUs < downUs)) {
      add?.('CHART-E06', path, 'A hold must end after it starts in the same lane.');
      continue;
    }
    operations.push({ lane: event.lane, downUs,
      upUs: end?.targetTimeUs ?? (downUs + tapHoldUs) as Us, hold, path });
  }
  return operations.sort((first, second) => first.downUs - second.downUs || first.lane - second.lane);
}

function validateOperations(events: readonly ChartEvent[], add: AddIssue, paths?: ReadonlyMap<string, string>) {
  const occupiedTimes = new Set<string>();
  for (const [index, event] of events.entries()) {
    const position = `${event.lane}:${event.targetTimeUs}`;
    if (occupiedTimes.has(position)) {
      add('CHART-E16', paths?.get(event.noteId) ?? `events[${index}]`, 'The lane already has a judgement at this time.');
    }
    occupiedTimes.add(position);
  }
  const previous: (Operation | undefined)[] = [undefined, undefined];
  const latestHold: (Operation | undefined)[] = [undefined, undefined];
  for (const operation of chartOperations(events, paths, add)) {
    const side = thumb(operation.lane);
    const last = previous[side];
    const hold = latestHold[side];
    if (operation.hold && operation.upUs - operation.downUs < minHoldDurationUs) {
      add('CHART-E07', operation.path, 'A hold must last at least 400000 µs.');
    }
    if (last?.downUs === operation.downUs) {
      add('CHART-E08', operation.path, 'A thumb cannot start two operations at the same time.');
    }
    if (hold && operation.downUs < hold.upUs) {
      add('CHART-E09', operation.path, 'A thumb cannot start another operation while holding.');
    } else if ((last && operation.downUs > last.downUs && operation.downUs - last.downUs < minThumbIntervalUs)
        || (hold && operation.downUs - hold.upUs < minThumbIntervalUs)) {
      add('CHART-E10', operation.path, 'A thumb needs 150000 µs between presses and after a hold release.');
    }
    previous[side] = operation;
    if (operation.hold && (!hold || operation.upUs > hold.upUs)) latestHold[side] = operation;
  }
}

/** Exact microsecond fixture entry point after normal chart tick conversion. */
export function validateChartOperations(events: readonly ChartEvent[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  validateOperations(events, (code, path, message) => issues.push({ code, path, message }));
  return validationReport(issues);
}

function inspectChart(data: unknown, music: ChartMusicContext, profile: ChartValidationProfile) {
  const issues: ValidationIssue[] = [];
  const notes: ChartNote[] = [];
  const events: ChartEvent[] = [];
  const add: AddIssue = (code, path, message) => issues.push({ code, path, message });
  const inspection = { issues, notes, events };
  if (!checkMusicContext(music)) {
    add('CHART-E02', 'music', 'A consistent music context is required.');
    return inspection;
  }
  if (!isRecord(data)) {
    add('CHART-SCHEMA', '$', 'The chart must be an object.');
    return inspection;
  }
  if (data.schemaVersion !== 1) add('CHART-SCHEMA', 'schemaVersion', 'The chart schema version must be 1.');
  if (!isNonnegativeInteger(data.level) || data.level < 1 || data.level > 10) {
    add('CHART-SCHEMA', 'level', 'The chart level must be an integer from 1 to 10.');
  }
  if (!isMusicId(data.musicId)) add('CHART-E02', 'musicId', 'The chart references an unknown music ID.');
  else if (data.musicId !== music.musicId) add('CHART-E13', 'musicId', 'The chart and music context IDs must match.');
  if (!isDifficulty(data.difficulty)) add('CHART-E13', 'difficulty', 'The difficulty must match the chart ID.');
  if (isMusicId(data.musicId) && isDifficulty(data.difficulty)
      && data.chartId !== `CHART-${data.musicId.slice(-2)}-${difficultySuffix[data.difficulty]}`) {
    add('CHART-E13', 'chartId', 'The chart ID must match its music ID and difficulty.');
  }
  if (!Array.isArray(data.notes) || data.notes.length === 0) {
    add('CHART-E15', 'notes', 'The chart must contain at least one note.');
    return inspection;
  }
  const paths = new Map<string, string>();
  const musicEventIds = new Set(music.musicEventIds);
  for (const [index, value] of data.notes.entries()) {
    const note = parseNote(value, `notes[${index}]`, music, musicEventIds, paths, add);
    if (note === null) continue;
    notes.push(Object.freeze(note));
    for (const event of expandNote(note, music.bpm)) events.push(event);
  }
  events.sort((first, second) => first.targetTimeUs - second.targetTimeUs || first.lane - second.lane);
  validateOperations(events, add, paths);

  if (profile === 'complete') {
    if (new Set(notes.map(note => note.type)).size !== 4 || new Set(events.map(event => event.lane)).size !== 4) {
      add('CHART-COVERAGE', 'notes', 'The whole chart must use all four note types and all four lanes.');
    }
    if (isDifficulty(data.difficulty)) {
      const [min, max] = densityRange[data.difficulty];
      const density = events.length / (music.durationUs / 1_000_000);
      if (density < min || density > max) {
        add('CHART-DENSITY', 'notes', `The chart density must be between ${min} and ${max} judgements per second.`);
      }
    }
  }
  return inspection;
}

export function validateChart(data: unknown, music: ChartMusicContext, profile: ChartValidationProfile = 'structural'): ValidationReport {
  return validationReport(inspectChart(data, music, profile).issues);
}

export function compileChart(chart: ChartData, music: ChartMusicContext, profile: ChartValidationProfile = 'structural'): Result<CompiledChart> {
  const { issues, events, notes } = inspectChart(chart, music, profile);
  if (issues.length !== 0) return contractFailure('ERR-002', 'chart.invalid');
  return { ok: true, value: Object.freeze({
    chartId: chart.chartId, musicId: chart.musicId, difficulty: chart.difficulty,
    totalJudgements: events.length, durationUs: music.durationUs,
    events: Object.freeze(events), notes: Object.freeze(notes),
  }) };
}

export interface IdealInputOptions {
  readonly sessionId: string;
  readonly clockGeneration: Gen;
  readonly offsetUs?: Us;
  readonly performanceOriginMs?: Ms;
}

export function buildIdealInputs(chart: CompiledChart, options: IdealInputOptions): readonly NormalizedInput[] {
  const { sessionId, clockGeneration, offsetUs = 0, performanceOriginMs = 1000 } = options;
  const edges = chartOperations(chart.events).flatMap(operation => [
    { atUs: operation.downUs, lane: operation.lane, action: 'DOWN' as const },
    { atUs: operation.upUs, lane: operation.lane, action: 'UP' as const },
  ]).sort((first, second) => first.atUs - second.atUs || first.lane - second.lane);
  return Object.freeze(edges.map(({ atUs, lane, action }, sequence) => {
    const songTimeUs = (atUs + offsetUs) as Us;
    const eventTime = (performanceOriginMs + songTimeUs / 1000) as Ms;
    if (!Number.isSafeInteger(songTimeUs) || !Number.isFinite(eventTime) || eventTime < 0) {
      throw new RangeError('The ideal input time lies outside the selected clock origin.');
    }
    return Object.freeze({
      eventId: `ideal:${sequence}`, sessionId, clockGeneration, inputId: `ideal-thumb-${thumb(lane)}`,
      lane, action, eventPerformanceMs: eventTime, receivedPerformanceMs: eventTime,
      songTimeUs, judgeTimeUs: atUs, sequence,
    });
  }));
}

/** Run this against results returned by the gameplay engine after feeding an ideal input sequence. */
export function validateIdealReplay(chart: CompiledChart, result: FinalResult | null): ValidationReport {
  const counts = result?.counts;
  const valid = !!result && !!counts && result.chartId === chart.chartId && result.musicId === chart.musicId
    && result.difficulty === chart.difficulty && result.outcome === 'CLEAR' && result.score === 1_000_000
    && result.totalJudgements === chart.totalJudgements && counts.perfect === chart.totalJudgements
    && counts.great === 0 && counts.good === 0 && counts.miss === 0 && counts.unplayed === 0 && counts.ghost === 0;
  return validationReport(valid ? [] : [{
    code: 'CHART-E14', path: 'result', message: 'Ideal input must clear the chart with every judgement PERFECT and no empty hits.',
  }]);
}
