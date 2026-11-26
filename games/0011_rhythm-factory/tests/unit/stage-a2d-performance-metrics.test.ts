import { describe, expect, it } from 'vitest';
import {
  summarizeAudioSync, summarizeFrames, summarizeInputDelivery, summarizeResources, summarizeSamples,
} from '../../tools/stage-a2d-performance-metrics';

describe('A-2d performance evidence aggregation', () => {
  it('keeps an even-count median and one-indexed nearest-rank P95 and P99', () => {
    const ordered = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarizeSamples(ordered.reverse())).toEqual({
      sampleCount: 100, invalidSampleCount: 0, median: 50.5, p95: 95, p99: 99, maximum: 100,
    });
  });

  it('never inserts fabricated zero samples for an empty or invalid observation', () => {
    expect(summarizeSamples([NaN, Infinity, -1])).toEqual({
      sampleCount: 0, invalidSampleCount: 3, median: null, p95: null, p99: null, maximum: null,
    });
    expect(summarizeFrames([]).status).toBe('UNMEASURED');
    expect(summarizeAudioSync([]).status).toBe('UNMEASURED');
    expect(summarizeResources([]).activeSources.maximum).toBeNull();
  });

  it('excludes first 3000ms and does not count the pause or a generation boundary as a frame interval', () => {
    const frame = (atMs: number, state = 'PLAYING', generation = 1) => ({ atMs, state, sessionId: 'test', generation });
    const events = [
      frame(0), frame(2990), frame(3000), frame(3016), frame(3032), frame(3100, 'PAUSED'),
      frame(10_000, 'PLAYING', 2), frame(13_000, 'PLAYING', 2), frame(13_016, 'PLAYING', 2),
      frame(30_000, 'PLAYING', 3), frame(33_000, 'PLAYING', 3), frame(33_016, 'PLAYING', 3),
    ];
    expect(summarizeFrames(events)).toMatchObject({
      medianFps: 62.5, intervalMs: { sampleCount: 4, p95: 16, maximum: 16 }, status: 'WITHIN_REFERENCE',
    });
  });

  it('exposes slow frames after warmup at the measured precision', () => {
    const result = summarizeFrames([0, 3000, 3017, 3034, 3134.01].map(atMs => ({ atMs, state: 'PLAYING' })));
    expect(result.intervalMs.maximum).toBeCloseTo(100.01);
    expect(result.status).toBe('OUTSIDE_REFERENCE');
  });

  it('counts >50ms delivery strictly and separates timestamp failures', () => {
    const result = summarizeInputDelivery([
      { eventPerformanceMs: 1, receivedPerformanceMs: 51 },
      { eventPerformanceMs: 1, receivedPerformanceMs: 51.01 },
      { eventPerformanceMs: 2, receivedPerformanceMs: 1 },
      { eventPerformanceMs: -1, receivedPerformanceMs: 3 },
    ]);
    expect(result).toMatchObject({ sampleCount: 2, invalidSampleCount: 2, over50msCount: 1 });
    expect(result.median).toBeCloseTo(50.005);
  });

  it('retains audio safety errors and an absolute 20.001ms excursion', () => {
    expect(summarizeAudioSync([{ differenceUs: -20_000 }]).status).toBe('WITHIN_REFERENCE');
    expect(summarizeAudioSync([{ differenceUs: -20_001 }]).status).toBe('OUTSIDE_REFERENCE');
    expect(summarizeAudioSync([{ differenceUs: null, errorCode: 'ERR-006' }]).status).toBe('OUTSIDE_REFERENCE');
    expect(summarizeAudioSync([{ differenceUs: null, errorCode: 'ERR-005' }]).status).toBe('UNMEASURED');
  });

  it('separates cache, render, BGM, listener and rAF observations', () => {
    const before = { cacheTracks: 0, activeRenders: 1, activeSources: 1, activeRafLoops: 1 };
    const after = { cacheTracks: 1, activeRenders: 0, activeSources: 0 };
    expect(summarizeResources([before, after])).toMatchObject({
      cacheTracks: { maximum: 1 }, activeRenders: { maximum: 1 }, activeSources: { maximum: 1 },
      activeRafLoops: { sampleCount: 1 }, activeListeners: { sampleCount: 0, maximum: null }, last: after,
    });
  });
});
