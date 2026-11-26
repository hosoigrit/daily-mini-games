import type {
  AudioEvent, CompiledChart, ConvertedTime, FinalResult, GameError, GameState, Gen, InputReceipt, Lane, Ms,
  NormalizedInput, PauseBoundary, Result, TransitionResult, Us,
} from '../contracts/interface_contracts';
import { deliveryWaitUs } from './input-queue';
import { createJudgementEngine } from './judgement-engine';
import { goodWindowUs } from './judgement-timing';
import { createSignal } from './signal';

export type SessionMode = 'FORMAL' | 'PRACTICE';
type PlaybackPhase = 'PREROLL' | 'PLAYING' | 'FINALIZING';
type PauseSource = 'COUNTDOWN' | PlaybackPhase;
type Destination = GameState | 'NEW_SESSION_READY';
export type SessionEvent =
  | 'START_GAME' | 'START_TUTORIAL' | 'READY_AUDIO_CLOCK' | 'RECOVERABLE_AUDIO_DENIAL' | 'COUNTDOWN_END'
  | 'SONG_ZERO' | 'SONG_END' | 'PAUSE_OR_INTERRUPT' | 'PAUSE_DRAIN_DONE' | 'INCONSISTENT' | 'RESUME_GAME'
  | 'ALL_REHELD' | 'INTERRUPT' | 'REHOLD_RELEASE' | 'RESUME_COUNTDOWN_END' | 'LIFE_ZERO_COMMITTED'
  | 'FINAL_DRAIN_DONE' | 'ABORT_GAME' | 'UNRECOVERABLE_ERROR' | 'STALE_EVENT' | 'RETRY_GAME';

type Rule = readonly [previous: GameState, event: SessionEvent, next: Destination, mode?: SessionMode];
const playbackPhases = ['PREROLL', 'PLAYING', 'FINALIZING'] as const;
const pauseSources = ['COUNTDOWN', ...playbackPhases] as const;
const activeStates = ['READY', 'INITIALIZING', ...pauseSources, 'PAUSING', 'PAUSED', 'REHOLD_WAIT', 'RESUMING'] as const;
const terminalStates = ['CLEAR', 'FAILED', 'ABORTED', 'ERROR'] as const;
const phaseRules: readonly Rule[] = [
  ['READY', 'START_GAME', 'INITIALIZING', 'FORMAL'],
  ['READY', 'START_TUTORIAL', 'INITIALIZING', 'PRACTICE'],
  ['INITIALIZING', 'START_GAME', 'INITIALIZING', 'FORMAL'],
  ['INITIALIZING', 'READY_AUDIO_CLOCK', 'COUNTDOWN'],
  ['INITIALIZING', 'RECOVERABLE_AUDIO_DENIAL', 'INITIALIZING'],
  ['INITIALIZING', 'INTERRUPT', 'READY'],
  ['COUNTDOWN', 'COUNTDOWN_END', 'PREROLL'],
  ['COUNTDOWN', 'COUNTDOWN_END', 'PLAYING'],
  ['PREROLL', 'SONG_ZERO', 'PLAYING'],
  ['PLAYING', 'SONG_END', 'FINALIZING'],
  ...pauseSources.map((from): Rule => [from, 'PAUSE_OR_INTERRUPT', 'PAUSING']),
  ['PAUSING', 'PAUSE_DRAIN_DONE', 'PAUSED'],
  ['PAUSING', 'PAUSE_DRAIN_DONE', 'FAILED', 'FORMAL'],
  ['PAUSING', 'INCONSISTENT', 'ERROR'],
  ['PAUSED', 'RESUME_GAME', 'REHOLD_WAIT'],
  ['PAUSED', 'RESUME_GAME', 'RESUMING'],
  ['REHOLD_WAIT', 'ALL_REHELD', 'RESUMING'],
  ['REHOLD_WAIT', 'INTERRUPT', 'PAUSED'],
  ['RESUMING', 'REHOLD_RELEASE', 'REHOLD_WAIT'],
  ['RESUMING', 'INTERRUPT', 'PAUSED'],
  ['RESUMING', 'RECOVERABLE_AUDIO_DENIAL', 'PAUSED'],
  ...pauseSources.map((to): Rule => ['RESUMING', 'RESUME_COUNTDOWN_END', to]),
  ...[...playbackPhases, 'PAUSING' as const].map((from): Rule => [from, 'LIFE_ZERO_COMMITTED', 'FAILED', 'FORMAL']),
  ['FINALIZING', 'FINAL_DRAIN_DONE', 'CLEAR', 'FORMAL'],
  ['FINALIZING', 'FINAL_DRAIN_DONE', 'CLEAR', 'PRACTICE'],
  ...activeStates.flatMap((from): Rule[] => [[from, 'ABORT_GAME', 'ABORTED'], [from, 'UNRECOVERABLE_ERROR', 'ERROR']]),
  ...terminalStates.map((from): Rule => from === 'FAILED'
    ? [from, 'STALE_EVENT', from, 'FORMAL'] : [from, 'STALE_EVENT', from]),
  ...['PAUSED' as const, ...terminalStates].map((from): Rule => [from, 'RETRY_GAME', 'NEW_SESSION_READY']),
];

export function isSessionTransitionListed(previous: GameState, event: SessionEvent, next: Destination, mode: SessionMode): boolean {
  return phaseRules.some(([from, trigger, to, requiredMode]) =>
    previous === from && event === trigger && next === to && (!requiredMode || requiredMode === mode));
}

const countdownMs = 3000;
const stoppedDeliveryMs = deliveryWaitUs / 1000;
const zeroUs = 0 as Us;
const noLanes: readonly Lane[] = Object.freeze([]);

const hasPlayback = (state: GameState): state is PlaybackPhase => state === 'PREROLL' || state === 'PLAYING' || state === 'FINALIZING';
const canPause = (state: GameState): state is PauseSource => state === 'COUNTDOWN' || hasPlayback(state);
const isTerminal = (state: GameState) => state === 'CLEAR' || state === 'FAILED' || state === 'ABORTED' || state === 'ERROR';
const isWallTime = (time: Ms) => Number.isSafeInteger(Math.round(time * 1000)) && time >= 0;

export interface SessionAudioIdentity {
  readonly sessionId: string;
  readonly generation: Gen;
  readonly playbackId: string;
}

export interface SessionResumePlan {
  readonly sessionId: string;
  readonly generation: Gen;
  readonly target: PauseSource;
  readonly songTimeUs: Us | null;
  readonly sourceOffsetUs: Us | null;
  readonly sourceDelayUs: Us;
  readonly playBgm: boolean;
}

interface Options {
  readonly sessionId: string;
  readonly generation: Gen;
  readonly mode?: SessionMode;
  readonly offsetUs?: Us;
}

interface PauseRecord {
  readonly from: PauseSource;
  readonly atMs: Ms;
  readonly boundary: PauseBoundary | null;
}

type ReholdInput = Pick<NormalizedInput, 'lane' | 'inputId' | 'action' | 'clockGeneration'>;

export function createGameSession(chart: CompiledChart, options: Options) {
  const { sessionId, mode = 'FORMAL', offsetUs = zeroUs } = options;
  let generation = options.generation;
  const engineResult = createJudgementEngine(chart, { sessionId, generation, offsetUs, mode, deferClear: true });
  if (!engineResult.ok) return engineResult;
  const engine = engineResult.value;
  const { durationUs } = chart;
  const firstTarget = chart.events.reduce((first, event) => Math.min(first, event.targetTimeUs), Infinity);
  const lastTarget = chart.events.reduce((last, event) => Math.max(last, event.targetTimeUs), -Infinity);
  const startSongUs = Math.min(0, firstTarget + offsetUs - goodWindowUs) as Us;
  const closeSongUs = Math.max(durationUs, lastTarget + offsetUs + goodWindowUs) as Us;
  const finalSongUs = (closeSongUs + deliveryWaitUs) as Us;

  function error(code: GameError['code'], messageKey: string, recoverable = false): GameError {
    return Object.freeze({ code, messageKey, sessionId, severity: 'ERROR', recoverable });
  }
  function reject<T = never>(messageKey = 'session.invalidTransition'): Result<T> {
    return { ok: false, error: error('ERR-008', messageKey, true) };
  }
  if (!Number.isSafeInteger(startSongUs) || !Number.isSafeInteger(startSongUs - offsetUs)
      || !Number.isSafeInteger(finalSongUs) || (mode !== 'FORMAL' && mode !== 'PRACTICE')) {
    return { ok: false as const, error: error('ERR-018', 'session.invalidConfiguration') };
  }

  const updates = createSignal<void>();
  let state: GameState = 'READY';
  let revision = 0;
  let officialChanges = 0;
  let clock: ConvertedTime | null = null;
  let wallMs: Ms | null = null;
  let countdownEndsAtMs: Ms | null = null;
  let resumeReadyAtMs: Ms | null = null;
  let activeAudio: SessionAudioIdentity | null = null;
  let audioEnded = false;
  let pause: PauseRecord | null = null;
  let pauseBoundary: PauseBoundary | null = null;
  let abortPending = false;
  let resumePlan: SessionResumePlan | null = null;
  let reholdLanes = noLanes;
  const reheld = new Map<Lane, string>();
  let lastError: GameError | null = null;

  function sendUpdate() {
    revision++;
    updates.publish();
  }

  function unchanged(): Result<TransitionResult> {
    return { ok: true, value: { previous: state, current: state, sessionId } };
  }

  function move(event: SessionEvent, next: GameState, notify = true): Result<TransitionResult> {
    if (!isSessionTransitionListed(state, event, next, mode)) return reject();
    const previous = state;
    state = next;
    if (isTerminal(next)) {
      activeAudio = null;
      countdownEndsAtMs = null;
      resumeReadyAtMs = null;
      resumePlan = null;
      reholdLanes = noLanes;
      reheld.clear();
      abortPending = false;
    }
    const value = { previous, current: next, sessionId };
    if (notify) sendUpdate();
    return { ok: true, value };
  }

  function fail(fault: GameError): Result<TransitionResult> {
    if (isTerminal(state) || (fault.sessionId !== undefined && fault.sessionId !== sessionId)) return unchanged();
    lastError = Object.freeze({ ...fault });
    return move(state === 'PAUSING' ? 'INCONSISTENT' : 'UNRECOVERABLE_ERROR', 'ERROR');
  }

  function stopWith(fault: GameError): Result<never> {
    fail(fault);
    return { ok: false, error: fault };
  }

  function markWall(time: Ms): boolean {
    if (!isWallTime(time) || (wallMs !== null && time < wallMs)) return false;
    wallMs = time;
    return true;
  }

  function validClock(time: ConvertedTime): boolean {
    return Number.isSafeInteger(time.songTimeUs) && Number.isSafeInteger(time.judgeTimeUs)
      && time.songTimeUs - time.judgeTimeUs === offsetUs;
  }

  function clockAt(songTimeUs: Us): ConvertedTime {
    return Object.freeze({ generation, songTimeUs, judgeTimeUs: (songTimeUs - offsetUs) as Us });
  }

  function matchesAudio(identity: SessionAudioIdentity | undefined, expectedGeneration: Gen) {
    return !!identity && identity.sessionId === sessionId && identity.generation === expectedGeneration
      && typeof identity.playbackId === 'string' && identity.playbackId.trim() !== '';
  }

  function beginInitialization(): Result<TransitionResult> {
    const event = mode === 'PRACTICE' ? 'START_TUTORIAL' : 'START_GAME';
    if (state !== 'READY' && (state !== 'INITIALIZING' || !lastError?.recoverable || mode !== 'FORMAL')) return reject();
    lastError = null;
    return move(event, 'INITIALIZING');
  }

  function initializationReady(atMs: Ms): Result<TransitionResult> {
    if (state !== 'INITIALIZING' || lastError !== null || !markWall(atMs)) return reject();
    countdownEndsAtMs = (atMs + countdownMs) as Ms;
    return move('READY_AUDIO_CLOCK', 'COUNTDOWN');
  }

  function initializationDenied(fault: GameError): Result<TransitionResult> {
    if (state !== 'INITIALIZING' || lastError !== null || (fault.sessionId !== undefined && fault.sessionId !== sessionId)) return reject();
    if (!fault.recoverable) return stopWith(fault);
    lastError = Object.freeze({ ...fault });
    return move('RECOVERABLE_AUDIO_DENIAL', 'INITIALIZING');
  }

  function initializationInterrupted(): Result<TransitionResult> {
    if (state !== 'INITIALIZING') return reject();
    lastError = null;
    return move('INTERRUPT', 'READY');
  }

  function startPlayback(atMs: Ms, identity: SessionAudioIdentity): Result<TransitionResult> {
    if (!matchesAudio(identity, generation)) return unchanged();
    if (state !== 'COUNTDOWN' || countdownEndsAtMs === null || atMs < countdownEndsAtMs || !markWall(atMs)) return reject();
    clock = clockAt(startSongUs);
    activeAudio = Object.freeze({ ...identity });
    audioEnded = false;
    countdownEndsAtMs = null;
    return move('COUNTDOWN_END', startSongUs < 0 ? 'PREROLL' : 'PLAYING');
  }

  function advance(time: ConvertedTime, atMs: Ms): Result<TransitionResult> {
    if (!hasPlayback(state) || time.generation !== generation) return unchanged();
    if (!validClock(time) || (clock !== null && time.songTimeUs < clock.songTimeUs) || !markWall(atMs)) {
      return stopWith(error('ERR-006', 'session.invalidClock'));
    }
    clock = Object.freeze({ ...time });
    const previous = state;
    if (state === 'PREROLL' && time.songTimeUs >= 0) move('SONG_ZERO', 'PLAYING', false);
    if (state === 'PLAYING' && audioEnded && time.songTimeUs >= durationUs) move('SONG_END', 'FINALIZING', false);

    const advanced = engine.advance(time.judgeTimeUs);
    if (!advanced.ok) return stopWith(advanced.error);
    if (engine.getFinalResult()?.outcome === 'FAILED') return move('LIFE_ZERO_COMMITTED', 'FAILED');
    if (state === 'FINALIZING' && time.songTimeUs > finalSongUs) {
      const completed = engine.completeClear(time.judgeTimeUs);
      if (!completed.ok) return stopWith(completed.error);
      if (engine.getFinalResult()?.outcome === 'CLEAR') return move('FINAL_DRAIN_DONE', 'CLEAR');
    }
    const length = engine.read().official.length;
    if (state !== previous || length !== officialChanges) {
      officialChanges = length;
      sendUpdate();
    }
    return { ok: true, value: { previous, current: state, sessionId } };
  }

  function requestPause(atMs: Ms, time?: ConvertedTime): Result<TransitionResult> {
    if (state === 'PAUSING') return unchanged();
    if (!canPause(state)) return reject();
    if (state !== 'COUNTDOWN' && time?.generation !== undefined && time.generation !== generation) return unchanged();
    if (!isWallTime(atMs)) return stopWith(error('ERR-006', 'session.invalidPauseTime'));
    // A lifecycle event can be delivered after a more recent frame. Use its recorded
    // occurrence time for B and the delivery deadline; do not move the wall clock back.
    if (wallMs === null || atMs > wallMs) wallMs = atMs;
    let from: PauseSource = state;
    let boundary: PauseBoundary | null = null;
    if (state !== 'COUNTDOWN') {
      if (!time || !validClock(time) || time.songTimeUs < startSongUs || !Number.isSafeInteger(time.judgeTimeUs + 1)) {
        return stopWith(error('ERR-005', 'session.pauseBoundaryUnavailable'));
      }
      const opened = engine.openPause(time.judgeTimeUs);
      if (!opened.ok) return stopWith(opened.error);
      from = time.songTimeUs < 0 ? 'PREROLL' : audioEnded && time.songTimeUs >= durationUs ? 'FINALIZING' : 'PLAYING';
      clock = Object.freeze({ ...time });
      boundary = Object.freeze({ generation, songTimeUs: time.songTimeUs, judgeTimeUs: time.judgeTimeUs,
        atPerformanceMs: atMs, processedBeforeUs: engine.read().processedBeforeUs, resumeState: from });
    }
    pause = Object.freeze({ from, atMs, boundary });
    pauseBoundary = boundary;
    countdownEndsAtMs = null;
    activeAudio = null;
    abortPending = false;
    return move('PAUSE_OR_INTERRUPT', 'PAUSING');
  }

  function advancePause(atMs: Ms): Result<TransitionResult> {
    if (state !== 'PAUSING' || !pause) return unchanged();
    if (!markWall(atMs)) return stopWith(error('ERR-006', 'session.invalidPauseTime'));
    if (atMs <= pause.atMs + stoppedDeliveryMs) return unchanged();
    if (pause.boundary !== null) {
      const drained = engine.drainThroughPause(pause.boundary.judgeTimeUs);
      if (!drained.ok) return stopWith(drained.error);
      const judgement = engine.read();
      pauseBoundary = Object.freeze({ ...pause.boundary, processedBeforeUs: judgement.processedBeforeUs });
      officialChanges = judgement.official.length;
      if (engine.getFinalResult()?.outcome === 'FAILED') return move('PAUSE_DRAIN_DONE', 'FAILED');
    }
    if (abortPending) return move('ABORT_GAME', 'ABORTED');
    reholdLanes = Object.freeze(engine.holdStates().filter(hold => hold.state === 'SUSPENDED').map(hold => hold.lane).sort());
    reheld.clear();
    return move('PAUSE_DRAIN_DONE', 'PAUSED');
  }

  function requestResume(atMs: Ms): Result<TransitionResult> {
    if (state !== 'PAUSED' || !pause || !markWall(atMs)) return reject();
    reheld.clear();
    resumePlan = null;
    lastError = null;
    const needHolds = reholdLanes.length > 0;
    engine.setReholdWaiting(needHolds);
    resumeReadyAtMs = needHolds ? null : (atMs + countdownMs) as Ms;
    return move('RESUME_GAME', needHolds ? 'REHOLD_WAIT' : 'RESUMING');
  }

  function rehold(input: ReholdInput, atMs: Ms): Result<TransitionResult> {
    if (input.clockGeneration !== generation || !reholdLanes.includes(input.lane)) return unchanged();
    if ((state !== 'REHOLD_WAIT' && state !== 'RESUMING') || !markWall(atMs)) return reject();
    if (typeof input.inputId !== 'string' || !input.inputId.trim() || (input.action !== 'DOWN' && input.action !== 'UP')) {
      return reject('session.invalidRehold');
    }
    if (input.action === 'UP') {
      if (reheld.get(input.lane) !== input.inputId) return unchanged();
      reheld.delete(input.lane);
      if (state === 'RESUMING') {
        resumeReadyAtMs = null;
        resumePlan = null;
        return move('REHOLD_RELEASE', 'REHOLD_WAIT');
      }
    } else {
      if (reheld.has(input.lane) || [...reheld.values()].includes(input.inputId)) return unchanged();
      reheld.set(input.lane, input.inputId);
      if (reheld.size === reholdLanes.length) {
        resumeReadyAtMs = (atMs + countdownMs) as Ms;
        return move('ALL_REHELD', 'RESUMING');
      }
    }
    sendUpdate();
    return unchanged();
  }

  function getResumePlan(atMs: Ms): Result<SessionResumePlan> {
    if (state !== 'RESUMING' || !pause || resumeReadyAtMs === null || atMs < resumeReadyAtMs || !markWall(atMs)) return reject();
    if (resumePlan) return { ok: true, value: resumePlan };
    if (!Number.isSafeInteger(generation + 1)) return stopWith(error('ERR-006', 'session.generationExhausted'));
    const songTimeUs = pause.boundary?.songTimeUs ?? null;
    const playBgm = songTimeUs !== null && pause.from !== 'FINALIZING' && songTimeUs < durationUs;
    resumePlan = Object.freeze({
      sessionId, generation: (generation + 1) as Gen, target: pause.from, songTimeUs,
      playBgm, sourceOffsetUs: playBgm ? Math.max(0, songTimeUs) as Us : null,
      sourceDelayUs: playBgm ? Math.max(0, -songTimeUs) as Us : zeroUs,
    });
    return { ok: true, value: resumePlan };
  }

  function completeResume(plan: SessionResumePlan, identity?: SessionAudioIdentity, atMs?: Ms): Result<TransitionResult> {
    if (state !== 'RESUMING' || resumePlan !== plan) return unchanged();
    if (plan.playBgm ? !matchesAudio(identity, plan.generation) : identity !== undefined) return reject('session.invalidResumeAudio');
    const completionAt = atMs ?? wallMs;
    if (completionAt === null || !markWall(completionAt)) return stopWith(error('ERR-006', 'session.invalidResumeTime'));
    const rotated = engine.resumeGeneration(plan.generation, reheld);
    if (!rotated.ok) return stopWith(rotated.error);
    generation = plan.generation;
    clock = plan.songTimeUs === null ? null : clockAt(plan.songTimeUs);
    activeAudio = identity ? Object.freeze({ ...identity }) : null;
    audioEnded = plan.songTimeUs !== null && !plan.playBgm;
    pauseBoundary = null;
    pause = null;
    resumePlan = null;
    resumeReadyAtMs = null;
    reholdLanes = noLanes;
    reheld.clear();
    if (plan.target === 'COUNTDOWN') countdownEndsAtMs = (completionAt + countdownMs) as Ms;
    return move('RESUME_COUNTDOWN_END', plan.target);
  }

  function cancelResume(event: 'RECOVERABLE_AUDIO_DENIAL' | 'INTERRUPT'): Result<TransitionResult> {
    if (state !== 'RESUMING' && state !== 'REHOLD_WAIT') return reject();
    resumePlan = null;
    resumeReadyAtMs = null;
    reheld.clear();
    engine.setReholdWaiting(false);
    return move(event, 'PAUSED');
  }

  function resumeDenied(plan: SessionResumePlan, fault: GameError): Result<TransitionResult> {
    if (state !== 'RESUMING' || resumePlan !== plan || (fault.sessionId !== undefined && fault.sessionId !== sessionId)) return unchanged();
    if (!fault.recoverable) return stopWith(fault);
    lastError = Object.freeze({ ...fault });
    return cancelResume('RECOVERABLE_AUDIO_DENIAL');
  }

  function enqueueInput(input: NormalizedInput): Result<InputReceipt> {
    if (!input || typeof input.sessionId !== 'string' || !Number.isSafeInteger(input.clockGeneration)) {
      return { ok: false, error: error('ERR-018', 'input.invalidContext') };
    }
    const receipt = (reason: 'IGNORED_STATE' | 'STALE_SESSION'): Result<InputReceipt> => ({
      ok: true, value: { eventId: input.eventId, accepted: false, reason },
    });
    if (input.sessionId !== sessionId) return receipt('STALE_SESSION');
    const prePauseInput = pause?.boundary != null && (input.clockGeneration !== generation || input.eventPerformanceMs <= pause.atMs);
    if ((!hasPlayback(state) && !(prePauseInput && !isTerminal(state))) || input.songTimeUs < startSongUs) {
      return receipt(input.clockGeneration === generation ? 'IGNORED_STATE' : 'STALE_SESSION');
    }
    const result = engine.enqueueInput(input);
    if (!result.ok && engine.read().stopError) fail(result.error);
    return result;
  }

  function abort(): Result<TransitionResult> {
    if (state === 'PAUSING') {
      abortPending = true;
      return unchanged();
    }
    return move('ABORT_GAME', 'ABORTED');
  }

  function handleAudioEvent(event: AudioEvent, atMs: Ms, time?: ConvertedTime): Result<TransitionResult> {
    if (isTerminal(state) || !activeAudio || !('playbackId' in event) || event.sessionId !== sessionId
        || event.generation !== generation || event.playbackId !== activeAudio.playbackId) return unchanged();
    if (event.kind === 'ENDED') {
      if (event.clockGeneration !== generation || audioEnded) return unchanged();
      audioEnded = true;
      activeAudio = null;
      if (time?.generation === generation) return advance(time, atMs);
      if (state === 'PLAYING' && clock !== null && clock.songTimeUs >= durationUs) return move('SONG_END', 'FINALIZING');
      return unchanged();
    }
    if (event.kind === 'INTERRUPTED' || event.kind === 'STOPPED') return requestPause(atMs, time);
    return unchanged();
  }

  return {
    ok: true as const,
    value: {
      beginInitialization, initializationReady, initializationDenied, initializationInterrupted, startPlayback, advance,
      requestPause, advancePause, requestResume, rehold, getResumePlan, completeResume, resumeDenied,
      interruptResume: () => cancelResume('INTERRUPT'), enqueueInput, abort, fail, handleAudioEvent,
      subscribe: updates.subscribe,
      canRetry: () => isSessionTransitionListed(state, 'RETRY_GAME', 'NEW_SESSION_READY', mode),
      getFinalResult: (): FinalResult | null => mode === 'FORMAL' && (state === 'CLEAR' || state === 'FAILED') ? engine.getFinalResult() : null,
      holdStates: engine.holdStates,
      renderNotes: engine.renderNotes,
      read() {
        return Object.freeze({ sessionId, generation, state, mode, revision,
          songTimeUs: clock?.songTimeUs ?? null, judgeTimeUs: clock?.judgeTimeUs ?? null,
          startSongUs, closeSongUs, finalSongUs, countdownEndsAtMs, resumeReadyAtMs, pauseBoundary,
          reholdLanes, reheldLanes: Object.freeze([...reheld.keys()].sort()), error: lastError, judgement: engine.read(),
        });
      },
    },
  };
}

export type GameSession = Extract<ReturnType<typeof createGameSession>, { ok: true }>['value'];
