import type {
  AudioControlPort, AudioEvent, Gen, Ms, PlaybackAnchor, Result, Sec, Tick, Token, Us,
} from '../contracts/interface_contracts';
import type { AudioPort } from '../contracts/ports';
import { createAudioPreparation } from './audio-preparation';
import { audioSampleRate, maxSfxVoices, renderMusicBuffer } from './offline-music';
import { scheduleTick } from './sfx';

type AudioFailure = 'ERR-003' | 'ERR-004' | 'ERR-005' | 'ERR-018';
function failure(code: AudioFailure, messageKey: string): Result<never> {
  return { ok: false, error: { code, severity: 'ERROR', messageKey, recoverable: true } };
}

interface LiveSource {
  readonly token: Token;
  readonly playbackId: string;
  readonly source: AudioBufferSourceNode;
}

function sameOwner(first: Token, second: Token) {
  return first.sessionId === second.sessionId && first.generation === second.generation;
}

export function createWebAudio(
  toUs: (tick: Tick, bpm: number) => Us,
  createContext = () => new AudioContext({ sampleRate: audioSampleRate }),
) {
  const subscriptions = new Set<{ listener: (event: AudioEvent) => void }>();
  const emit = (event: AudioEvent) => {
    for (const subscription of [...subscriptions]) {
      if (subscriptions.has(subscription)) subscription.listener(event);
    }
  };
  const preparation = createAudioPreparation((definition) => renderMusicBuffer(definition, toUs), emit);
  let context: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let live: LiveSource | null = null;
  let anchor: PlaybackAnchor | null = null;
  let musicVolume = 0.7;
  let sfxVolume = 0.5;
  let disposed = false;
  let playback = 0;
  const voices = new Map<OscillatorNode, GainNode>();
  let enabling: Promise<Result<void>> | null = null;

  const stopSource = () => {
    const previous = live;
    live = null;
    anchor = null;
    if (previous) {
      previous.source.onended = null;
      previous.source.stop();
      previous.source.disconnect();
    }
    return previous;
  };

  const onStateChange = () => {
    if (!context || context.state === 'running' || !live) return;
    const previous = stopSource();
    if (previous) emit({
      ...previous.token, kind: 'INTERRUPTED', playbackId: previous.playbackId, at: performance.now() as Ms,
    });
  };

  const enable = (): Promise<Result<void>> => {
    if (disposed) return Promise.resolve(failure('ERR-004', 'audio.disposed'));
    if (enabling) return enabling;
    const job = (async (): Promise<Result<void>> => {
      try {
        if (!context) {
          context = createContext();
          musicGain = context.createGain();
          sfxGain = context.createGain();
          musicGain.gain.value = musicVolume;
          sfxGain.gain.value = sfxVolume;
          musicGain.connect(context.destination);
          sfxGain.connect(context.destination);
          context.addEventListener('statechange', onStateChange);
        }
        await context.resume();
        if (disposed || context.state !== 'running') return failure('ERR-004', 'audio.gestureRequired');
        return { ok: true, value: undefined };
      } catch {
        return failure('ERR-004', 'audio.gestureRequired');
      }
    })();
    enabling = job.finally(() => { enabling = null; });
    return enabling;
  };

  const outputTimestamp = () => {
    if (context?.state !== 'running') return undefined;
    try {
      const stamp = context.getOutputTimestamp();
      const { contextTime, performanceTime } = stamp;
      if (contextTime === undefined || performanceTime === undefined
          || !Number.isFinite(contextTime) || contextTime <= 0
          || !Number.isFinite(performanceTime) || performanceTime <= 0) return undefined;
      return { contextTime, performanceTime };
    } catch {
      return undefined;
    }
  };

  const api: AudioPort & AudioControlPort = {
    renderMusic: preparation.renderMusic,
    subscribeAudioEvents(listener) {
      const subscription = { listener };
      subscriptions.add(subscription);
      return () => { subscriptions.delete(subscription); };
    },
    getPlaybackAnchor() {
      return anchor ? { ok: true, value: anchor } : failure('ERR-005', 'clock.noAnchor');
    },
    playAt(track, positionUs, startAt, token) {
      if (!context || context.state !== 'running' || !musicGain || !token.sessionId) {
        return failure('ERR-004', 'audio.gestureRequired');
      }
      const stamp = outputTimestamp();
      if (!stamp) return failure('ERR-005', 'clock.noAnchor');
      if (!Number.isSafeInteger(positionUs) || positionUs >= track.durationUs
          || !Number.isFinite(startAt) || startAt < context.currentTime
          || !Number.isSafeInteger(token.generation) || token.generation < 0) {
        return failure('ERR-018', 'audio.invalidPlayback');
      }
      const buffer = preparation.bufferFor(track);
      if (!buffer) return failure('ERR-003', 'audio.stalePreparation');
      stopSource();
      const playbackId = `audio-${++playback}`;
      const source = context.createBufferSource();
      const next = { token, playbackId, source };
      source.buffer = buffer;
      source.connect(musicGain);
      source.onended = () => {
        if (live !== next) return;
        live = null;
        source.disconnect();
        emit({ ...token, kind: 'ENDED', playbackId, clockGeneration: token.generation as Gen });
      };
      try {
        source.start(startAt + Math.max(0, -positionUs) / 1_000_000, Math.max(0, positionUs) / 1_000_000);
      } catch {
        source.onended = null;
        source.disconnect();
        return failure('ERR-004', 'audio.playbackFailed');
      }
      live = next;
      anchor = Object.freeze({
        playbackId, sessionId: token.sessionId, generation: token.generation as Gen,
        startAudioSec: startAt, startSongUs: positionUs,
        anchorAudioSec: stamp.contextTime as Sec, anchorPerformanceMs: stamp.performanceTime as Ms,
      });
      return { ok: true, value: anchor };
    },
    stop(token) {
      if ((live && !sameOwner(live.token, token))
          || (!live && anchor && (anchor.sessionId !== token.sessionId || anchor.generation !== token.generation))) {
        return { ok: true, value: undefined };
      }
      const stopped = stopSource();
      if (stopped) emit({ ...stopped.token, kind: 'STOPPED', playbackId: stopped.playbackId });
      return { ok: true, value: undefined };
    },
    preview(track, startUs, durationUs, token) {
      if (!context || context.state !== 'running' || !musicGain) return failure('ERR-004', 'audio.gestureRequired');
      const buffer = preparation.bufferFor(track);
      if (!buffer) return failure('ERR-003', 'audio.stalePreparation');
      if (!Number.isSafeInteger(startUs) || startUs < 0 || !Number.isSafeInteger(durationUs) || durationUs <= 0
          || startUs + durationUs > track.durationUs) {
        return failure('ERR-018', 'audio.invalidPreview');
      }
      stopSource();
      const source = context.createBufferSource();
      const next = { token, playbackId: `preview-${++playback}`, source };
      source.buffer = buffer;
      source.connect(musicGain);
      source.onended = () => {
        if (live !== next) return;
        live = null;
        source.disconnect();
      };
      try {
        source.start(context.currentTime, startUs / 1_000_000, durationUs / 1_000_000);
      } catch {
        source.onended = null;
        source.disconnect();
        return failure('ERR-004', 'audio.playbackFailed');
      }
      live = next;
      return { ok: true, value: undefined };
    },
    setVolume(channel, value) {
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        return failure('ERR-018', 'audio.invalidVolume');
      }
      if (channel === 'MUSIC') {
        musicVolume = value / 100;
        if (musicGain) musicGain.gain.value = musicVolume;
      } else {
        sfxVolume = value / 100;
        if (sfxGain) sfxGain.gain.value = sfxVolume;
      }
      return { ok: true, value: undefined };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      preparation.dispose();
      subscriptions.clear();
      stopSource();
      for (const voice of voices.keys()) releaseVoice(voice);
      context?.removeEventListener('statechange', onStateChange);
      if (context && context.state !== 'closed') await context.close();
    },
  };

  function releaseVoice(voice: OscillatorNode) {
    const gain = voices.get(voice);
    if (!gain) return;
    voices.delete(voice);
    voice.onended = null;
    voice.stop();
    voice.disconnect();
    gain.disconnect();
  }

  function playTick() {
    if (context?.state !== 'running' || !sfxGain || disposed) return false;
    if (voices.size >= maxSfxVoices) {
      const oldest = voices.keys().next().value;
      if (oldest) releaseVoice(oldest);
    }
    const { voice, gain } = scheduleTick(context, sfxGain);
    voices.set(voice, gain);
    voice.onended = () => releaseVoice(voice);
    return true;
  }

  return {
    ...api, enable, outputTimestamp, playTick,
    currentTime: () => context?.currentTime as Sec | undefined,
    diagnostics: () => ({ ...preparation.status(), sources: live ? 1 : 0, voices: voices.size }),
  };
}
