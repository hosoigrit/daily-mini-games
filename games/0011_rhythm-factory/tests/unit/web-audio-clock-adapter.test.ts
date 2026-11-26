import { describe, expect, it, vi } from 'vitest';
import type { AudioEvent, PreparedTrack, Result, Sec, Token, Us } from '../../src/contracts/interface_contracts';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import { tickToUs } from '../../src/domain/audio-clock';
import { createWebAudio } from '../../src/infrastructure/web-audio';

vi.mock(import('../../src/infrastructure/offline-music'), async (original) => ({
  ...(await original()),
  renderMusicBuffer: vi.fn(async () => ({ buffer: {} as AudioBuffer, durationUs: 24_000_000 as Us })),
}));

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function adapterFixture() {
  const target = new EventTarget();
  const mock = {
    state: 'suspended' as AudioContextState,
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => { mock.state = 'running'; }),
    close: vi.fn(async () => { mock.state = 'closed'; }),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    getOutputTimestamp: vi.fn(() => ({ contextTime: 0.95, performanceTime: 1200 })),
    createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null, onended: null as (() => void) | null,
      start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
    })),
  };
  return {
    mock, target,
    audio: createWebAudio(tickToUs, () => mock as unknown as AudioContext),
  };
}

const first = { requestId: 'first', sessionId: 'a2ar-qa', generation: 1 } satisfies Token;
const second = { ...first, requestId: 'second', generation: 2 } satisfies Token;

describe('A-2a-R approved audio/clock safety boundaries', () => {
  it('reports rejected resume and leaves retry available for the next gesture', async () => {
    const { audio, mock } = adapterFixture();
    mock.resume.mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    expect(await audio.enable()).toMatchObject({ ok: false, error: { code: 'ERR-004' } });
    expect(mock.state).toBe('suspended');
    expect((await audio.enable()).ok).toBe(true);
    expect(mock.resume).toHaveBeenCalledTimes(2);
    await audio.dispose();
  });

  it('does not adopt uninitialized or nonfinite timestamps even when context state says running', async () => {
    const { audio, mock } = adapterFixture();
    unwrap(await audio.enable());
    const track = unwrap(await audio.renderMusic(stageA2TrialMusic, first)) satisfies PreparedTrack;
    for (const invalid of [
      { contextTime: 0, performanceTime: 1200 },
      { contextTime: 0.95, performanceTime: 0 },
      { contextTime: -0.1, performanceTime: 1200 },
      { contextTime: Infinity, performanceTime: 1200 },
      { contextTime: 0.95, performanceTime: NaN },
    ]) {
      mock.getOutputTimestamp.mockReturnValueOnce(invalid);
      expect(audio.playAt(track, 0 as Us, 1.05 as Sec, first)).toMatchObject({
        ok: false, error: { code: 'ERR-005' },
      });
      expect(mock.createBufferSource).not.toHaveBeenCalled();
    }
    expect(unwrap(audio.playAt(track, 0 as Us, 1.05 as Sec, first)).generation).toBe(1);
    await audio.dispose();
  });

  it('rejects an old ended callback and releases the active source on interruption', async () => {
    const { audio, mock, target } = adapterFixture();
    unwrap(await audio.enable());
    const track = unwrap(await audio.renderMusic(stageA2TrialMusic, first));
    const events: AudioEvent[] = [];
    const unsubscribe = audio.subscribeAudioEvents((event) => events.push(event));
    const previous = unwrap(audio.playAt(track, 0 as Us, 1.05 as Sec, first));
    const old = mock.createBufferSource.mock.results[0]?.value;
    const staleEnded = old?.onended;
    const active = unwrap(audio.playAt(track, 10_000 as Us, 1.05 as Sec, second));
    expect(previous.playbackId).not.toBe(active.playbackId);
    expect(old?.stop).toHaveBeenCalledTimes(1);
    expect(staleEnded).toBeTypeOf('function');
    staleEnded?.();
    expect(events).toEqual([]);
    expect(audio.diagnostics().sources).toBe(1);
    expect(unwrap(audio.getPlaybackAnchor())).toEqual(active);

    mock.state = 'suspended';
    target.dispatchEvent(new Event('statechange'));
    expect(audio.diagnostics().sources).toBe(0);
    expect(audio.getPlaybackAnchor()).toMatchObject({ ok: false, error: { code: 'ERR-005' } });
    expect(events).toMatchObject([{ kind: 'INTERRUPTED', playbackId: active.playbackId, generation: 2 }]);
    const newest = mock.createBufferSource.mock.results[1]?.value;
    expect(newest?.stop).toHaveBeenCalledTimes(1);
    expect(newest?.disconnect).toHaveBeenCalledTimes(1);
    unsubscribe();
    await audio.dispose();
  });
});
