import { expect, it, vi } from 'vitest';
import type { Gen, Ms, Sec, Us } from '../../src/contracts/interface_contracts';
import { clockSampleIntervalMs, createFixedAudioClock, tickToUs } from '../../src/domain/audio-clock';
import { createCalibration } from '../../src/domain/calibration';
import { createSessionAudioBridge } from '../../src/infrastructure/session-audio-bridge';
import { createTrialCalibrationCue } from '../../src/infrastructure/trial-calibration-cue';
import { createWebAudio } from '../../src/infrastructure/web-audio';

function gain() {
  return {
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    disconnect: vi.fn(), connect: vi.fn((destination: object) => destination),
  };
}

function fixture() {
  const voice = { frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(),
    connect: vi.fn((destination: object) => destination), onended: null as (() => void) | null };
  const envelope = gain();
  const master = gain();
  const context = { state: 'running', currentTime: 10.1, destination: {}, createOscillator: vi.fn(() => voice),
    createGain: vi.fn().mockReturnValueOnce(envelope).mockReturnValueOnce(master) };
  return { voice, envelope, master, context, cue: createTrialCalibrationCue(() => context as unknown as AudioContext) };
}

it('schedules all native cue envelopes at the same 16 beats used by the estimator, in one voice', () => {
  const { cue, voice, envelope, master, context } = fixture();
  const beats = createCalibration().beatTimesUs;
  cue.setVolume(40);
  expect(cue.start(10.15 as Sec, beats)).toBe(true);
  expect(voice.start).toHaveBeenCalledExactlyOnceWith(10.15);
  expect(context.createOscillator).toHaveBeenCalledTimes(1);
  expect(envelope.gain.setValueAtTime.mock.calls).toHaveLength(16);
  for (let index = 0; index < 16; index++) {
    const time = 10.15 + index * 0.6;
    expect(envelope.gain.setValueAtTime.mock.calls[index]?.[1]).toBeCloseTo(time, 10);
    expect(envelope.gain.linearRampToValueAtTime.mock.calls[index * 2]?.[0]).toBe(0.0625);
    expect(envelope.gain.linearRampToValueAtTime.mock.calls[index * 2]?.[1]).toBeCloseTo(time + 0.003, 10);
  }
  expect(master.gain.value).toBe(0.4);
  expect(cue.active()).toBe(1);
  const onEnded = voice.onended;
  onEnded?.();
  expect(cue.active()).toBe(0);
  expect(master.disconnect).toHaveBeenCalledTimes(1);
});

it('uses the scheduled cue origin for input and verifies the first 100ms native-clock sample', () => {
  const { cue, voice } = fixture();
  let observation = { contextTime: 10, performanceTime: 1000 };
  const audio = { ...createWebAudio(tickToUs), currentTime: () => 10.1 as Sec,
    outputTimestamp: () => observation };
  const bridge = createSessionAudioBridge(tickToUs, createFixedAudioClock, clockSampleIntervalMs, audio, cue);
  const token = { sessionId: 'calibration-1', requestId: '1', generation: 1 as Gen };
  const started = bridge.start({ atMs: 1000 as Ms, offsetUs: 0 as Us, songTimeUs: 0 as Us,
    playBgm: false, calibrationBeatsUs: createCalibration().beatTimesUs, token });
  expect(started.ok).toBe(true);
  const startAtMs = bridge.startPerformanceMs(token.generation);
  expect(startAtMs).toBeCloseTo(1150, 9);
  expect(bridge.contextAt(999.999 as Ms)).toBeNull();
  const early = bridge.contextAt(1000 as Ms);
  expect(early).toMatchObject({ sessionId: 'calibration-1', clockGeneration: 1 });
  expect(early?.clock.convertEventTime(1050 as Ms, token.generation)).toMatchObject({ ok: true, value: { songTimeUs: -100_000 } });
  expect(bridge.convert(startAtMs!, token.generation)).toMatchObject({ ok: true, value: { songTimeUs: 0 } });
  observation = { contextTime: 10.121, performanceTime: 1100 };
  expect(bridge.monitor(1099.999 as Ms).ok).toBe(true);
  expect(bridge.monitor(1100 as Ms)).toMatchObject({ ok: false, error: { code: 'ERR-006' } });
  expect(voice.stop).toHaveBeenCalledTimes(2);
  expect(voice.disconnect).toHaveBeenCalledTimes(1);
  expect(cue.active()).toBe(0);
});
