import type { MusicDefinition, Tick } from '../../src/contracts/interface_contracts';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';

const { master, events } = stageA2TrialMusic;
const ticksPerBar = master.ppq * master.beatsPerBar;
const repeatCount = 3;
const closingBars = [0, 1, 2, 3, 4, 11];
const barCount = repeatCount * master.totalBars + closingBars.length;

const sourceBarByIndex = [
  ...Array.from({ length: repeatCount * master.totalBars }, (_, bar) => bar % master.totalBars),
  ...closingBars,
];
const loadEvents = sourceBarByIndex.flatMap((sourceBar, nextBar) => {
  const barShift = (nextBar - sourceBar) * ticksPerBar;

  return events
    .filter((event) => Math.floor(event.startTick / ticksPerBar) === sourceBar)
    .map((event) => ({
      ...event,
      startTick: (event.startTick + barShift) as Tick,
      id: `a2r2-load-${nextBar}-${event.id}`,
    }));
});

export const a2ar2LoadTrack: MusicDefinition = {
  ...stageA2TrialMusic,
  master: {
    ...master,
    title: 'Stage A-2a-R2 84-second load fixture',
    totalBars: barCount,
    sections: [
      { id: 'load-intro', type: 'INTRO', startBar: 0, barCount: 2 },
      { id: 'load-repeat', type: 'MAIN', startBar: 2, barCount: barCount - 3 },
      { id: 'load-close', type: 'OUTRO', startBar: barCount - 1, barCount: 1 },
    ],
  },
  events: loadEvents,
  provenanceId: 'stage-a2ar2-load-fixture-v1',
};
