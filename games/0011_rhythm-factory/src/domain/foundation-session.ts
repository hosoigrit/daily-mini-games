import type { GameUiSnapshot, Gen, Us } from '../contracts/interface_contracts';
import { createSignal } from './signal';

const startSettings = { noteSpeed: 1, effectQuality: 'NORMAL' } as const;
const zeroUs = 0 as Us;

// The synthetic session owns just the state needed by the foundation probe.
export function createFoundationSession() {
  const updates = createSignal<void>();
  let state: 'READY' | 'INITIALIZING' = 'READY';
  let revision = 0;
  const getSessionId = () => state === 'READY' ? null : `foundation-probe-${revision}`;

  return {
    read: (): GameUiSnapshot => ({
      sessionId: getSessionId(),
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
    readRenderFrame() {
      const sessionId = getSessionId();
      if (sessionId === null) return null;

      return {
        sessionId,
        generation: revision as Gen,
        songTimeUs: zeroUs,
        judgeTimeUs: zeroUs,
        durationUs: zeroUs,
        state,
        notes: [],
        factoryId: null,
        activeHoldLanes: [],
        pressedLanes: [],
        progress: 0,
        startingSettings: startSettings,
      };
    },
    subscribe: updates.subscribe,
    toggleProbeState() {
      state = state === 'READY' ? 'INITIALIZING' : 'READY';
      revision += 1;
      updates.publish();
    },
  };
}
