import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AudioEvent, ChartEvent, CompiledChart, ConvertedTime, GameError, GameState, Gen, Lane, Ms, NormalizedInput, Result, Tick, Us,
} from '../../src/contracts/interface_contracts';
import { createGameSession, isSessionTransitionListed, type GameSession, type SessionEvent, type SessionMode } from '../../src/domain/game-session';

const ms = (value: number) => value as Ms;
const us = (value: number) => value as Us;
const gen = (value: number) => value as Gen;
const identity = (generation = 1, playbackId = 'take-1', sessionId = 'S1') => ({ sessionId, generation: gen(generation), playbackId });
const context = (song: number, offset = 0, generation = 1): ConvertedTime => ({ generation: gen(generation), songTimeUs: us(song), judgeTimeUs: us(song - offset) });
const tap = (id: string, atUs: number, lane: Lane = 1): ChartEvent => ({
  eventId: id, noteId: id, groupId: `time:${atUs}`, type: 'TAP', lane, targetTimeUs: us(atUs), targetTick: 0 as Tick,
});
const hold = (id: string, start: number, end: number, lane: Lane = 1): ChartEvent[] => [
  { ...tap(id, start, lane), eventId: `${id}-start`, type: 'HOLD_START' },
  { ...tap(id, end, lane), eventId: `${id}-end`, type: 'HOLD_END' },
];
const chart = (events: readonly ChartEvent[], durationUs = 3_000_000): CompiledChart => ({
  chartId: 'CHART-01-H', musicId: 'music-01', difficulty: 'HARD', totalJudgements: events.length,
  durationUs: us(durationUs), events, notes: [],
});

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code} ${result.error.messageKey}`);
  return result.value;
}

function ui(session: GameSession, expected: GameState) {
  expect(session.read().state).toBe(expected);
}

function create(events: readonly ChartEvent[], offset = 0, mode: SessionMode = 'FORMAL', durationUs?: number) {
  return value(createGameSession(chart(events, durationUs), { sessionId: 'S1', generation: gen(1), offsetUs: us(offset), mode }));
}

function playing(session: GameSession) {
  value(session.beginInitialization());
  value(session.initializationReady(ms(0)));
  value(session.startPlayback(ms(3000), identity()));
  return session;
}

function input(
  sequence: number, song: number, atMs: number, options: Partial<Pick<NormalizedInput, 'lane' | 'clockGeneration' | 'inputId' | 'action' | 'receivedPerformanceMs'>> & { offset?: number } = {},
): NormalizedInput {
  const { offset = 0, ...overrides } = options;
  return { eventId: `e${sequence}`, sessionId: 'S1', clockGeneration: gen(1), inputId: 'A', lane: 1, action: 'DOWN',
    eventPerformanceMs: ms(atMs), receivedPerformanceMs: ms(atMs), songTimeUs: us(song), judgeTimeUs: us(song - offset), sequence, ...overrides };
}

function ended(generation = 1, playbackId = 'take-1', sessionId = 'S1', clockGeneration = generation): AudioEvent {
  return { ...identity(generation, playbackId, sessionId), requestId: 'play', kind: 'ENDED', clockGeneration: gen(clockGeneration) };
}

const recoverable: GameError = { code: 'ERR-004', messageKey: 'audio.gestureRequired', sessionId: 'S1', severity: 'ERROR', recoverable: true };

function prepareResume(session: GameSession, pausedAtMs: number) {
  value(session.advancePause(ms(pausedAtMs + 50.001)));
  value(session.requestResume(ms(pausedAtMs + 51)));
  return value(session.getResumePlan(ms(pausedAtMs + 3051)));
}

it('matches all 63 approved transition rows and rejects unlisted state-event-destination tuples by mode', () => {
  const source = readFileSync(new URL('../../../../handoffs/game-0011/v1.0/approved_v08/state_transition_matrix.csv', import.meta.url), 'utf8');
  const rows = source.trim().split(/\r?\n/).slice(1);
  expect(rows).toHaveLength(63);
  const byMode = new Set<string>();
  const states = new Set<GameState>();
  const events = new Set<SessionEvent>();
  const modes = ['FORMAL', 'PRACTICE'] as const;
  for (const row of rows) {
    const [from, event, to] = row.split(',') as [GameState, SessionEvent, GameState | 'NEW_SESSION_READY'];
    const practiceOnly = event === 'START_TUTORIAL' || row.includes('練習mode・教材終了');
    const formalOnly = event === 'START_GAME' || row.includes('正式modeのみ') || row.includes('正式mode・曲完走');
    states.add(from);
    events.add(event);
    for (const mode of practiceOnly ? ['PRACTICE'] : formalOnly ? ['FORMAL'] : modes) byMode.add(`${from}/${event}/${to}/${mode}`);
  }
  expect(states.size).toBe(14);
  const destinations = [...states, 'NEW_SESSION_READY' as const];
  const actual: string[] = [];
  for (const from of states) for (const event of events) for (const to of destinations) for (const mode of modes) {
    if (isSessionTransitionListed(from, event, to, mode)) actual.push(`${from}/${event}/${to}/${mode}`);
  }
  expect(new Set(actual)).toEqual(byMode);
});

it('TC-D1-050 leaves recoverable initial denial awaiting a new gesture and inhibits ordinary input and playback', () => {
  const session = create([tap('first', 400_000)]);
  value(session.beginInitialization());
  expect(session.beginInitialization()).toMatchObject({ ok: false, error: { code: 'ERR-008' } });
  value(session.initializationDenied(recoverable));
  ui(session, 'INITIALIZING');
  expect(session.read()).toMatchObject({ songTimeUs: null, error: { code: 'ERR-004' } });
  expect(session.initializationReady(ms(0)).ok).toBe(false);
  expect(value(session.enqueueInput(input(1, 400_000, 400))).accepted).toBe(false);
  expect(session.getFinalResult()).toBeNull();
  value(session.beginInitialization());
  value(session.initializationReady(ms(0)));
  expect(session.startPlayback(ms(2999.999), identity()).ok).toBe(false);
  ui(session, 'COUNTDOWN');
  value(session.startPlayback(ms(3000), identity()));
  ui(session, 'PLAYING');
});

it('interrupts initialization to READY and rejects an obsolete readiness notification while READY', () => {
  const session = create([tap('first', 400_000)]);
  value(session.beginInitialization());
  value(session.initializationInterrupted());
  ui(session, 'READY');
  expect(session.initializationReady(ms(10)).ok).toBe(false);
  expect(session.read().songTimeUs).toBeNull();
  expect(session.requestResume(ms(10)).ok).toBe(false);
});

it('does not re-enter practice initialization through a formal retry after recoverable denial', () => {
  const session = create([tap('first', 400_000)], 0, 'PRACTICE');
  value(session.beginInitialization());
  value(session.initializationDenied(recoverable));
  ui(session, 'INITIALIZING');
  expect(session.beginInitialization()).toMatchObject({ ok: false, error: { code: 'ERR-008' } });
  expect(session.initializationReady(ms(10)).ok).toBe(false);
  value(session.initializationInterrupted());
  ui(session, 'READY');
  expect(session.read()).toMatchObject({ songTimeUs: null, error: null });
  expect(session.getFinalResult()).toBeNull();
});

it('TC-D1-051 stops an initial countdown without a song clock, rotates generation, and starts a fresh countdown', () => {
  const session = create([tap('first', 0)]);
  value(session.beginInitialization());
  value(session.initializationReady(ms(0)));
  value(session.requestPause(ms(1000)));
  ui(session, 'PAUSING');
  expect(session.read()).toMatchObject({ songTimeUs: null, pauseBoundary: null });
  const plan = prepareResume(session, 1000);
  expect(plan).toMatchObject({ generation: 2, target: 'COUNTDOWN', playBgm: false, songTimeUs: null, sourceOffsetUs: null });
  value(session.completeResume(plan, undefined, ms(4051)));
  expect(session.read()).toMatchObject({ generation: 2, songTimeUs: null, countdownEndsAtMs: 7051 });
  value(session.startPlayback(ms(7051), identity()));
  ui(session, 'COUNTDOWN');
  expect(value(session.enqueueInput(input(1, 0, 7100, { clockGeneration: gen(2) }))).accepted).toBe(false);
  value(session.startPlayback(ms(7051), identity(2, 'take-2')));
  expect(session.read()).toMatchObject({ state: 'PREROLL', songTimeUs: -150_000, judgeTimeUs: -150_000 });
});

it('TC-D1-052 resumes negative PREROLL with an offset 0 source and delay equal to the frozen negative position', () => {
  const session = playing(create([tap('first', 0)], -200_000));
  expect(session.read()).toMatchObject({ state: 'PREROLL', startSongUs: -350_000 });
  expect(value(session.enqueueInput(input(1, -350_001, 2999, { offset: -200_000 }))).accepted).toBe(false);
  value(session.requestPause(ms(3150), context(-200_000, -200_000)));
  const plan = prepareResume(session, 3150);
  expect(plan).toMatchObject({ target: 'PREROLL', songTimeUs: -200_000, playBgm: true, sourceOffsetUs: 0, sourceDelayUs: 200_000 });
  value(session.completeResume(plan, identity(2, 'take-2')));
  expect(session.read()).toMatchObject({ songTimeUs: -200_000, judgeTimeUs: 0, state: 'PREROLL', generation: 2 });
  value(session.advance(context(-1, -200_000, 2), ms(6300)));
  ui(session, 'PREROLL');
  value(session.advance(context(0, -200_000, 2), ms(6300.001)));
  ui(session, 'PLAYING');
});

it('TC-D1-053/054/055/056 and D4-028 freeze B and use a strict Performance deadline for old inputs through B only', () => {
  const session = playing(create([tap('first', 1_000_000), tap('later', 1_030_000, 3)], 200_000));
  value(session.requestPause(ms(4200), context(1_200_000, 200_000)));
  expect(value(session.enqueueInput(input(3, 1_200_001, 4200.001, { lane: 4, offset: 200_000, receivedPerformanceMs: ms(4240) }))).accepted).toBe(false);
  const boundaryInput = input(1, 1_200_000, 4200, { offset: 200_000, receivedPerformanceMs: ms(4250) });
  expect(value(session.enqueueInput(boundaryInput)).accepted).toBe(true);
  value(session.advancePause(ms(4250)));
  ui(session, 'PAUSING');
  expect(session.read().judgement.official).toHaveLength(0);
  value(session.advancePause(ms(4250.001)));
  ui(session, 'PAUSED');
  expect(session.read()).toMatchObject({ songTimeUs: 1_200_000, judgeTimeUs: 1_000_000,
    pauseBoundary: { processedBeforeUs: 1_000_001, generation: 1 }, judgement: { processedBeforeUs: 1_000_001 } });
  expect(session.getFinalResult()).toBeNull();
  expect(value(session.read().judgement.summary).counts).toMatchObject({ perfect: 1, miss: 0, ghost: 0 });
  value(session.advancePause(ms(14_250)));
  value(session.advance(context(11_200_000, 200_000), ms(14_250)));
  expect(session.read()).toMatchObject({ state: 'PAUSED', songTimeUs: 1_200_000, judgement: { lifeUnits: 200, processedBeforeUs: 1_000_001 } });
  expect(value(session.enqueueInput(boundaryInput)).reason).toBe('DUPLICATE');
});

it('TC-D1-054 distinguishes a delayed but still in-boundary PERFECT from delivery after the safety boundary', () => {
  const session = playing(create([tap('mark', 1_000_000)], 200_000));
  value(session.requestPause(ms(4200), context(1_200_000, 200_000)));
  expect(value(session.enqueueInput(input(4, 1_190_000, 4190, { offset: 200_000, receivedPerformanceMs: ms(4230) }))).accepted).toBe(true);
  value(session.advancePause(ms(4250.001)));
  expect(session.read().judgement.official[0]).toMatchObject({ kind: 'GROUP', group: {
    results: [{ judgement: 'PERFECT', errorUs: -10_000 }],
  } });
  expect(session.enqueueInput(input(5, 1_180_000, 4180, { lane: 3, offset: 200_000, receivedPerformanceMs: ms(4251) }))).toMatchObject({ ok: false, error: { code: 'ERR-007' } });
  ui(session, 'ERROR');
  expect(session.read().judgement.official).toHaveLength(1);
});

it('uses a past lifecycle occurrence as B within already drained history and rejects rollback across it', () => {
  const make = () => {
    const session = playing(create([tap('first', 1_100_000)]));
    value(session.enqueueInput(input(1, 1_100_000, 4100)));
    value(session.advance(context(1_240_000), ms(4240)));
    expect(session.read().judgement.processedBeforeUs).toBe(1_190_000);
    expect(value(session.read().judgement.summary).counts.perfect).toBe(1);
    return session;
  };
  const recoverable = make();
  value(recoverable.requestPause(ms(4189.999), context(1_189_999)));
  expect(recoverable.read()).toMatchObject({ state: 'PAUSING', songTimeUs: 1_189_999, pauseBoundary: { atPerformanceMs: 4189.999 } });
  value(recoverable.advancePause(ms(4240)));
  expect(recoverable.read()).toMatchObject({ state: 'PAUSED', judgement: { processedBeforeUs: 1_190_000 } });
  expect(value(recoverable.read().judgement.summary).counts.perfect).toBe(1);

  const impossible = make();
  expect(impossible.requestPause(ms(4189.998), context(1_189_998))).toMatchObject({ ok: false, error: { code: 'ERR-006' } });
  ui(impossible, 'ERROR');
  expect(value(impossible.read().judgement.summary).counts.perfect).toBe(1);
  expect(impossible.getFinalResult()).toBeNull();
});

it('TC-D1-057 seals FAILED during pause drain before a queued ABORT, including the same-time ghost', () => {
  const notes = Array.from({ length: 11 }, (_item, index) => tap(`note${index}`, 200_000 + index * 100_000));
  const session = playing(create(notes));
  value(session.enqueueInput(input(1, 1_100_000, 4100, { lane: 3 })));
  value(session.requestPause(ms(4250), context(1_250_000)));
  value(session.abort());
  ui(session, 'PAUSING');
  value(session.advancePause(ms(4300.001)));
  expect(session.getFinalResult()).toMatchObject({ outcome: 'FAILED', counts: { miss: 10, unplayed: 1, ghost: 1 }, endJudgeTimeUs: 1_100_000 });
  ui(session, 'FAILED');
});

it('TC-D4-036 allows pending ABORT after a safe pause drain with no final result', () => {
  const session = playing(create([tap('later', 2_000_000)]));
  value(session.requestPause(ms(3500), context(500_000)));
  value(session.abort());
  value(session.advancePause(ms(3550)));
  ui(session, 'PAUSING');
  value(session.advancePause(ms(3550.001)));
  ui(session, 'ABORTED');
  expect(session.getFinalResult()).toBeNull();
  expect(session.canRetry()).toBe(true);
});

describe('rehold', () => {
  function suspended() {
    const session = playing(create(hold('left', 1_000_000, 2_000_000)));
    value(session.enqueueInput(input(1, 1_000_000, 4000)));
    value(session.advance(context(1_100_000), ms(4100)));
    value(session.requestPause(ms(4500), context(1_500_000)));
    value(session.advancePause(ms(4550.001)));
    return session;
  }
  const left = (
    sequence: number, eventAtMs: number, action: 'DOWN' | 'UP', inputId = 'B', receivedAtMs = eventAtMs,
  ) => input(sequence, Math.round((eventAtMs - 3000) * 1000), eventAtMs, { inputId, action, receivedPerformanceMs: ms(receivedAtMs) });

  it('TC-D1-058/059 reholds a normal hold for exactly 3 seconds and resumes with the new controller', () => {
    const session = suspended();
    expect(session.read().reholdLanes).toEqual([1]);
    expect(session.holdStates()[0]).toMatchObject({ state: 'SUSPENDED', startJudgement: 'PERFECT', endJudgement: null });
    value(session.requestResume(ms(4551)));
    ui(session, 'REHOLD_WAIT');
    expect(session.holdStates()[0]).toMatchObject({ state: 'REHOLD_WAIT', activeInputId: null });
    value(session.rehold(left(101, 4552, 'DOWN'), ms(4552)));
    value(session.rehold(left(102, 4553, 'UP', 'different-owner'), ms(4553)));
    expect(session.getResumePlan(ms(7551)).ok).toBe(false);
    const plan = value(session.getResumePlan(ms(7552)));
    expect(plan).toMatchObject({ generation: 2, target: 'PLAYING', songTimeUs: 1_500_000, sourceOffsetUs: 1_500_000, playBgm: true });
    value(session.completeResume(plan, identity(2, 'take-2')));
    expect(session.holdStates()[0]).toMatchObject({ state: 'HOLDING', activeInputId: 'B' });
    expect(value(session.read().judgement.summary).counts.ghost).toBe(0);
    value(session.enqueueInput(input(2, 2_000_000, 8052, { action: 'UP', clockGeneration: gen(2), inputId: 'B' })));
    value(session.advance(context(2_050_001, 0, 2), ms(8102.001)));
    expect(value(session.read().judgement.summary).counts).toMatchObject({ perfect: 2, miss: 0, ghost: 0 });
  });

  it('TC-D1-060 invalidates a released rehold plan and restarts the whole 3-second timer', () => {
    const session = suspended();
    value(session.requestResume(ms(4551)));
    value(session.rehold(left(101, 4552, 'DOWN'), ms(4552)));
    const oldPlan = value(session.getResumePlan(ms(7552)));
    value(session.rehold(left(102, 7553, 'UP'), ms(7553)));
    ui(session, 'REHOLD_WAIT');
    value(session.completeResume(oldPlan, identity(2, 'old-reservation')));
    ui(session, 'REHOLD_WAIT');
    value(session.rehold(left(103, 7554, 'DOWN', 'C'), ms(7554)));
    expect(session.getResumePlan(ms(10_553.999)).ok).toBe(false);
    const fresh = value(session.getResumePlan(ms(10_554)));
    expect(fresh).not.toBe(oldPlan);
    value(session.completeResume(fresh, identity(2, 'new-reservation')));
    expect(session.holdStates()[0]).toMatchObject({ state: 'HOLDING', activeInputId: 'C' });
  });

  it('requires all rehold lanes, rejects one pointer claiming both, and recovers audio denial to PAUSED', () => {
    const session = playing(create([...hold('left', 1_000_000, 2_000_000), ...hold('right', 1_000_000, 2_000_000, 3)]));
    value(session.enqueueInput(input(1, 1_000_000, 4000)));
    value(session.enqueueInput(input(2, 1_000_000, 4000, { lane: 3, inputId: 'X' })));
    value(session.requestPause(ms(4500), context(1_500_000)));
    value(session.advancePause(ms(4550.001)));
    value(session.requestResume(ms(4551)));
    expect(session.read().reholdLanes).toEqual([1, 3]);
    value(session.rehold(left(101, 4552, 'DOWN'), ms(4552)));
    value(session.rehold({ ...left(102, 4553, 'DOWN'), lane: 3 }, ms(4553)));
    ui(session, 'REHOLD_WAIT');
    value(session.rehold({ ...left(103, 4554, 'DOWN', 'C'), lane: 3 }, ms(4554)));
    const plan = value(session.getResumePlan(ms(7554)));
    value(session.resumeDenied(plan, recoverable));
    ui(session, 'PAUSED');
    expect(session.read()).toMatchObject({ generation: 1, songTimeUs: 1_500_000, reholdLanes: [1, 3], reheldLanes: [], error: { code: 'ERR-004' } });
    expect(session.holdStates().every(hold => hold.state === 'SUSPENDED')).toBe(true);
    value(session.requestResume(ms(7555)));
    ui(session, 'REHOLD_WAIT');
    value(session.interruptResume());
    ui(session, 'PAUSED');
  });

  it('TC-D1-061 excludes a broken hold from rehold and keeps its miss at the end target', () => {
    const session = playing(create(hold('left', 1_000_000, 2_000_000)));
    value(session.enqueueInput(input(1, 1_000_000, 4000)));
    value(session.enqueueInput(input(2, 1_400_000, 4400, { action: 'UP' })));
    value(session.requestPause(ms(4500), context(1_500_000)));
    value(session.advancePause(ms(4550.001)));
    expect(session.read().reholdLanes).toEqual([]);
    expect(session.holdStates()[0]).toMatchObject({ state: 'BROKEN', startJudgement: 'PERFECT', endJudgement: 'MISS' });
    expect(value(session.read().judgement.summary).counts.miss).toBe(0);
    value(session.requestResume(ms(4551)));
    ui(session, 'RESUMING');
    const plan = value(session.getResumePlan(ms(7551)));
    value(session.completeResume(plan, identity(2, 'take-2')));
    value(session.advance(context(2_050_001, 0, 2), ms(8101.001)));
    expect(value(session.read().judgement.summary).counts).toMatchObject({ perfect: 1, miss: 1 });
  });

  it('uses occurrence at or after RESUME and keeps preceding pause input out of rehold', () => {
    const session = suspended();
    value(session.requestResume(ms(4551)));
    value(session.rehold(input(1, 1_000_000, 4000, { receivedPerformanceMs: ms(4552) }), ms(4552)));
    value(session.rehold(left(101, 4550.999, 'DOWN', 'B', 4553), ms(4553)));
    expect(session.read()).toMatchObject({ state: 'REHOLD_WAIT', reheldLanes: [], resumeReadyAtMs: null });
    value(session.rehold(left(102, 4551, 'DOWN', 'B', 4554), ms(4554)));
    expect(session.read()).toMatchObject({ state: 'RESUMING', reheldLanes: [1], resumeReadyAtMs: 7554 });
    expect(value(session.read().judgement.summary).counts).toMatchObject({ perfect: 1, miss: 0, ghost: 0 });
  });

  it('orders reversed releases and presses by occurrence and sequence and makes repeat IDs idempotent', () => {
    const session = suspended();
    value(session.requestResume(ms(4551)));
    const release = left(102, 4552, 'UP', 'B', 4553);
    value(session.rehold(release, ms(4553)));
    value(session.rehold(left(101, 4552, 'DOWN', 'B', 4554), ms(4554)));
    expect(session.read()).toMatchObject({ state: 'REHOLD_WAIT', reheldLanes: [] });
    const press = left(103, 4552, 'DOWN', 'B', 4555);
    value(session.rehold(press, ms(4555)));
    value(session.rehold(left(104, 4551.999, 'UP', 'B', 4556), ms(4556)));
    value(session.rehold(release, ms(4553)));
    value(session.rehold(press, ms(4555)));
    expect(session.read()).toMatchObject({ state: 'RESUMING', reheldLanes: [1], resumeReadyAtMs: 7555 });
    value(session.rehold(left(105, 4552, 'UP', 'B', 4557), ms(4557)));
    value(session.rehold(press, ms(4555)));
    expect(session.read()).toMatchObject({ state: 'REHOLD_WAIT', reheldLanes: [], resumeReadyAtMs: null });
  });

  it('stops when distinct rehold events claim the same occurrence and sequence', () => {
    const session = suspended();
    value(session.requestResume(ms(4551)));
    value(session.rehold(left(101, 4552, 'DOWN'), ms(4552)));
    const ambiguous = { ...left(101, 4552, 'UP', 'B', 4553), eventId: 'unrelated-id' };
    expect(session.rehold(ambiguous, ms(4553))).toMatchObject({ ok: false, error: { code: 'ERR-018', messageKey: 'input.ambiguousReholdSequence' } });
    ui(session, 'ERROR');
  });

  it('uses the fixed start as late-release cutoff and safely stops on a matching unseen pre-start UP', () => {
    const session = suspended();
    value(session.requestResume(ms(4551)));
    const press = left(101, 4552, 'DOWN');
    value(session.rehold(press, ms(4552)));
    const plan = value(session.getResumePlan(ms(7552)));
    value(session.completeResume(plan, identity(2, 'take-2'), ms(7580), ms(7575)));
    expect(session.holdStates()[0]).toMatchObject({ state: 'HOLDING', activeInputId: 'B' });
    const frozen = session.read().judgement;
    expect(value(session.enqueueInput(press)).reason).toBe('DUPLICATE');
    for (const harmless of [
      left(102, 4551.999, 'UP', 'B', 7581), left(103, 7574, 'UP', 'different-owner', 7581),
      { ...left(104, 7574, 'UP', 'B', 7581), lane: 2 as const }, left(105, 7575, 'UP', 'B', 7581),
      left(106, 7575.001, 'UP', 'B', 7581), left(107, 7574, 'DOWN', 'B', 7581),
    ]) expect(value(session.enqueueInput(harmless)).accepted).toBe(false);
    expect(session.enqueueInput(left(108, 7574.999, 'UP', 'B', 7582))).toMatchObject({
      ok: false, error: { code: 'ERR-007', messageKey: 'input.lateReholdRelease' },
    });
    ui(session, 'ERROR');
    expect(session.read().judgement.official).toEqual(frozen.official);
    expect(session.read().judgement.processedBeforeUs).toBe(frozen.processedBeforeUs);
    expect(session.getFinalResult()).toBeNull();
  });
});

it('TC-D1-063 and D4-029 classify stale inputs and buffer post-pause input until the watermark strictly catches up', () => {
  const session = playing(create([tap('first', 1_000_000), tap('late', 2_000_000)], 200_000));
  const boundaryInput = input(1, 1_200_000, 4200, { offset: 200_000 });
  value(session.enqueueInput(boundaryInput));
  value(session.requestPause(ms(4200), context(1_200_000, 200_000)));
  const plan = prepareResume(session, 4200);
  value(session.completeResume(plan, identity(2, 'take-2')));
  expect(value(session.enqueueInput(boundaryInput)).reason).toBe('DUPLICATE');
  expect(value(session.enqueueInput(input(2, 1_200_001, 4200.001, { offset: 200_000 }))).reason).toBe('STALE_SESSION');
  expect(value(session.enqueueInput(input(3, 1_200_000, 7251, { offset: 200_000, clockGeneration: gen(2), lane: 3 }))).reason).toBe('IGNORED_STATE');
  expect(value(session.enqueueInput(input(4, 1_200_001, 7251.001, { offset: 200_000, clockGeneration: gen(2), lane: 3 }))).accepted).toBe(true);
  for (const song of [1_200_000, 1_250_000, 1_250_001]) {
    value(session.advance(context(song, 200_000, 2), ms(7251 + (song - 1_200_000) / 1000)));
    expect(session.read().judgement.processedBeforeUs).toBe(1_000_001);
    expect(value(session.read().judgement.summary).counts.ghost).toBe(0);
  }
  value(session.advance(context(1_250_002, 200_000, 2), ms(7301.002)));
  expect(value(session.read().judgement.summary).counts.ghost).toBe(1);
  expect(session.enqueueInput(input(5, 1_199_999, 4199.999, { offset: 200_000, lane: 4, receivedPerformanceMs: ms(7302) }))).toMatchObject({ ok: false, error: { code: 'ERR-007' } });
  ui(session, 'ERROR');
  expect(value(session.read().judgement.summary).counts).toMatchObject({ perfect: 1, ghost: 1 });
  expect(session.getFinalResult()).toBeNull();
});

it('TC-D1-064 and D4-021–024 hold FINALIZING through F, accept C only, and seal one formal result at F+1', () => {
  const session = playing(create([tap('terminal', 2_000_000)], 200_000, 'FORMAL', 2_000_000));
  expect(session.read()).toMatchObject({ closeSongUs: 2_350_000, finalSongUs: 2_400_000 });
  for (const stale of [ended(1, 'old-playback'), ended(1, 'take-1', 'S0'), ended(1, 'take-1', 'S1', 0), ended(0)]) {
    value(session.handleAudioEvent(stale, ms(5000), context(2_000_000, 200_000)));
    ui(session, 'PLAYING');
  }
  value(session.handleAudioEvent(ended(), ms(5000), context(2_000_000, 200_000)));
  ui(session, 'FINALIZING');
  value(session.handleAudioEvent({ ...identity(), requestId: 'play', kind: 'INTERRUPTED', at: ms(5001) },
    ms(5001), context(2_001_000, 200_000)));
  ui(session, 'FINALIZING');
  value(session.enqueueInput(input(1, 2_350_000, 5350, { offset: 200_000 })));
  expect(value(session.enqueueInput(input(2, 2_350_001, 5350.001, { offset: 200_000, lane: 3 }))).accepted).toBe(false);
  value(session.advance(context(2_400_000, 200_000), ms(5400)));
  ui(session, 'FINALIZING');
  expect(session.getFinalResult()).toBeNull();
  value(session.advance(context(2_400_001, 200_000), ms(5400.001)));
  ui(session, 'CLEAR');
  const result = session.getFinalResult();
  expect(result).toMatchObject({ outcome: 'CLEAR', counts: { good: 1, miss: 0, ghost: 0 }, remainingLifeUnits: 200 });
  const revision = session.read().revision;
  value(session.handleAudioEvent(ended(), ms(5500), context(2_500_000, 200_000)));
  value(session.fail(recoverable));
  expect(session.abort().ok).toBe(false);
  expect(session.getFinalResult()).toBe(result);
  expect(session.read().revision).toBe(revision);
});

it('TC-D1-065 resumes FINALIZING at B with no BGM identity and preserves final processing', () => {
  const session = playing(create([tap('terminal', 2_000_000)], 200_000, 'FORMAL', 2_000_000));
  value(session.handleAudioEvent(ended(), ms(5000), context(2_000_000, 200_000)));
  value(session.requestPause(ms(5100), context(2_100_000, 200_000)));
  const plan = prepareResume(session, 5100);
  expect(plan).toMatchObject({ target: 'FINALIZING', playBgm: false, sourceOffsetUs: null, sourceDelayUs: 0, songTimeUs: 2_100_000 });
  expect(session.completeResume(plan, identity(2, 'unexpected-bgm')).ok).toBe(false);
  value(session.completeResume(plan));
  expect(session.read()).toMatchObject({ state: 'FINALIZING', generation: 2, songTimeUs: 2_100_000 });
  value(session.enqueueInput(input(1, 2_200_000, 8251, { offset: 200_000, clockGeneration: gen(2) })));
  value(session.advance(context(2_400_001, 200_000, 2), ms(8451.001)));
  expect(session.getFinalResult()).toMatchObject({ outcome: 'CLEAR', score: 1_000_000 });
});

it('TC-D1-070 leaves a later deadline pending while paused and resolves it once after the exclusive boundary', () => {
  const session = playing(create([tap('pending', 1_000_000)]));
  value(session.requestPause(ms(4100), context(1_100_000)));
  value(session.advancePause(ms(5150)));
  expect(value(session.read().judgement.summary).counts.miss).toBe(0);
  value(session.requestResume(ms(5150)));
  const plan = value(session.getResumePlan(ms(8150)));
  value(session.completeResume(plan, identity(2, 'new')));
  value(session.advance(context(1_200_000, 0, 2), ms(8250)));
  expect(value(session.read().judgement.summary).counts.miss).toBe(0);
  value(session.advance(context(1_200_001, 0, 2), ms(8250.001)));
  value(session.advance(context(1_300_000, 0, 2), ms(8350)));
  expect(value(session.read().judgement.summary).counts.miss).toBe(1);
});

it('TC-D4-036 lets practice reach zero life and internal CLEAR while IF-11 remains null', () => {
  const notes = Array.from({ length: 12 }, (_item, index) => tap(`n${index}`, 200_000 + index * 100_000));
  const session = playing(create(notes, 0, 'PRACTICE', 2_000_000));
  value(session.advance(context(1_500_001), ms(4500.001)));
  expect(session.read().judgement.lifeUnits).toBe(0);
  ui(session, 'PLAYING');
  value(session.handleAudioEvent(ended(), ms(5000), context(2_000_000)));
  value(session.advance(context(2_050_001), ms(5050.001)));
  ui(session, 'CLEAR');
  expect(session.getFinalResult()).toBeNull();
  expect(value(session.read().judgement.summary).counts.miss).toBe(12);
});

it('uses matching audio interrupt identities and fails safely on unavailable or regressing clock', () => {
  const session = playing(create([tap('later', 2_000_000)]));
  value(session.handleAudioEvent({ ...identity(1, 'old'), requestId: 'play', kind: 'INTERRUPTED', at: ms(3500) }, ms(3500), context(500_000)));
  ui(session, 'PLAYING');
  value(session.handleAudioEvent({ ...identity(), requestId: 'play', kind: 'INTERRUPTED', at: ms(3500) }, ms(3500), context(500_000)));
  ui(session, 'PAUSING');
  const plan = prepareResume(session, 3500);
  value(session.completeResume(plan, identity(2, 'new')));
  expect(session.advance(context(499_999, 0, 2), ms(6551.001))).toMatchObject({ ok: false, error: { code: 'ERR-006' } });
  ui(session, 'ERROR');
  expect(session.getFinalResult()).toBeNull();
  const unavailable = playing(create([tap('later', 2_000_000)]));
  expect(unavailable.requestPause(ms(3500))).toMatchObject({ ok: false, error: { code: 'ERR-005' } });
  ui(unavailable, 'ERROR');
});

it('publishes discrete state and judgement changes without publishing pure clock frames', () => {
  const session = create([tap('target', 1_000_000)]);
  const seen: number[] = [];
  const unsubscribe = session.subscribe(() => seen.push(session.read().revision));
  playing(session);
  value(session.advance(context(50_000), ms(3050)));
  value(session.advance(context(100_000), ms(3100)));
  expect(seen).toHaveLength(3);
  value(session.enqueueInput(input(1, 1_000_000, 4000)));
  value(session.advance(context(1_050_001), ms(4050.001)));
  expect(seen).toHaveLength(4);
  unsubscribe();
  unsubscribe();
  value(session.abort());
  expect(seen).toHaveLength(4);
});
