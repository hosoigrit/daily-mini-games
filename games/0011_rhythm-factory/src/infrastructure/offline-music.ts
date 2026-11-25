import type { Instrument, MusicDefinition, MusicEvent, Tick, Us } from '../contracts/interface_contracts';

export const audioSampleRate = 48_000;
export const maxMusicPeak = 10 ** (-3 / 20);
export const maxSfxVoices = 4;
export const maxSfxVoicePeak = 0.0625;
type TickConverter = (tick: Tick, bpm: number) => Us;

export class InvalidMusicDefinition extends Error {}

function checkMusic(
  definition: MusicDefinition,
): ReadonlyMap<string, Instrument> {
  const { master, instruments, events } = definition;
  const maxTick = master.totalBars * master.ppq * master.beatsPerBar;
  if (master.ppq !== 480 || master.beatsPerBar !== 4 || !Number.isSafeInteger(master.bpm) || master.bpm <= 0
      || !Number.isSafeInteger(master.totalBars) || master.totalBars <= 0
      || !Number.isSafeInteger(maxTick)
      || !Number.isSafeInteger(master.randomSeed) || master.randomSeed < 0 || master.randomSeed > 0xffffffff) {
    throw new InvalidMusicDefinition('Invalid music timing or seed');
  }

  const byId = new Map<string, Instrument>();
  for (const instrument of instruments) {
    const { envelope, oscillators, noiseGain, pan, gain, distortion, filter } = instrument;
    if (!instrument.id || byId.has(instrument.id)
        || ![noiseGain, gain, distortion, envelope.sustain].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
        || ![envelope.attackMs, envelope.decayMs, envelope.releaseMs].every((value) => Number.isFinite(value) && value >= 0)
        || !Number.isFinite(pan) || Math.abs(pan) > 1
        || oscillators.some(({ ratio, gain: level, detuneCents }) =>
          !Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(level) || level < 0 || level > 1 || !Number.isFinite(detuneCents))
        || (filter && (!Number.isFinite(filter.frequencyHz) || filter.frequencyHz <= 0 || filter.frequencyHz >= audioSampleRate / 2
                       || !Number.isFinite(filter.q) || filter.q < 0))) {
      throw new InvalidMusicDefinition('Invalid instrument parameters');
    }
    byId.set(instrument.id, instrument);
  }

  const ids = new Set<string>();
  for (const event of events) {
    if (!event.id || ids.has(event.id) || !byId.has(event.instrumentId)
        || !Number.isSafeInteger(event.startTick) || event.startTick < 0 || event.startTick >= maxTick
        || !Number.isSafeInteger(event.durationTicks) || event.durationTicks <= 0
        || event.startTick + event.durationTicks > maxTick
        || !Number.isFinite(event.velocity) || event.velocity <= 0 || event.velocity > 1
        || (event.kind === 'NOTE' && (!Number.isInteger(event.midiNote) || event.midiNote < 0 || event.midiNote > 127))) {
      throw new InvalidMusicDefinition('Invalid music event');
    }
    ids.add(event.id);
  }
  return byId;
}

function seededNoise(buffer: AudioBuffer, seed: number, eventId: string) {
  let state = seed >>> 0;
  for (const char of eventId) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const channel = buffer.getChannelData(0);
  for (let frame = 0; frame < channel.length; frame++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    channel[frame] = state / 2147483648 - 1;
  }
}

function scheduleEvent(
  context: OfflineAudioContext, event: MusicEvent, instrument: Instrument,
  start: number, end: number, durationSec: number, seed: number,
) {
  const envelope = context.createGain();
  const { attackMs, decayMs, sustain, releaseMs } = instrument.envelope;
  const attackEnd = Math.min(end, start + attackMs / 1000);
  const decayEnd = Math.min(end, attackEnd + decayMs / 1000);
  const stop = Math.min(durationSec, end + releaseMs / 1000);
  const level = event.velocity * instrument.gain;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(level, attackEnd);
  envelope.gain.linearRampToValueAtTime(level * sustain, decayEnd);
  envelope.gain.setValueAtTime(level * sustain, end);
  envelope.gain.linearRampToValueAtTime(0, stop);
  const pan = context.createStereoPanner();
  pan.pan.value = instrument.pan;
  envelope.connect(pan).connect(context.destination);

  let node: AudioNode = envelope;
  if (instrument.distortion > 0) {
    const shape = context.createWaveShaper();
    const amount = instrument.distortion * 4 + 1;
    shape.curve = Float32Array.from({ length: 1025 }, (_, index) => Math.tanh((index / 512 - 1) * amount) / Math.tanh(amount));
    shape.connect(node);
    node = shape;
  }
  if (instrument.filter) {
    const filter = context.createBiquadFilter();
    filter.type = instrument.filter.type;
    filter.frequency.value = instrument.filter.frequencyHz;
    filter.Q.value = instrument.filter.q;
    filter.connect(node);
    node = filter;
  }

  if (event.kind === 'NOTE') {
    for (const oscillatorSpec of instrument.oscillators) {
      const oscillator = context.createOscillator();
      oscillator.type = oscillatorSpec.wave;
      oscillator.frequency.value = 440 * 2 ** ((event.midiNote - 69) / 12) * oscillatorSpec.ratio;
      oscillator.detune.value = oscillatorSpec.detuneCents;
      const amplitude = context.createGain();
      amplitude.gain.value = oscillatorSpec.gain;
      oscillator.connect(amplitude).connect(node);
      oscillator.start(start);
      oscillator.stop(stop);
    }
  }
  if (instrument.noiseGain > 0) {
    const noise = context.createBufferSource();
    noise.buffer = context.createBuffer(1, Math.max(1, Math.ceil((stop - start) * audioSampleRate)), audioSampleRate);
    seededNoise(noise.buffer, seed, event.id);
    const amplitude = context.createGain();
    amplitude.gain.value = instrument.noiseGain;
    noise.connect(amplitude).connect(node);
    noise.start(start);
    noise.stop(stop);
  }
}

export async function renderMusicBuffer(
  definition: MusicDefinition,
  tickToUs: TickConverter,
  makeOfflineContext = (length: number) => new OfflineAudioContext(2, length, audioSampleRate),
): Promise<{ buffer: AudioBuffer; durationUs: Us }> {
  const instruments = checkMusic(definition);
  const { master } = definition;
  const durationUs = tickToUs((master.totalBars * 1920) as Tick, master.bpm);
  const durationSec = durationUs / 1_000_000;
  const context = makeOfflineContext(Math.round(durationSec * audioSampleRate));
  for (const event of definition.events) {
    const start = tickToUs(event.startTick, master.bpm) / 1_000_000;
    const end = tickToUs((event.startTick + event.durationTicks) as Tick, master.bpm) / 1_000_000;
    scheduleEvent(context, event, instruments.get(event.instrumentId)!, start, end, durationSec, master.randomSeed);
  }

  const buffer = await context.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let peak = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) throw new RangeError('Nonfinite sample');
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  if (peak > maxMusicPeak) {
    const gain = (maxMusicPeak - 0.000001) / peak;
    for (const channel of channels) {
      for (let frame = 0; frame < channel.length; frame++) channel[frame] = channel[frame]! * gain;
    }
  }

  return { buffer, durationUs };
}
