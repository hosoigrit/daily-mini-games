import { createFoundationSession } from '../domain/foundation-session';
import { createGameStore } from './game-store';
import { createRenderPort } from './render-port';

export function createCompositionRoot() {
  const session = createFoundationSession();
  const store = createGameStore(session);
  const render = createRenderPort(session.readRenderFrame, () => null);
  let disposed = false;

  return {
    store,
    render,
    toggleProbeState() {
      if (!disposed) session.toggleProbeState();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      store.dispose();
    },
  };
}
