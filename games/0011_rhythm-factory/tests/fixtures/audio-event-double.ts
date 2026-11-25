import type { AudioEvent, Token } from '../../src/contracts/interface_contracts';
import type { AudioPort } from '../../src/contracts/ports';
import { createSignal } from '../../src/domain/signal';

export function createAudioEventDouble(current: Token) {
  const events = createSignal<AudioEvent>();
  const api: Pick<AudioPort, 'subscribeAudioEvents'> = { subscribeAudioEvents: events.subscribe };

  return {
    ...api,
    emit(event: AudioEvent) {
      if (event.generation !== current.generation || event.sessionId !== current.sessionId
          || event.requestId !== current.requestId) return;
      events.publish(event);
    },
  };
}
