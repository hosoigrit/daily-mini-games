// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleEvent } from '../../src/contracts/interface_contracts';
import { attachSessionLifecycle } from '../../src/infrastructure/session-lifecycle';

const disposers: Array<() => void> = [];

function attach(onEvent: (event: LifecycleEvent) => void, now: () => number = () => 500) {
  const dispose = attachSessionLifecycle({ window, document, onEvent, now });
  disposers.push(dispose);
  return dispose;
}

function send(target: EventTarget, event: Event, timeStamp: number) {
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
});

describe('A-2c native lifecycle boundary', () => {
  it('forwards app-wide visibility, focus-loss, resize, pagehide and BFCache pageshow with per-event times', () => {
    const events: LifecycleEvent[] = [];
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    attach(event => events.push(event));
    expect(events).toEqual([]);

    send(document, new Event('visibilitychange'), 101.25);
    visibility.mockReturnValue('visible');
    send(document, new Event('visibilitychange'), 200);
    send(window, new Event('blur'), 260.5);
    send(window, new Event('resize'), 299);
    send(window, new PageTransitionEvent('pagehide', { persisted: true }), 350);
    send(window, new PageTransitionEvent('pageshow', { persisted: true }), 480);

    expect(events.map(({ kind, atPerformanceMs }) => [kind, atPerformanceMs])).toEqual([
      ['HIDDEN', 101.25], ['VISIBLE', 200], ['BLUR', 260.5], ['RESIZE', 299], ['PAGEHIDE', 350], ['PAGESHOW', 480],
    ]);
    expect(events.every(event => event.sessionId === null && event.generation === null && Object.isFrozen(event))).toBe(true);
  });

  it('normalizes epoch timestamps and preserves safety notifications with invalid native times', () => {
    const callback = vi.fn<(event: LifecycleEvent) => void>();
    let receipt = 400;
    attach(callback, () => receipt);

    send(window, new Event('blur'), window.performance.timeOrigin + 299);
    receipt = 425;
    send(window, new Event('pagehide'), Number.NaN);
    receipt = 450;
    send(window, new Event('pageshow'), Number.MAX_VALUE);

    expect(callback.mock.calls.map(([event]) => event.atPerformanceMs)).toEqual([299, 425, 450]);
  });

  it('deduplicates mounts and leaves a replacement intact when an old disposer runs', () => {
    const first = vi.fn<(event: LifecycleEvent) => void>();
    const last = vi.fn<(event: LifecycleEvent) => void>();
    const previous = attach(first);
    const dispose = attach(last);
    previous();
    send(window, new Event('pagehide'), 10);

    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
    dispose();
    dispose();
    send(window, new Event('pageshow'), 11);
    expect(last).toHaveBeenCalledTimes(1);

    attach(last);
    send(window, new Event('pageshow'), 12);
    expect(last).toHaveBeenCalledTimes(2);
  });
});
