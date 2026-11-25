import type { Gen, RenderNote, RenderSnapshot, Us } from '../../src/contracts/interface_contracts';

export function makeRenderFrame() {
  const note = {
    eventId: 'contract-event',
    noteId: 'contract-note',
    lane: 2,
    targetUs: 400_000 as Us,
    endUs: 900_000 as Us,
    type: 'HOLD',
    state: 'PENDING',
    judgement: null,
  } satisfies RenderNote;

  return {
    sessionId: 'contract-session',
    generation: 8 as Gen,
    songTimeUs: 210_000 as Us,
    judgeTimeUs: 200_000 as Us,
    durationUs: 1_000_000 as Us,
    state: 'PLAYING',
    notes: [note],
    factoryId: 'FAC-01',
    activeHoldLanes: [2],
    pressedLanes: [2, 3],
    progress: 0.21,
    startingSettings: { noteSpeed: 1.2, effectQuality: 'LIGHT' },
  } satisfies Omit<RenderSnapshot, 'noteSpeed' | 'effectQuality'> & {
    startingSettings: Pick<RenderSnapshot, 'noteSpeed' | 'effectQuality'>;
  };
}
