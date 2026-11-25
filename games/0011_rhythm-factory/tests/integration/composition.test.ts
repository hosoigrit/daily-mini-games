import { expect, it, vi } from 'vitest';
import { createCompositionRoot } from '../../src/app/composition-root';

it('connects one synthetic state owner to the UI projection and tears down the connection', () => {
  const services = createCompositionRoot();
  const listener = vi.fn(() => services.store.getSnapshot().state);
  const unsubscribe = services.store.subscribe(listener);

  expect(services.store.getSnapshot().state).toBe('READY');
  services.toggleProbeState();
  services.toggleProbeState();
  expect(listener.mock.results.map(({ value }) => value)).toEqual(['INITIALIZING', 'READY']);
  expect(services.store.getSnapshot().revision).toBe(2);
  expect(services.render.getRenderSnapshot().sessionId).toBeNull();

  services.dispose();
  services.toggleProbeState();
  expect(services.store.getSnapshot().revision).toBe(2);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});
