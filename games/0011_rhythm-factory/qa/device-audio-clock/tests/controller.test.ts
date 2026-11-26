// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEvent, Ms, PlaybackAnchor, PreparedTrack, Sec, Token, Us } from '../../../src/contracts/interface_contracts';
import type { Preparation } from '../src/model';
import { stageA2TrialMusic } from '../../../src/content/stage-a2-trial';

const mock = vi.hoisted(() => ({ create: vi.fn(), prepare: vi.fn() }));
vi.mock('../src/product', async (loadOriginal) => ({
  ...await loadOriginal<typeof import('../src/product')>(),
  createMeasuredProduct: mock.create,
  prepareProduct: mock.prepare,
}));

import { createHarnessController } from '../src/controller';

const track = {
  musicId: stageA2TrialMusic.master.musicId,
  durationUs: 24_000_000 as Us,
  sampleRate: 48_000,
  channels: 2,
  preparationId: 'TEST FIXTURE',
} as PreparedTrack;

const pcm: Preparation = {
  startedAtMs: 100, completedAtMs: 200, generationMs: 100, durationSec: 24, channels: 2,
  sampleRate: 48_000, frames: 1_152_000, pcmBytes: 9_216_000, nonfiniteSamples: 0,
  bgmPeak: 0.25, float32: true, audibleHalfSecondBlocks: 48, cacheCount: 1,
  renderingCount: 0, maxSimultaneousRenders: 1,
};
const prepared = { result: { ok: true, value: track }, preparation: pcm };

function productFixture() {
  const owner = new Set<(notification: AudioEvent) => void>();
  let live: Token | null = null;
  let active: PlaybackAnchor | null = null;
  let ready = true;
  let sample: { contextTime: number; performanceTime: number } | undefined = { contextTime: .006, performanceTime: 100 };
  let contextState = 'suspended';
  let performanceNow = 100;
  const stop = vi.fn(() => { live = null; return { ok: true }; });
  const dispose = vi.fn(async () => { contextState = 'closed'; live = null; });
  const audio = {
    subscribeAudioEvents: vi.fn((listener: (notification: AudioEvent) => void) => {
      owner.add(listener);
      return () => owner.delete(listener);
    }),
    enable: vi.fn(async () => { contextState = 'running'; return { ok: true }; }),
    currentTime: vi.fn(() => .12 as Sec),
    outputTimestamp: vi.fn(() => ready ? sample : undefined),
    playAt: vi.fn((_track: PreparedTrack, offset: Us, startAt: Sec, token: Token) => {
      live = token;
      performanceNow += 100;
      active = {
        playbackId: 'source-' + token.generation, sessionId: token.sessionId!,
        generation: token.generation, startAudioSec: startAt, startSongUs: offset,
        anchorAudioSec: sample!.contextTime, anchorPerformanceMs: sample!.performanceTime,
      } as PlaybackAnchor;
      return { ok: true, value: active };
    }),
    stop, dispose,
    diagnostics: vi.fn(() => ({ cached: 0, rendering: 0, sources: live ? 1 : 0, voices: 0 })),
  };
  return {
    audio, state: () => contextState, hasNativeTimestamp: () => true, beginRead: () => undefined,
    read: () => ({
      performanceNow,
      currentTime: .12,
      contextTime: sample?.contextTime ?? null,
      performanceTime: sample?.performanceTime ?? null,
      audioContextState: contextState,
    }),
    setSample(contextTime: number, outputPerformanceMs: number) {
      sample = { contextTime, performanceTime: outputPerformanceMs };
      performanceNow = outputPerformanceMs + 6;
    },
    setUnavailable() { ready = false; sample = undefined; },
    owner: () => live!, anchor: () => active!,
    emit(notification: AudioEvent) { for (const listener of owner) listener(notification); },
  };
}

describe('QA trial controller with fixed product clock and controlled native readings', () => {
  let controlled: ReturnType<typeof productFixture>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary' } });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    controlled = productFixture();
    mock.create.mockReset().mockReturnValue(controlled);
    mock.prepare.mockReset().mockResolvedValue(prepared);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function toPlaying(testCase: 'DEV-AUD-01' | 'DEV-AUD-02' | 'DEV-AUD-03' = 'DEV-AUD-02') {
    const controller = createHarnessController();
    controller.setTestCase(testCase);
    await controller.prepare();
    await controller.enable(true);
    await controller.start(true);
    expect(controller.getState().phase).toBe('playing');
    return controller;
  }

  it('accepts the inclusive exact 20 ms and records the actual first observation', async () => {
    const controller = await toPlaying('DEV-AUD-01');
    controlled.setSample(.086, 200);
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getState().current).toMatchObject({
      status: 'PASS', released: true, observations: [{ valid: true, overLimit: false }],
    });
  });

  it('stops on the first observation just over 20 ms before display rounding', async () => {
    const controller = await toPlaying();
    controlled.setSample(.0859999, 200);
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getState().current).toMatchObject({
      status: 'FAIL', released: true, reason: 'clock.outOfSync',
      observations: [{ valid: true, overLimit: true, safetyStopReason: 'clock.outOfSync' }],
    });
    expect(controlled.audio.stop).toHaveBeenCalledTimes(1);
  });

  it.each(['backward', 'nonfinite', 'unavailable'] as const)('preserves a %s observation and stops safely', async (failure) => {
    const controller = await toPlaying();
    if (failure === 'backward') controlled.setSample(.005, 199);
    else if (failure === 'nonfinite') controlled.setSample(Number.NaN, 200);
    else controlled.setUnavailable();
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getState().current).toMatchObject({
      status: 'FAIL', released: true, observations: [{ valid: false, overLimit: false }],
    });
  });

  it('records activation pending as BLOCKED and releases without consuming a second gesture', async () => {
    const controller = createHarnessController();
    await controller.prepare();
    controlled.audio.enable.mockImplementation(() => new Promise(() => undefined));
    const enabling = controller.enable(true);
    await vi.advanceTimersByTimeAsync(1800);
    await enabling;
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState().current).toMatchObject({ status: 'BLOCKED', activation: 'PENDING', released: true });
  });

  it('does not create a generation when native anchor is unavailable', async () => {
    const controller = createHarnessController();
    await controller.prepare();
    await controller.enable(true);
    controlled.setUnavailable();
    const starting = controller.start(true);
    await vi.advanceTimersByTimeAsync(1900);
    await starting;
    expect(controlled.audio.playAt).not.toHaveBeenCalled();
    expect(controller.getState().current).toMatchObject({ status: 'BLOCKED', anchor: 'FAIL', anchors: [] });
  });

  it('blocks duplicate cold generation, still keeps aborted trials and opens a fresh trial after release', async () => {
    const controller = createHarnessController();
    let complete!: (value: typeof prepared) => void;
    mock.prepare.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const render = controller.prepare();
    await controller.prepare();
    expect(mock.prepare).toHaveBeenCalledTimes(1);
    const abort = controller.abort();
    controller.nextTrial();
    complete(prepared);
    await Promise.all([render, abort]);
    expect(controller.getState().trials).toMatchObject([{ status: 'ABORTED', released: true }]);
    controller.nextTrial();
    await controller.prepare();
    expect(mock.create).toHaveBeenCalledTimes(2);
    expect(controller.getState().trials).toHaveLength(1);
    expect(controller.getState().current?.trialId).not.toBe(controller.getState().trials[0]?.trialId);
  });

  it('blocks duplicate play and ignores unsigned actions before invoking the product', async () => {
    const controller = createHarnessController();
    await controller.prepare();
    await controller.enable(false);
    expect(controlled.audio.enable).not.toHaveBeenCalled();
    await controller.enable(true);
    await Promise.all([controller.start(true), controller.start(true)]);
    expect(controlled.audio.playAt).toHaveBeenCalledTimes(1);
    await controller.release();
  });

  it('handles interruption from the matching owner without consuming another clock sample', async () => {
    const controller = await toPlaying();
    const token = controlled.owner();
    const anchor = controlled.anchor();
    controlled.emit({ ...token, kind: 'INTERRUPTED', playbackId: anchor.playbackId, at: 123 as Ms });
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getState().current).toMatchObject({
      status: 'FAIL', reason: 'audio.interrupted', released: true, observations: [],
    });
  });

  it('requires a new generation on resume and ignores the prior generation ENDED', async () => {
    const controller = await toPlaying('DEV-AUD-03');
    const originalToken = controlled.owner();
    const originalAnchor = controlled.anchor();
    controlled.setSample(.106, 200);
    await vi.advanceTimersByTimeAsync(100);
    controller.stop();
    await controller.resume(true);
    const resumed = controlled.anchor();
    controlled.emit({ ...originalToken, kind: 'ENDED', playbackId: originalAnchor.playbackId, clockGeneration: originalAnchor.generation });
    expect(controller.getState().phase).toBe('playing');
    expect(resumed.generation).not.toBe(originalAnchor.generation);
    for (let i = 1; i <= 10; i++) {
      controlled.setSample(.106 + i / 10, 200 + i * 100);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(controller.getState().current).toMatchObject({ status: 'PASS', restarted: true, released: true });
  });
});
