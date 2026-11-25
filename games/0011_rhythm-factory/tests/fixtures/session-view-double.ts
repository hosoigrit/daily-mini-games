import type { GameUiSnapshot } from '../../src/contracts/interface_contracts';
import { createSignal } from '../../src/domain/signal';

export function makeUiSnapshot(): GameUiSnapshot {
  return {
    sessionId: null, revision: 0, state: 'READY', score: 0, combo: 0, maxCombo: 0,
    lifeUnits: 200, saveStatus: 'IDLE', reholdLanes: [], error: null,
  };
}

export function createSessionViewDouble(initial = makeUiSnapshot()) {
  const updates = createSignal<void>();
  let current = initial;

  return {
    read: () => current,
    subscribe: updates.subscribe,
    replace(snapshot: GameUiSnapshot) {
      current = snapshot;
      updates.publish();
    },
  };
}
