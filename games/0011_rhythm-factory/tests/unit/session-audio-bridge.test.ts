import { expect, it, vi } from 'vitest';
import type { Gen, Ms, PreparedTrack, Result, Sec, Us } from '../../src/contracts/interface_contracts';
import { clockSampleIntervalMs, createFixedAudioClock, tickToUs } from '../../src/domain/audio-clock';
import { createSessionAudioBridge } from '../../src/infrastructure/session-audio-bridge';
import { createWebAudio } from '../../src/infrastructure/web-audio';

const ms = (value: number) => value as Ms;
const us = (value: number) => value as Us;
const track: PreparedTrack = { preparationId: 'track', musicId: 'music-01', channels: 2, sampleRate: 48000, durationUs: us(24_000_000) };
const request = (value: number) => ({ requestId: `r${value}`, sessionId: 's', generation: value as Gen });

function setup() {
  let stamp = { contextTime: 10, performanceTime: 100 };
  const output = vi.fn(() => stamp);
  const audio: ReturnType<typeof createWebAudio> = {
    ...createWebAudio(tickToUs),
    currentTime: () => 10 as Sec,
    outputTimestamp: output,
    playAt: vi.fn((_, position, startAt, token) => ({
      ok: true as const, value: { playbackId: token.requestId, sessionId: token.sessionId!, generation: token.generation as Gen,
        startAudioSec: startAt, startSongUs: position, anchorAudioSec: stamp.contextTime as Sec, anchorPerformanceMs: ms(stamp.performanceTime) },
    })),
    stop: vi.fn(() => ({ ok: true as const, value: undefined })),
  };
  const bridge = createSessionAudioBridge(tickToUs, createFixedAudioClock, clockSampleIntervalMs, audio);
  return {
    bridge, audio, output, setSample: (contextTime: number, performanceTime: number) => { stamp = { contextTime, performanceTime }; },
  };
}

function get<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error.messageKey);
  return result.value;
}

it('keeps the fixed anchor and checks the first 100ms sample with the approved 20ms limit', () => {
  const r = setup();
  const started = get(r.bridge.start({ token: request(1), track, songTimeUs: us(-150_000), offsetUs: us(25_000), atMs: ms(100), playBgm: true }));
  expect(r.audio.playAt).toHaveBeenCalledWith(track, -150_000, 10.05, request(1));
  expect(r.bridge.contextAt(ms(149.999))).toBeNull();
  expect(r.bridge.contextAt(ms(150.001))?.clockGeneration).toBe(1);
  expect(get(r.bridge.convert(ms(150), started.generation))).toEqual({ generation: 1, songTimeUs: -150_000, judgeTimeUs: -175_000 });

  // The first check must reject a real output-clock discrepancy instead of replacing the anchor.
  r.setSample(10.121, 200);
  expect(r.bridge.monitor(ms(199.999))).toMatchObject({ ok: true });
  expect(r.output).toHaveBeenCalledTimes(1);
  expect(r.bridge.monitor(ms(200))).toMatchObject({ ok: false, error: { code: 'ERR-006' } });
});

it('preserves the earlier generation for occurrence-time routing and resumes FINALIZING without a new source', () => {
  const r = setup();
  get(r.bridge.start({ token: request(1), track, songTimeUs: us(0), offsetUs: us(0), atMs: ms(100), playBgm: true }));
  get(r.bridge.stop(request(1)));
  r.setSample(12, 2000);
  const silent = get(r.bridge.start({ token: request(2), songTimeUs: us(24_100_000), offsetUs: us(0), atMs: ms(2001), playBgm: false }));
  expect(r.audio.playAt).toHaveBeenCalledTimes(1);
  expect(r.bridge.contextAt(ms(2000.999))?.clockGeneration).toBe(1);
  expect(r.bridge.contextAt(ms(2001))?.clockGeneration).toBe(2);
  expect(get(r.bridge.convert(ms(2001), silent.generation)).songTimeUs).toBe(24_100_000);
});
