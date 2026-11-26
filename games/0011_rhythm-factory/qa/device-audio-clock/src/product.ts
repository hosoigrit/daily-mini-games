import { stageA2TrialMusic } from '../../../src/content/stage-a2-trial';
import type { Token } from '../../../src/contracts/interface_contracts';
import { tickToUs } from '../../../src/domain/audio-clock';
import { createWebAudio } from '../../../src/infrastructure/web-audio';
import { a2ar2LoadTrack } from '../../../tests/fixtures/a2ar2-load-track';
import type { FixtureId, Preparation } from './model';

export const fixtures = {
  'rotation-24': { definition: stageA2TrialMusic, durationSec: 24 },
  'load-84': { definition: a2ar2LoadTrack, durationSec: 84 },
} as const;

export function finite(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

export interface NativeReading {
  performanceNow: number;
  currentTime: number | null;
  contextTime: number | null;
  performanceTime: number | null;
  audioContextState: string | null;
}

export function createMeasuredProduct() {
  let context: AudioContext | undefined;
  let lastRead: NativeReading | null = null;
  const state = () => context?.state ?? null;
  const nativeReading = (stamp?: AudioTimestamp): NativeReading => ({
    performanceNow: performance.now(),
    currentTime: finite(context?.currentTime),
    contextTime: finite(stamp?.contextTime),
    performanceTime: finite(stamp?.performanceTime),
    audioContextState: state(),
  });
  const audio = createWebAudio(tickToUs, () => {
    const native = new AudioContext({ sampleRate: 48_000 });
    context = native;
    if (typeof native.getOutputTimestamp === 'function') {
      const read = native.getOutputTimestamp.bind(native);
      native.getOutputTimestamp = () => {
        let stamp: AudioTimestamp | undefined;
        try {
          stamp = read();
          return stamp;
        } finally {
          lastRead = nativeReading(stamp);
        }
      };
    }
    return native;
  });
  return {
    audio,
    state,
    beginRead: () => { lastRead = null; },
    read: () => lastRead ?? nativeReading(),
    hasNativeTimestamp: () => typeof context?.getOutputTimestamp === 'function',
  };
}

function inspectPcm(buffer: AudioBuffer) {
  const soundBlocks = new Set<number>();
  const blockFrames = buffer.sampleRate / 2;
  let peak = 0;
  let nonfiniteSamples = 0;
  let float32 = true;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    float32 &&= samples instanceof Float32Array;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      if (!Number.isFinite(sample)) {
        nonfiniteSamples++;
        continue;
      }
      const level = Math.abs(sample);
      peak = Math.max(peak, level);
      if (level > 0.0001) soundBlocks.add(Math.floor(i / blockFrames));
    }
  }
  return {
    nonfiniteSamples,
    bgmPeak: nonfiniteSamples ? null : peak,
    float32,
    audibleHalfSecondBlocks: soundBlocks.size,
  };
}

export async function prepareProduct(
  product: ReturnType<typeof createMeasuredProduct>,
  fixtureId: FixtureId,
  token: Token,
) {
  const prototype = globalThis.OfflineAudioContext?.prototype;
  if (!prototype) throw new Error('audio.offlineContextUnavailable');
  const original = prototype.startRendering;
  // Observe the native render already used by the product. It keeps its original promise and buffer.
  const capture: { buffer?: AudioBuffer } = {};
  const startedAtMs = performance.now();
  try {
    prototype.startRendering = function () {
      const rendering = original.call(this);
      void rendering.then((buffer) => { capture.buffer = buffer; }, () => undefined);
      return rendering;
    };
    const pending = product.audio.renderMusic(fixtures[fixtureId].definition, token);
    const maxSimultaneousRenders = product.audio.diagnostics().rendering;
    const result = await pending;
    const completedAtMs = performance.now();
    const buffer = capture.buffer;
    if (!result.ok || !buffer) return { result, preparation: null };
    const diagnostics = product.audio.diagnostics();
    const preparation: Preparation = {
      startedAtMs,
      completedAtMs,
      generationMs: completedAtMs - startedAtMs,
      durationSec: buffer.duration,
      channels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
      frames: buffer.length,
      pcmBytes: buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
      cacheCount: diagnostics.cached,
      renderingCount: diagnostics.rendering,
      maxSimultaneousRenders,
      ...inspectPcm(buffer),
    };
    return { result, preparation };
  } finally {
    prototype.startRendering = original;
  }
}

export function hasExpectedPcm(preparation: Preparation, fixture: FixtureId) {
  const duration = fixtures[fixture].durationSec;
  return preparation.durationSec === duration
    && preparation.channels === 2
    && preparation.sampleRate === 48_000
    && preparation.frames === duration * 48_000
    && preparation.pcmBytes === duration * 48_000 * 2 * Float32Array.BYTES_PER_ELEMENT
    && preparation.float32
    && preparation.nonfiniteSamples === 0
    && preparation.bgmPeak !== null
    && preparation.bgmPeak > 0
    && preparation.bgmPeak <= 10 ** (-3 / 20)
    && preparation.audibleHalfSecondBlocks >= duration * 2 - 1
    && preparation.cacheCount === 1
    && preparation.renderingCount === 0
    && preparation.maxSimultaneousRenders === 1;
}
