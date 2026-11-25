import type { GameSettings, Gen, RenderSnapshot, Us } from '../contracts/interface_contracts';
import type { RenderPort } from '../contracts/ports';

type RenderSettings = Pick<GameSettings, 'noteSpeed' | 'effectQuality'>;
type SessionFrame = Omit<RenderSnapshot, keyof RenderSettings | 'sessionId' | 'generation'> & {
  readonly sessionId: string;
  readonly generation: Gen;
  readonly startingSettings: RenderSettings;
};

const zeroUs = 0 as Us;
const noItems = Object.freeze([]);
const defaultRenderSettings: RenderSettings = Object.freeze({ noteSpeed: 1, effectQuality: 'NORMAL' });

function validRenderSettings(settings: RenderSettings | null): settings is RenderSettings {
  if (!settings) return false;
  const tenths = settings.noteSpeed * 10;
  return Number.isInteger(tenths) && tenths >= 5 && tenths <= 20
    && (settings.effectQuality === 'NORMAL' || settings.effectQuality === 'LIGHT');
}

export function createRenderPort(
  readSession: () => SessionFrame | null,
  readCurrentSettings: () => RenderSettings | null,
): RenderPort {
  return {
    getRenderSnapshot() {
      const session = readSession();
      if (session) {
        const { startingSettings, ...frame } = session;
        return Object.freeze({
          ...frame,
          noteSpeed: startingSettings.noteSpeed,
          effectQuality: startingSettings.effectQuality,
          notes: Object.freeze(frame.notes.map((note) => Object.freeze({ ...note }))),
          activeHoldLanes: Object.freeze([...frame.activeHoldLanes]),
          pressedLanes: Object.freeze([...frame.pressedLanes]),
        });
      }

      const current = readCurrentSettings();
      const settings = validRenderSettings(current) ? current : defaultRenderSettings;
      return Object.freeze({
        sessionId: null,
        generation: null,
        songTimeUs: zeroUs,
        judgeTimeUs: zeroUs,
        durationUs: zeroUs,
        state: 'READY',
        notes: noItems,
        factoryId: null,
        activeHoldLanes: noItems,
        pressedLanes: noItems,
        noteSpeed: settings.noteSpeed,
        effectQuality: settings.effectQuality,
        progress: 0,
      });
    },
  };
}
