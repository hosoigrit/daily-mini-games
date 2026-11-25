// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompositionRoot } from '../../src/app/composition-root';
import type { GameStorePort } from '../../src/contracts/ports';
import { mountCanvasRenderer } from '../../src/infrastructure/canvas-renderer';
import { FoundationScreen } from '../../src/presentation/FoundationScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('POC-13: React displays the store projection without writing state during render', () => {
  const services = createCompositionRoot();
  const mountCanvas = vi.fn(() => () => {});
  const toggle = vi.fn(services.toggleProbeState);
  const props = { store: services.store, toggleProbeState: toggle, mountCanvas };
  const { rerender, unmount } = render(<FoundationScreen {...props} />);

  expect(screen.getByRole('status').textContent).toBe('テスト状態 READY');
  const before = services.store.getSnapshot();
  rerender(<FoundationScreen {...props} />);
  expect(services.store.getSnapshot()).toBe(before);
  expect(toggle).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'テスト状態を切り替える' }));
  expect(screen.getByRole('status').textContent).toBe('テスト状態 INITIALIZING');
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(services.store.getSnapshot().revision).toBe(1);
  unmount();
  services.dispose();
});

it('POC-14: Strict Mode remount keeps exactly one subscription, listener, frame and test resource', () => {
  const services = createCompositionRoot();
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { callbacks.delete(id); });
  const addListener = vi.spyOn(window, 'addEventListener');
  const removeListener = vi.spyOn(window, 'removeEventListener');
  const fillRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ fillStyle: '', fillRect }) as unknown as CanvasRenderingContext2D,
  );

  let subscriptionCount = 0;
  let maxSubscriptions = 0;
  let resourceCount = 0;
  let maxResources = 0;
  const releases = vi.fn();
  const draws = { getRenderSnapshot: vi.fn(services.render.getRenderSnapshot) };
  const store: GameStorePort = {
    getSnapshot: services.store.getSnapshot,
    subscribe(listener) {
      const unsubscribe = services.store.subscribe(listener);
      subscriptionCount += 1;
      maxSubscriptions = Math.max(maxSubscriptions, subscriptionCount);
      return () => { subscriptionCount -= 1; unsubscribe(); };
    },
  };
  const mountCanvas = vi.fn((canvas: HTMLCanvasElement) => {
    const stop = mountCanvasRenderer(canvas, draws);
    resourceCount += 1;
    maxResources = Math.max(maxResources, resourceCount);
    return () => { stop(); resourceCount -= 1; releases(); };
  });

  function resizeCount(spy: typeof addListener) {
    return spy.mock.calls.filter(([name]) => name === 'resize').length;
  }

  const view = render(
    <StrictMode>
      <FoundationScreen store={store} mountCanvas={mountCanvas} toggleProbeState={services.toggleProbeState} />
    </StrictMode>,
  );

  expect(mountCanvas).toHaveBeenCalledTimes(2);
  expect(releases).toHaveBeenCalledTimes(1);
  expect(maxSubscriptions).toBe(1);
  expect(maxResources).toBe(1);
  expect(subscriptionCount).toBe(1);
  expect(resourceCount).toBe(1);
  expect(resizeCount(addListener) - resizeCount(removeListener)).toBe(1);
  expect(callbacks.size).toBe(1);

  const staleFrame = request.mock.calls[0]![0];
  staleFrame(0);
  expect(draws.getRenderSnapshot).not.toHaveBeenCalled();
  expect(callbacks.size).toBe(1);

  const [currentId, currentFrame] = callbacks.entries().next().value!;
  callbacks.delete(currentId);
  currentFrame(16);
  expect(draws.getRenderSnapshot).toHaveBeenCalledTimes(1);
  expect(fillRect).toHaveBeenCalledTimes(2);
  expect(callbacks.size).toBe(1);
  expect(services.store.getSnapshot().revision).toBe(0);

  view.unmount();
  expect(subscriptionCount).toBe(0);
  expect(resourceCount).toBe(0);
  expect(resizeCount(addListener) - resizeCount(removeListener)).toBe(0);
  expect(callbacks.size).toBe(0);
  expect(releases).toHaveBeenCalledTimes(2);
  services.dispose();
});
