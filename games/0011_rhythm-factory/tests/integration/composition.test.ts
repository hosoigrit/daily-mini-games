import { expect, it, vi } from 'vitest';
import { createCompositionRoot } from '../../src/app/composition-root';

it('connects one synthetic state owner to the UI and renderer and tears down the connection', () => {
  const services = createCompositionRoot();
  const listener = vi.fn(() => services.store.getSnapshot().state);
  const unsubscribe = services.store.subscribe(listener);

  expect(services.store.getSnapshot()).toMatchObject({ state: 'READY', sessionId: null });
  expect(services.render.getRenderSnapshot()).toMatchObject({ state: 'READY', sessionId: null });

  services.toggleProbeState();
  const activeUi = services.store.getSnapshot();
  expect(activeUi.state).toBe('INITIALIZING');
  expect(activeUi.sessionId).not.toBeNull();
  expect(services.render.getRenderSnapshot()).toMatchObject({
    state: activeUi.state, sessionId: activeUi.sessionId, generation: 1,
  });

  services.toggleProbeState();
  expect(listener.mock.results.map(({ value }) => value)).toEqual(['INITIALIZING', 'READY']);
  expect(services.store.getSnapshot()).toMatchObject({ revision: 2, state: 'READY', sessionId: null });
  expect(services.render.getRenderSnapshot()).toMatchObject({
    state: 'READY', sessionId: null, generation: null, notes: [], activeHoldLanes: [], pressedLanes: [],
  });

  services.dispose();
  services.toggleProbeState();
  expect(services.store.getSnapshot().revision).toBe(2);
  expect(services.render.getRenderSnapshot().sessionId).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});
