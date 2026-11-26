// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { expect, it } from 'vitest';
import { rig } from '../fixtures/a2c-controller-probe';

it('Strict Mode can unsubscribe and reattach without duplicate session start or initial storage writes', async () => {
  const testRig = rig();
  await testRig.select();
  const controller = testRig.controller;
  const initial = controller.store.getSnapshot();
  const command = { kind: 'START_GAME', sessionId: null, requestId: 'stable-effect-request' } as const;
  function Probe() {
    const view = useSyncExternalStore(controller.store.subscribe, controller.store.getSnapshot);
    useEffect(() => { void controller.dispatch(command); }, []);
    return <output>{view.state}</output>;
  }

  const view = render(<StrictMode><Probe /></StrictMode>);
  await act(async () => {
    await Promise.resolve();
    testRig.step(1000);
  });
  expect(screen.getByText('COUNTDOWN')).toBeDefined();
  expect(testRig.audio.enable).toHaveBeenCalledTimes(1);
  expect(testRig.writes()).toBe(1);
  expect(Object.isFrozen(controller.store.getSnapshot())).toBe(true);
  act(() => { testRig.step(1100); });
  const unchanged = controller.store.getSnapshot();
  act(() => { testRig.step(1200); });
  expect(controller.store.getSnapshot()).toBe(unchanged);
  expect(initial.state).toBe('READY');
  view.unmount();
  controller.dispose();
});
