import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../../src/app/game-store';
import { createSessionViewDouble, makeUiSnapshot } from '../fixtures/session-view-double';

describe('IF-16 / AT-104 / TC-D3-006/007 / TC-D4-016', () => {
  it('keeps the same reference and emits no notification for an equal projection', () => {
    const session = createSessionViewDouble();
    const store = createGameStore(session);
    const original = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getSnapshot()).toBe(original);
    expect(store.getSnapshot()).toBe(original);
    session.replace(makeUiSnapshot());
    expect(store.getSnapshot()).toBe(original);
    expect(listener).not.toHaveBeenCalled();
    store.dispose();
  });

  it('updates the public reference and emits a single notification for one state change', () => {
    const session = createSessionViewDouble();
    const store = createGameStore(session);
    const original = store.getSnapshot();
    const listener = vi.fn(() => store.getSnapshot());
    store.subscribe(listener);

    session.replace({ ...makeUiSnapshot(), score: 5, revision: 1 });
    expect(store.getSnapshot()).not.toBe(original);
    expect(store.getSnapshot()).toMatchObject({ score: 5, revision: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0]?.value).toBe(store.getSnapshot());
    store.dispose();
  });

  it('protects nested arrays and error values and keeps a defensive copy of the source', () => {
    const snapshot = {
      ...makeUiSnapshot(),
      reholdLanes: [2] as const,
      error: { code: 'ERR-012', severity: 'ERROR', messageKey: 'save', recoverable: true } as const,
    };
    const session = createSessionViewDouble(snapshot);
    const store = createGameStore(session);
    const view = store.getSnapshot();

    expect(Reflect.set(view, 'score', 500)).toBe(false);
    expect(Reflect.set(view.reholdLanes, '0', 1)).toBe(false);
    expect(Reflect.set(view.error!, 'messageKey', 'changed')).toBe(false);
    expect(session.read()).toEqual(snapshot);
    expect(view.reholdLanes).not.toBe(snapshot.reholdLanes);
    expect(view.error).not.toBe(snapshot.error);
    store.dispose();
  });

  it('unsubscribes idempotently and removes only the matching registration', () => {
    const session = createSessionViewDouble();
    const store = createGameStore(session);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const unsubscribeSecond = store.subscribe(listener);

    unsubscribe();
    unsubscribe();
    session.replace({ ...makeUiSnapshot(), lifeUnits: 170 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeSecond();
    session.replace({ ...makeUiSnapshot(), lifeUnits: 180 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.dispose();
  });
});
