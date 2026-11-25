import type { AudioEvent, MusicDefinition, PreparedTrack, Result, Token, Us } from '../contracts/interface_contracts';
import type { AudioPort } from '../contracts/ports';
import { InvalidMusicDefinition } from './offline-music';

type Render = (definition: MusicDefinition) => Promise<{ buffer: AudioBuffer; durationUs: Us }>;
interface Preparation {
  readonly definition: MusicDefinition;
  readonly track: PreparedTrack;
  readonly buffer: AudioBuffer;
}
interface Request {
  readonly definition: MusicDefinition;
  readonly token: Token;
  readonly resolve: (result: Result<PreparedTrack>) => void;
}

function error(token: Token, code: 'ERR-001' | 'ERR-003', messageKey: string): Result<never> {
  return { ok: false, error: { code, severity: 'ERROR', messageKey, recoverable: true,
    ...(token.sessionId === null ? {} : { sessionId: token.sessionId }) } };
}

export function createAudioPreparation(render: Render, emit: (event: AudioEvent) => void) {
  let stored: Preparation | null = null;
  let active: Request | null = null;
  let waiting: Request | null = null;
  let latest: Request | null = null;
  let disposed = false;
  let number = 0;

  function complete(request: Request, result: Result<PreparedTrack>) {
    request.resolve(result);
    if (request !== latest) return;
    emit(result.ok
      ? { ...request.token, kind: 'PREPARED', track: result.value }
      : { ...request.token, kind: 'FAILED', error: result.error });
  }

  async function run(request: Request) {
    active = request;
    try {
      const { buffer, durationUs } = await render(request.definition);
      if (latest !== request) {
        complete(request, error(request.token, 'ERR-003', 'audio.superseded'));
        return;
      }
      const track: PreparedTrack = Object.freeze({
        musicId: request.definition.master.musicId, durationUs, sampleRate: 48000, channels: 2,
        preparationId: `prepared-${++number}`,
      });
      stored = { definition: request.definition, track, buffer };
      complete(request, { ok: true, value: track });
    } catch (cause) {
      complete(request, error(request.token,
        cause instanceof InvalidMusicDefinition ? 'ERR-001' : 'ERR-003', 'audio.preparationFailed'));
    } finally {
      active = null;
      const next = waiting;
      waiting = null;
      if (next) void run(next);
    }
  }

  const renderMusic: AudioPort['renderMusic'] = (definition, token) => new Promise((resolve) => {
    if (disposed) { resolve(error(token, 'ERR-003', 'audio.disposed')); return; }
    const request: Request = { definition, token, resolve };
    const previous = waiting;
    waiting = null;
    latest = request;
    if (previous) complete(previous, error(previous.token, 'ERR-003', 'audio.superseded'));
    if (stored?.definition === definition) {
      complete(request, { ok: true, value: stored.track });
      return;
    }
    stored = null;
    if (active) waiting = request;
    else void run(request);
  });

  return {
    renderMusic,
    bufferFor(track: PreparedTrack) { return stored?.track === track ? stored.buffer : null; },
    status() { return { rendering: active ? 1 : 0, cached: stored ? 1 : 0 }; },
    dispose() {
      disposed = true;
      stored = null;
      latest = null;
      if (waiting) complete(waiting, error(waiting.token, 'ERR-003', 'audio.disposed'));
      waiting = null;
    },
  };
}
