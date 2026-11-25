import type { GameUiSnapshot } from '../contracts/interface_contracts';
import { createSignal } from './signal';

// The synthetic session owns just the state needed by the foundation probe.
export function createFoundationSession() {
  const updates = createSignal<void>();
  let state: 'READY' | 'INITIALIZING' = 'READY';
  let revision = 0;

  return {
    read: (): GameUiSnapshot => ({
      sessionId: state === 'READY' ? null : 'foundation-probe',
      revision,
      state,
      score: 0,
      combo: 0,
      maxCombo: 0,
      lifeUnits: 200,
      saveStatus: 'IDLE',
      reholdLanes: [],
      error: null,
    }),
    subscribe: updates.subscribe,
    toggleProbeState() {
      state = state === 'READY' ? 'INITIALIZING' : 'READY';
      revision += 1;
      updates.publish();
    },
  };
}
