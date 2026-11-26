import type { LifecycleEvent, Ms } from '../contracts/interface_contracts';

interface SessionLifecycleOptions {
  readonly window: Window;
  readonly document: Document;
  readonly onEvent: (event: LifecycleEvent) => void;
  readonly now?: () => number;
}

const activeBindings = new WeakMap<Window, () => void>();
const isPerformanceTime = (time: number) => Number.isFinite(time) && time >= 0;

function normalizeTime(stamp: number, receipt: number, timeOrigin: number): Ms {
  if (isPerformanceTime(stamp)) {
    if (stamp <= receipt) return stamp as Ms;
    const relative = stamp - timeOrigin;
    if (isPerformanceTime(relative) && relative <= receipt) return relative as Ms;
  }
  // Interruption events must still reach the controller when their DOM timestamp is unusable.
  return receipt as Ms;
}

/** One forwarder owns a page's native lifecycle subscription. Mounting a new owner replaces it. */
export function attachSessionLifecycle(options: SessionLifecycleOptions): () => void {
  const { window, document, onEvent } = options;
  const now = options.now ?? (() => window.performance.now());
  activeBindings.get(window)?.();

  function forward(kind: LifecycleEvent['kind'], event: Event): void {
    const read = now();
    const receipt = isPerformanceTime(read) ? read : window.performance.now();
    if (!isPerformanceTime(receipt)) return;
    onEvent(Object.freeze({
      kind,
      atPerformanceMs: normalizeTime(event.timeStamp, receipt, window.performance.timeOrigin),
      sessionId: null,
      generation: null,
    }));
  }

  const handlers: ReadonlyArray<readonly [EventTarget, string, EventListener]> = [
    [document, 'visibilitychange', event => forward(document.visibilityState === 'hidden' ? 'HIDDEN' : 'VISIBLE', event)],
    [window, 'blur', event => forward('BLUR', event)],
    [window, 'resize', event => forward('RESIZE', event)],
    [window, 'pagehide', event => forward('PAGEHIDE', event)],
    [window, 'pageshow', event => forward('PAGESHOW', event)],
  ];

  for (const [target, name, listener] of handlers) target.addEventListener(name, listener);
  const dispose = () => {
    if (activeBindings.get(window) !== dispose) return;
    activeBindings.delete(window);
    for (const [target, name, listener] of handlers) target.removeEventListener(name, listener);
  };
  activeBindings.set(window, dispose);
  return dispose;
}
