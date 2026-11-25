import { createFoundationSession } from '../domain/foundation-session';
import { createGameStore } from './game-store';
import { createRenderPort } from './render-port';

export function createCompositionRoot() {
  const session = createFoundationSession();
  const store = createGameStore(session);
  const render = createRenderPort(() => null, () => null);

  return {
    store,
    render,
    toggleProbeState: session.toggleProbeState,
    dispose: store.dispose,
  };
}
