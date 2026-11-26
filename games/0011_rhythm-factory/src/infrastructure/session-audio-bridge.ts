import type { ErrorCode, Gen, Ms, PlaybackAnchor, Result, Sec, Tick, Us } from '../contracts/interface_contracts';
import type { SessionAudioPort, SessionClockContext, SessionClockFactory } from '../contracts/session-ports';
import { createWebAudio } from './web-audio';

const ready = { ok: true, value: undefined } as const;
const playbackLeadSec = 0.05;

function failure(code: ErrorCode, messageKey: string): Result<never> {
  return { ok: false, error: { code, messageKey, severity: 'ERROR', recoverable: false } };
}

type FixedClock = Extract<ReturnType<SessionClockFactory>, { ok: true }>['value'];
interface GenerationClock {
  readonly anchor: PlaybackAnchor;
  readonly sinceMs: Ms;
  readonly clock: FixedClock;
}

export function createSessionAudioBridge(
  tickToUs: (tick: Tick, bpm: number) => Us,
  createClock: SessionClockFactory,
  monitorIntervalMs: number,
  audio = createWebAudio(tickToUs),
): SessionAudioPort & { dispose(): Promise<void> } {
  const history = new Map<Gen, GenerationClock>();
  let active: GenerationClock | null = null;
  let nextMonitorMs = Infinity;

  function context(record: GenerationClock): SessionClockContext {
    return { sessionId: record.anchor.sessionId, clockGeneration: record.anchor.generation, clock: record.clock };
  }

  function stopObserving() {
    active = null;
    nextMonitorMs = Infinity;
  }

  return {
    prepare: audio.renderMusic,
    enable: audio.enable,
    anchorAvailable: () => audio.outputTimestamp() !== undefined,
    start(request) {
      const { token, songTimeUs, offsetUs, atMs, playBgm } = request;
      const stamp = audio.outputTimestamp();
      const currentTime = audio.currentTime();
      if (!stamp || currentTime === undefined) return failure('ERR-005', 'clock.noAnchor');

      const result: Result<PlaybackAnchor> = playBgm
        ? audio.playAt(request.track, songTimeUs, (currentTime + playbackLeadSec) as Sec, token)
        : {
          ok: true, value: Object.freeze({
            playbackId: `silent-${token.generation}`, sessionId: token.sessionId, generation: token.generation,
            startAudioSec: (stamp.contextTime + (atMs - stamp.performanceTime) / 1000) as Sec,
            startSongUs: songTimeUs, anchorAudioSec: stamp.contextTime as Sec, anchorPerformanceMs: stamp.performanceTime as Ms,
          }),
        };
      if (!result.ok) return result;

      const fixed = createClock(result.value, offsetUs);
      if (!fixed.ok) {
        if (playBgm) audio.stop(token);
        return fixed;
      }
      const anchor = result.value;
      const beginsAt = anchor.anchorPerformanceMs + (anchor.startAudioSec - anchor.anchorAudioSec) * 1000;
      const record = { anchor, sinceMs: Math.max(atMs, beginsAt) as Ms, clock: fixed.value };
      history.set(result.value.generation, record);
      active = record;
      nextMonitorMs = atMs + monitorIntervalMs;
      return result;
    },
    stop(token) {
      if (active?.anchor.sessionId === token.sessionId && active.anchor.generation === token.generation) stopObserving();
      return audio.stop(token);
    },
    preview: audio.preview,
    convert(atMs, generation) {
      return history.get(generation)?.clock.convertEventTime(atMs, generation)
        ?? failure('ERR-005', 'clock.noAnchor');
    },
    startPerformanceMs: generation => history.get(generation)?.sinceMs ?? null,
    contextAt(atMs) {
      let candidate: GenerationClock | undefined;
      for (const record of history.values()) {
        if (atMs >= record.sinceMs && (!candidate || record.sinceMs >= candidate.sinceMs)) candidate = record;
      }
      return candidate ? context(candidate) : null;
    },
    monitor(atMs) {
      if (!active || atMs < nextMonitorMs) return ready;
      nextMonitorMs = atMs + monitorIntervalMs;
      const observation = active.clock.observe(audio.outputTimestamp());
      if (!observation.ok) {
        stopObserving();
        return observation;
      }
      return ready;
    },
    applySettings(settings) {
      audio.setVolume('MUSIC', settings.musicVolume);
      audio.setVolume('SFX', settings.sfxVolume);
    },
    subscribeAudioEvents: audio.subscribeAudioEvents,
    forgetGeneration(generation) { history.delete(generation); },
    forgetSession(sessionId) {
      for (const [generation, record] of history) {
        if (record.anchor.sessionId === sessionId) history.delete(generation);
      }
    },
    async dispose() {
      stopObserving();
      history.clear();
      await audio.dispose();
    },
  };
}
