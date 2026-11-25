import type { Instrument, MusicDefinition, MusicEvent, Tick } from '../contracts/interface_contracts';

const beatsPerBar = 4;
const ppq = 480;
const ticksPerBar = beatsPerBar * ppq;

// Offset and duration are local to a bar and expressed in integer ticks.
type Note = readonly [offset: number, pitch: number, duration: number, velocity: number];
type Drum = readonly [offset: number, duration: number, velocity: number];

const instruments: readonly Instrument[] = [
  {
    id: 'lead',
    oscillators: [
      { wave: 'triangle', ratio: 1, gain: 0.82, detuneCents: 0 },
      { wave: 'sine', ratio: 2, gain: 0.14, detuneCents: 0 },
    ],
    noiseGain: 0,
    envelope: { attackMs: 7, decayMs: 76, sustain: 0.63, releaseMs: 100 },
    filter: { type: 'lowpass', frequencyHz: 4100, q: 0.3 },
    distortion: 0,
    pan: 0.18,
    gain: 0.185,
  },
  {
    id: 'keys',
    oscillators: [
      { wave: 'sine', ratio: 1, gain: 0.82, detuneCents: 0 },
      { wave: 'sine', ratio: 2, gain: 0.17, detuneCents: 0 },
    ],
    noiseGain: 0,
    envelope: { attackMs: 15, decayMs: 125, sustain: 0.51, releaseMs: 140 },
    filter: { type: 'lowpass', frequencyHz: 3200, q: 0.3 },
    distortion: 0,
    pan: -0.25,
    gain: 0.084,
  },
  {
    id: 'bass',
    oscillators: [
      { wave: 'sine', ratio: 1, gain: 0.78, detuneCents: 0 },
      { wave: 'triangle', ratio: 2, gain: 0.21, detuneCents: 0 },
    ],
    noiseGain: 0,
    envelope: { attackMs: 5, decayMs: 70, sustain: 0.74, releaseMs: 75 },
    filter: { type: 'lowpass', frequencyHz: 950, q: 0.3 },
    distortion: 0,
    pan: 0,
    gain: 0.2,
  },
  {
    id: 'kick',
    oscillators: [
      { wave: 'sine', ratio: 1, gain: 0.88, detuneCents: 0 },
      { wave: 'triangle', ratio: 2, gain: 0.11, detuneCents: 0 },
    ],
    noiseGain: 0,
    envelope: { attackMs: 3, decayMs: 61, sustain: 0.08, releaseMs: 49 },
    filter: null,
    distortion: 0,
    pan: 0,
    gain: 0.227,
  },
  {
    id: 'snare',
    oscillators: [],
    noiseGain: 0.9,
    envelope: { attackMs: 2, decayMs: 61, sustain: 0.12, releaseMs: 72 },
    filter: { type: 'bandpass', frequencyHz: 1820, q: 0.4 },
    distortion: 0,
    pan: -0.11,
    gain: 0.15,
  },
  {
    id: 'hat',
    oscillators: [],
    noiseGain: 0.71,
    envelope: { attackMs: 2, decayMs: 28, sustain: 0.04, releaseMs: 33 },
    filter: { type: 'highpass', frequencyHz: 5700, q: 0.2 },
    distortion: 0,
    pan: 0.35,
    gain: 0.09,
  },
];

const melody: readonly (readonly Note[])[] = [
  [[0, 64, 300, 0.65], [480, 67, 360, 0.61], [1080, 69, 180, 0.54], [1440, 66, 360, 0.61]],
  [[0, 64, 285, 0.64], [360, 71, 180, 0.54], [720, 69, 260, 0.68], [1320, 73, 370, 0.62]],
  [[0, 71, 720, 0.75], [960, 74, 270, 0.69], [1440, 76, 320, 0.73]],
  [[0, 73, 310, 0.77], [480, 69, 150, 0.6], [720, 71, 200, 0.65], [1320, 66, 350, 0.65]],
  [[0, 67, 400, 0.72], [480, 74, 430, 0.73], [1080, 71, 210, 0.62], [1440, 69, 355, 0.63]],
  [[0, 66, 300, 0.68], [480, 69, 350, 0.7], [1080, 73, 180, 0.61], [1440, 71, 350, 0.7]],
  [[0, 76, 100, 0.78], [240, 76, 100, 0.63], [480, 76, 100, 0.69], [720, 76, 100, 0.77],
    [960, 78, 330, 0.76], [1440, 74, 300, 0.67]],
  [[0, 73, 390, 0.75], [480, 71, 175, 0.65], [840, 69, 360, 0.68], [1440, 78, 300, 0.72]],
  [[0, 79, 690, 0.8], [840, 78, 240, 0.74], [1200, 76, 185, 0.69], [1440, 81, 345, 0.78]],
  [[0, 78, 330, 0.77], [480, 73, 175, 0.69], [840, 76, 285, 0.76], [1440, 74, 295, 0.67]],
  [[0, 73, 360, 0.63], [480, 71, 330, 0.58], [960, 69, 385, 0.53], [1440, 66, 250, 0.48]],
  [[0, 64, 1610, 0.49]],
];

const harmony = [
  { root: 40, chord: [52, 55, 59, 66] },
  { root: 45, chord: [57, 61, 64, 66] },
  { root: 40, chord: [52, 55, 59, 66] },
  { root: 45, chord: [57, 61, 64, 66] },
  { root: 43, chord: [55, 59, 62, 66] },
  { root: 47, chord: [54, 57, 59, 62] },
  { root: 40, chord: [52, 55, 59, 64] },
  { root: 45, chord: [57, 61, 64, 66] },
  { root: 43, chord: [55, 59, 62, 66] },
  { root: 47, chord: [54, 57, 59, 62] },
  { root: 45, chord: [57, 61, 64, 66] },
  { root: 40, chord: [52, 55, 59, 66] },
] as const;

function eventId(bar: number, voice: string, sequence: number) {
  return `a2-${voice}-${String(bar).padStart(2, '0')}-${String(sequence + 1).padStart(2, '0')}`;
}

function notes(bar: number, voice: string, pattern: readonly Note[]): MusicEvent[] {
  return pattern.map(([offset, pitch, duration, velocity], sequence) => ({
    id: eventId(bar, voice, sequence),
    kind: 'NOTE',
    trackId: voice === 'kick' ? 'drums' : voice,
    instrumentId: voice,
    startTick: (bar * ticksPerBar + offset) as Tick,
    durationTicks: duration as Tick,
    midiNote: pitch,
    velocity,
  }));
}

function drums(bar: number, voice: 'snare' | 'hat', pattern: readonly Drum[]): MusicEvent[] {
  return pattern.map(([offset, duration, velocity], sequence) => ({
    id: eventId(bar, voice, sequence),
    kind: 'PERCUSSION',
    trackId: 'drums',
    instrumentId: voice,
    startTick: (bar * ticksPerBar + offset) as Tick,
    durationTicks: duration as Tick,
    velocity,
  }));
}

const events = melody.flatMap((phrase, bar) => {
  const chord = harmony[bar];
  if (!chord) throw new Error(`Trial song missing harmony for bar ${bar}`);

  const ending = bar === melody.length - 1;
  const outro = bar >= 10;
  const strongSection = bar >= 2 && !outro;
  const offbeatHats: readonly Drum[] = strongSection
    ? [[240, 55, 0.45], [720, 54, 0.36], [1200, 55, 0.45], [1680, 50, 0.34]]
    : [[240, 55, 0.35], [1200, 52, 0.3]];

  return [
    ...notes(bar, 'lead', phrase),
    ...notes(bar, 'keys', chord.chord.map((pitch, index) =>
      [0, pitch, ending ? 1570 : 1510, (outro ? 0.45 : 0.54) - index * 0.025])),
    ...notes(bar, 'bass', ending
      ? [[0, chord.root, 1290, 0.57]]
      : [[0, chord.root, 440, 0.74], [720, chord.root + 12, 180, 0.53], [960, chord.root, 390, 0.68],
        [1560, chord.root + 7, 190, 0.53]]),
    ...notes(bar, 'kick', ending
      ? [[0, 33, 135, 0.58]]
      : [[0, 33, 144, 0.85], [960, 33, 132, 0.73]]),
    ...drums(bar, 'snare', ending ? [] : [[480, 100, 0.71], [1440, 103, 0.75]]),
    ...drums(bar, 'hat', ending ? [] : offbeatHats),
  ];
}).sort((left, right) => left.startTick - right.startTick);

export const stageA2TrialMusic: MusicDefinition = {
  master: {
    schemaVersion: 1,
    // Private QA slot for schema compatibility. Never register it in the official music catalog.
    musicId: 'music-01',
    title: '回転灯（Stage A-2 技術実証）',
    genre: 'シンセパルス',
    bpm: 120,
    ppq,
    beatsPerBar,
    totalBars: melody.length,
    key: 'E Dorian',
    factoryId: 'FAC-01',
    sections: [
      { id: 'trial-intro', type: 'INTRO', startBar: 0, barCount: 2 },
      { id: 'trial-main', type: 'MAIN', startBar: 2, barCount: 4 },
      { id: 'trial-development', type: 'DEVELOPMENT', startBar: 6, barCount: 2 },
      { id: 'trial-climax', type: 'CLIMAX', startBar: 8, barCount: 2 },
      { id: 'trial-outro', type: 'OUTRO', startBar: 10, barCount: 2 },
    ],
    previewStartTick: (2 * ticksPerBar) as Tick,
    previewDurationMs: 12000,
    randomSeed: 0xa201_120c,
  },
  instruments,
  events,
  provenanceId: 'stage-a2-rotation-beacon-v1',
};
