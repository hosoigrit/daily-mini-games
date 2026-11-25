import type { GameError, GameUiSnapshot, Lane } from '../contracts/interface_contracts';
import type { GameStorePort } from '../contracts/ports';
import { createSignal } from '../domain/signal';

interface SessionViewSource {
  read(): GameUiSnapshot;
  subscribe(listener: () => void): () => void;
}

function equalErrors(previous: GameError | null, next: GameError | null) {
  if (previous === next) return true;
  return previous !== null && next !== null
    && previous.code === next.code && previous.severity === next.severity
    && previous.messageKey === next.messageKey && previous.recoverable === next.recoverable
    && previous.sessionId === next.sessionId;
}

function equalLanes(previous: readonly Lane[], next: readonly Lane[]) {
  return previous.length === next.length && previous.every((lane, index) => lane === next[index]);
}

function equalSnapshots(previous: GameUiSnapshot, next: GameUiSnapshot) {
  return previous.sessionId === next.sessionId && previous.revision === next.revision
    && previous.state === next.state && previous.score === next.score && previous.combo === next.combo
    && previous.maxCombo === next.maxCombo && previous.lifeUnits === next.lifeUnits
    && previous.saveStatus === next.saveStatus && equalLanes(previous.reholdLanes, next.reholdLanes)
    && equalErrors(previous.error, next.error);
}

function immutableSnapshot(value: GameUiSnapshot): GameUiSnapshot {
  return Object.freeze({
    ...value,
    reholdLanes: Object.freeze([...value.reholdLanes]),
    error: value.error ? Object.freeze({ ...value.error }) : null,
  });
}

export function createGameStore(session: SessionViewSource): GameStorePort & { dispose(): void } {
  const notifications = createSignal<void>();
  let snapshot = immutableSnapshot(session.read());
  const disconnect = session.subscribe(() => {
    const next = session.read();

    if (equalSnapshots(snapshot, next)) return;
    snapshot = immutableSnapshot(next);
    notifications.publish();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: notifications.subscribe,
    dispose: disconnect,
  };
}
