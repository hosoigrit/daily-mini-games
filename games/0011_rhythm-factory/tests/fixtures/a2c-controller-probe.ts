import { expect, vi } from 'vitest';
import { createSessionController } from '../../src/app/session-controller';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import type {
  AudioEvent, GameError, Gen, LifecycleEvent, Ms, MusicDefinition,
  PlaybackAnchor, PreparedTrack, Result, Sec, Token, Us,
} from '../../src/contracts/interface_contracts';
import type { SessionAudioPort } from '../../src/contracts/session-ports';
import { createFixedAudioClock } from '../../src/domain/audio-clock';
import { buildIdealInputs, compileChart, createChartMusicContext } from '../../src/domain/chart-compiler';
import { createSaveRules } from '../../src/domain/save-data';
import { createSignal } from '../../src/domain/signal';
import { createStorageCoordinator, saveStorageKey } from '../../src/infrastructure/storage-coordinator';
import { createWriterLock } from '../../src/infrastructure/writer-lock';

export const ms = (value: number) => value as Ms;
export const us = (value: number) => value as Us;
export const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const unavailable: GameError = { code: 'ERR-004', severity: 'ERROR', messageKey: 'audio.gestureRequired', recoverable: true };
const denied = { ok: false, error: unavailable } as const;

export function value<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error.messageKey);
  return result.value;
}

export const trial = value(compileChart(stageA2TrialChart, createChartMusicContext(stageA2TrialMusic), 'complete'));
const definition = stageA2TrialMusic;
const selection = { chart: trial, definition };
const rules = createSaveRules([trial]);
export const zeroTime = 4200;

function createAudioProbe() {
  const events = createSignal<AudioEvent>();
  const clocks = new Map<Gen, ReturnType<typeof clockEntry>>();
  const starts: PlaybackAnchor[] = [];
  let lastRequest: Token | null = null;
  let lastAnchor: PlaybackAnchor | null = null;
  const render = (music: MusicDefinition, request: Token): Result<PreparedTrack> => ok({
    musicId: music.master.musicId, durationUs: trial.durationUs, channels: 2, sampleRate: 48_000,
    preparationId: request.requestId,
  });
  function clockEntry(anchor: PlaybackAnchor, offsetUs: Us) {
    return { anchor, clock: value(createFixedAudioClock(anchor, offsetUs)) };
  }
  const audio = {
    prepare: vi.fn(async (music, request) => render(music, request)),
    enable: vi.fn(async (): Promise<Result<void>> => ok(undefined)),
    anchorAvailable: () => true,
    start: vi.fn(request => {
      lastRequest = request.token;
      lastAnchor = {
        playbackId: `probe-${starts.length + 1}`, sessionId: request.token.sessionId, generation: request.token.generation,
        startSongUs: request.songTimeUs, startAudioSec: (10 + (request.playBgm ? 0.05 : 0)) as Sec,
        anchorAudioSec: 10 as Sec, anchorPerformanceMs: request.atMs,
      };
      starts.push(lastAnchor);
      clocks.set(lastAnchor.generation, clockEntry(lastAnchor, request.offsetUs));
      return ok(lastAnchor);
    }),
    stop: vi.fn(() => ok(undefined)),
    preview: vi.fn(() => ok(undefined)),
    convert(at, generation) {
      return clocks.get(generation)?.clock.convertEventTime(at, generation) ?? denied;
    },
    contextAt: () => null,
    monitor: () => ok(undefined),
    applySettings: vi.fn(),
    subscribeAudioEvents: events.subscribe,
    forgetSession(sessionId) {
      for (const [generation, entry] of clocks) if (entry.anchor.sessionId === sessionId) clocks.delete(generation);
    },
    forgetGeneration: generation => { clocks.delete(generation); },
  } satisfies SessionAudioPort;

  return {
    audio, render, starts,
    ended() {
      if (!lastAnchor || !lastRequest) throw new Error('No playback');
      events.publish({ ...lastRequest, kind: 'ENDED', playbackId: lastAnchor.playbackId, clockGeneration: lastAnchor.generation });
    },
  };
}

export function rig() {
  const fakeAudio = createAudioProbe();
  let raw: string | null = null;
  let writes = 0;
  let writeWorks = true;
  let loseConfirmation = false;
  let readWorks = true;
  let now = 0;
  let sessionId = 0;
  let epoch = 0;
  let acquired = false;
  const manager = {
    async request(name: string, _config: LockOptions, callback: LockGrantedCallback<unknown>) {
      if (acquired) return callback(null);
      acquired = true;
      try {
        return await callback({ name, mode: 'exclusive' });
      } finally {
        acquired = false;
      }
    },
  } as Pick<LockManager, 'request'>;
  const writer = createWriterLock({ ownerId: 'test-page', locks: manager });
  const storage = createStorageCoordinator({
    rules, lock: writer, createEpoch: () => `epoch-${++epoch}`,
    storage: {
      getItem(key) {
        expect(key).toBe(saveStorageKey);
        if (!readWorks) throw new Error('read unavailable');
        return raw;
      },
      setItem(key, next) {
        expect(key).toBe(saveStorageKey);
        if (!writeWorks) throw new Error('write failure');
        raw = next;
        writes++;
        if (loseConfirmation) { loseConfirmation = false; readWorks = false; }
      },
    },
  });
  const controller = createSessionController({
    audio: fakeAudio.audio, storage, writer: {
      status: () => writer.currentLease() ? 'OWNED' : 'UNOWNED',
      currentLease: writer.currentLease,
    },
    getMusic: id => id === definition.master.musicId ? definition : null,
    getChart: (id, difficulty) => id === trial.musicId && difficulty === 'HARD' ? trial : null,
    getTutorial: id => id === 'TUT-01' ? selection : null,
    settingsValid: () => true,
    nextSessionId: () => `session-${++sessionId}`,
    now: () => ms(now),
    recordedAt: () => '2026-11-26T06:00:00.000Z',
  });
  const at = (time: number) => { now = time; };
  const step = (time: number) => { at(time); controller.advance(ms(time)); };
  const lifecycle = (kind: LifecycleEvent['kind']) => controller.handleLifecycleEvent({
    kind, atPerformanceMs: ms(now), sessionId: null, generation: null,
  });
  const session = () => {
    const session = controller.read().session;
    if (!session) throw new Error('No active session');
    return session;
  };
  const select = async () => {
    value(await lifecycle('PAGESHOW'));
    expect(controller.navigate('MENU')).toBe(true);
    expect(controller.navigate('MUSIC_SELECT')).toBe(true);
    await Promise.resolve();
    value(await controller.dispatch({ kind: 'SELECT_DIFFICULTY', difficulty: 'HARD', sessionId: null, requestId: 'hard' }));
  };

  const start = async () => {
    await select();
    value(await controller.dispatch({ kind: 'START_GAME', sessionId: null, requestId: 'start' }));
    step(1000);
    expect(session().state).toBe('COUNTDOWN');
    return session();
  };
  const enterPlayback = () => { step(4000); step(4050); };
  const ideal = () => buildIdealInputs(trial, {
    sessionId: session().sessionId, clockGeneration: session().generation, performanceOriginMs: ms(zeroTime),
  });
  const finishIdeal = () => {
    for (const input of ideal()) value(controller.enqueueInput(input));
    at(zeroTime + 24_000);
    fakeAudio.ended();
    expect(session().state).toBe('FINALIZING');
    step(zeroTime + 24_050);
    expect(controller.getFinalResult()).toBeNull();
    step(zeroTime + 24_050.001);
  };
  return {
    ...fakeAudio, controller, storage, writer, at, step, select, start, lifecycle, session, enterPlayback, ideal, finishIdeal,
    raw: () => raw, writes: () => writes, interfereWrite: () => { writeWorks = false; },
    restoreWrites: () => { writeWorks = true; },
    failNextReadback: () => { loseConfirmation = true; },
    restoreReads: () => { readWorks = true; },
  };
}
