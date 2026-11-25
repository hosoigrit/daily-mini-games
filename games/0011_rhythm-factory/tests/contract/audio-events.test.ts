import { expect, it, vi } from 'vitest';
import type { AudioEvent, Gen, Token } from '../../src/contracts/interface_contracts';
import { createAudioEventDouble } from '../fixtures/audio-event-double';

it('IF-20 / TC-D4-020 / A1a-R02 isolates unsubscribe and rejects stale audio events', () => {
  const current: Token = { requestId: 'request', sessionId: 'session', generation: 8 };
  const event: AudioEvent = { ...current, kind: 'ENDED', playbackId: 'playback', clockGeneration: 8 as Gen };
  const audio = createAudioEventDouble(current);
  const listenerA = vi.fn();
  const listenerB = vi.fn();
  const unsubscribeA = audio.subscribeAudioEvents(listenerA);
  const unsubscribeB = audio.subscribeAudioEvents(listenerB);

  unsubscribeA();
  expect(unsubscribeA).not.toThrow();
  audio.emit(event);
  expect(listenerA).not.toHaveBeenCalled();
  expect(listenerB).toHaveBeenCalledExactlyOnceWith(event);

  audio.emit({ ...event, generation: 7, clockGeneration: 7 as Gen });
  expect(listenerB).toHaveBeenCalledTimes(1);

  unsubscribeB();
  audio.emit(event);
  expect(listenerA).not.toHaveBeenCalled();
  expect(listenerB).toHaveBeenCalledTimes(1);
});
