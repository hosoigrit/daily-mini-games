import type { ChartData, ChartNote, Lane, Tick } from '../contracts/interface_contracts';
import { stageA2TrialMusic } from './stage-a2-trial';

const { master } = stageA2TrialMusic;
const ticksPerBar = master.beatsPerBar * master.ppq;
const tick = (bar: number, offset: number) => (bar * ticksPerBar + offset) as Tick;
type Voice = 'keys' | 'kick' | 'lead' | 'bass' | 'snare';
type Source = readonly [Voice, number];

function references(bar: number, sources: readonly Source[]) {
  return sources.map(([voice, order]) => `a2-${voice}-${String(bar).padStart(2, '0')}-${String(order).padStart(2, '0')}`);
}

function tap(bar: number, offset: number, lane: Lane, ...sources: Source[]): ChartNote {
  return { id: `trial-tap-${bar}-${offset}-${lane}`, type: 'TAP', lane, tick: tick(bar, offset), sourceMusicEventIds: references(bar, sources) };
}

function chord(bar: number, offset: number, lanes: readonly [Lane, Lane], ...sources: Source[]): ChartNote {
  return { id: `trial-chord-${bar}-${offset}`, type: 'CHORD', lanes, tick: tick(bar, offset), sourceMusicEventIds: references(bar, sources) };
}

function hold(bar: number, endOffset: number, lane: Lane): ChartNote {
  return { id: `trial-hold-${bar}-${lane}`, type: 'HOLD', lane, startTick: tick(bar, 0), endTick: tick(bar, endOffset),
    sourceMusicEventIds: references(bar, [['lead', 1]]) };
}

function rapid(bar: number, lane: Lane): ChartNote {
  return { id: `trial-rapid-${bar}-${lane}`, type: 'RAPID', lane, ticks: [0, 240, 480, 720].map(offset => tick(bar, offset)),
    sourceMusicEventIds: references(bar, [['lead', 1], ['lead', 2], ['lead', 3], ['lead', 4]]) };
}

// Isolated QA fixture for 回転灯. The approved schema's chart slot is not registered as a formal chart.
export const stageA2TrialChart: ChartData = {
  schemaVersion: 1,
  chartId: 'CHART-01-H',
  musicId: master.musicId,
  difficulty: 'HARD',
  level: 5,
  notes: [
    // Introduce both sides on kick and melody, then combine accented notes.
    tap(0, 0, 1, ['kick', 1]), tap(0, 480, 3, ['lead', 2], ['snare', 1]), tap(0, 960, 2, ['bass', 3]),
    tap(0, 1080, 4, ['lead', 3]), chord(0, 1440, [1, 3], ['lead', 4], ['snare', 2]),
    chord(1, 0, [2, 4], ['keys', 1], ['kick', 1]), tap(1, 360, 1, ['lead', 2]), tap(1, 720, 3, ['lead', 3]),
    tap(1, 960, 2, ['kick', 2]), tap(1, 1320, 4, ['lead', 4]), tap(1, 1560, 1, ['bass', 4]),
    // Sustain the first melody note while the other side follows the drum hits.
    hold(2, 720, 1), tap(2, 0, 3, ['kick', 1]), tap(2, 480, 4, ['snare', 1]), tap(2, 960, 2, ['lead', 2]),
    tap(2, 1440, 3, ['lead', 3]), tap(2, 1560, 1, ['bass', 4]),
    chord(3, 0, [2, 4], ['lead', 1], ['keys', 1]), tap(3, 480, 3, ['lead', 2]), tap(3, 720, 1, ['lead', 3]),
    tap(3, 960, 4, ['kick', 2]), tap(3, 1320, 2, ['lead', 4]), tap(3, 1440, 3, ['snare', 2]),
    chord(4, 0, [1, 3], ['lead', 1], ['keys', 1]), tap(4, 480, 4, ['lead', 2]), tap(4, 960, 2, ['kick', 2]),
    tap(4, 1080, 3, ['lead', 3]), tap(4, 1440, 1, ['lead', 4]), tap(4, 1560, 4, ['bass', 4]),
    chord(5, 0, [2, 4], ['lead', 1], ['keys', 1]), tap(5, 480, 1, ['lead', 2]), tap(5, 720, 3, ['bass', 2]),
    tap(5, 960, 2, ['kick', 2]), tap(5, 1080, 4, ['lead', 3]), chord(5, 1440, [1, 3], ['lead', 4], ['snare', 2]),
    // Follow the four half-beat repetitions on one lane with independent presses.
    rapid(6, 3), tap(6, 0, 2, ['kick', 1]), tap(6, 480, 1, ['snare', 1]), tap(6, 960, 2, ['lead', 5]),
    tap(6, 1440, 4, ['lead', 6]), tap(6, 1560, 1, ['bass', 4]),
    chord(7, 0, [2, 4], ['lead', 1], ['keys', 1]), tap(7, 480, 1, ['lead', 2]), tap(7, 840, 3, ['lead', 3]),
    tap(7, 960, 2, ['kick', 2]), chord(7, 1440, [1, 4], ['lead', 4], ['snare', 2]),
    // Switch the long note to the right side and answer with the left hand.
    hold(8, 690, 4), tap(8, 0, 1, ['kick', 1]), tap(8, 480, 2, ['snare', 1]), tap(8, 960, 3, ['kick', 2]),
    tap(8, 1200, 1, ['lead', 3]), chord(8, 1440, [2, 4], ['lead', 4], ['snare', 2]),
    chord(9, 0, [1, 3], ['lead', 1], ['keys', 1]), tap(9, 480, 2, ['lead', 2]), tap(9, 840, 4, ['lead', 3]),
    tap(9, 960, 1, ['kick', 2]), chord(9, 1440, [2, 3], ['lead', 4], ['snare', 2]),
    chord(10, 0, [1, 4], ['lead', 1], ['keys', 1]), tap(10, 480, 2, ['lead', 2]), tap(10, 960, 3, ['lead', 3]),
    chord(10, 1440, [2, 4], ['lead', 4], ['snare', 2]),
    // Release the final sustained tone before the audio tail ends.
    hold(11, 1610, 2), tap(11, 0, 4, ['kick', 1]),
  ],
};
