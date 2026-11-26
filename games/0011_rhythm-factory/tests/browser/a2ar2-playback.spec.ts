import process from 'node:process';
import { expect, test } from '@playwright/test';
import type { AudioEvent, PlaybackAnchor, Result, Sec, Token, Us } from '../../src/contracts/interface_contracts';
import type { OutputClockSample } from '../../src/domain/audio-clock';

const condition = process.env.STAGE_A2AR2_CONDITION?.trim();
const appUrl = 'http://127.0.0.1:4173/daily-mini-games/games/0011_rhythm-factory/';
const activationWaitMs = 1800;
const stopAfterClockSamples = 10;
const restartClockSamples = 10;

// Opt-in to avoid changing the approved default E2E suite.
const scenarios = condition ? [
  { kind: 'natural', durationSec: 24, count: 10 },
  { kind: 'stop-restart', durationSec: 24, count: 3 },
  { kind: 'natural', durationSec: 84, count: 3 },
] as const : [];

type TrialKind = 'natural' | 'stop-restart';

interface NativeSourceEvent {
  sourceId: number;
  kind: 'start' | 'stop' | 'ended';
  atMs: number;
  contextTime: number;
  active: number;
  beforeAtMs?: number;
  beforeContextTime?: number;
  startSec?: number;
  offsetSec?: number;
  durationSec?: number;
  bufferDurationSec?: number | null;
}

interface ClockReading {
  atMs: number;
  currentTime: number;
  state: AudioContextState;
  raw: AudioTimestamp;
}

type NativeMetric = number | 'UNAVAILABLE';

interface ChromiumPlaybackDiagnostics {
  readonly playbackStats: 'AVAILABLE' | 'UNAVAILABLE';
  // Browser-reported durations and latencies are seconds. Underrun events are a count.
  readonly underrunDuration: NativeMetric;
  readonly underrunEvents: NativeMetric;
  readonly totalDuration: NativeMetric;
  readonly baseLatency: NativeMetric;
  readonly outputLatency: NativeMetric;
}

interface ClockRecord {
  sampleNumber: number;
  atMs: number;
  generation: number;
  raw: ClockReading | undefined;
  timestamp: OutputClockSample | undefined;
  signedDifferenceUs: number | null;
  result: Result<{ readonly differenceUs: Us }>;
  chromiumPlayback?: ChromiumPlaybackDiagnostics;
}

interface PcmObservation {
  readonly length: number;
  readonly channels: number;
  readonly rate: number;
  readonly pcmBytes: number;
  readonly float32: boolean;
  readonly peak: number;
  readonly nonfinite: number;
  readonly audibleHalfSecondBlocks: number;
}

interface PreparationRecord {
  readonly eventCount: number;
  readonly startedAtMs: number;
  readonly preparedAtMs: number;
  readonly elapsedMs: number;
  readonly status: 'prepared' | 'failed';
  readonly audioBuffer: PcmObservation | null;
  readonly mix: { singleSfxPeak: number; fourSfxPeak: number; mixedFirst100msPeak: number } | null;
}

interface TrialRecord {
  kind: TrialKind;
  performanceTimeOriginMs: number;
  contextsCreated: number;
  status: string;
  done: boolean;
  preparation: PreparationRecord | null;
  gestures: { action: string; trusted: boolean; atMs: number }[];
  activations: { generation: number; result: Result<void> | null; state: string | null; readings: ClockReading[] }[];
  anchors: PlaybackAnchor[];
  rawClockReads: ClockReading[];
  samples: ClockRecord[];
  audioEvents: AudioEvent[];
  sourceEvents: NativeSourceEvent[];
  resourceSnapshots: { action: string; cached: number; rendering: number; sources: number; voices: number; activeNative: number }[];
  findings: string[];
}

interface TrialWindow extends Window {
  a2ar2TrackCycle?: TrialRecord;
}

for (const { kind, durationSec, count } of scenarios) {
  for (let run = 1; run <= count; run++) {
    test(`A-2a-R2 ${kind}-${durationSec} trial ${run}`, async ({ playwright, browserName, launchOptions }, info) => {
      const expectedTrackUs = durationSec * 1_000_000;
      const progressWaitMs = durationSec * 1000 + 20_000;
      // The runner budget includes offline synthesis, outside the live playback evidence window.
      const preparationAllowanceMs = durationSec === 84 ? 110_000 : 20_000;
      test.setTimeout(progressWaitMs + preparationAllowanceMs);
      const browser = await playwright[browserName].launch(launchOptions);
      try {
        const page = await browser.newPage();
        const requests: string[] = [];
        page.on('request', (request) => requests.push(request.url()));
        await page.goto(appUrl);

        const chromiumDiagnostics = browserName === 'chromium' && condition === 'chromium-diagnostics';
        await page.evaluate(async ({
          url, kind, durationSec, activationWaitMs, stopAfterClockSamples, restartClockSamples, chromiumDiagnostics,
        }) => {
          const definition = durationSec === 84
            ? (await import(url + 'tests/fixtures/a2ar2-load-track.ts') as typeof import('../fixtures/a2ar2-load-track')).a2ar2LoadTrack
            : (await import(url + 'src/content/stage-a2-trial.ts') as typeof import('../../src/content/stage-a2-trial')).stageA2TrialMusic;
          const { createWebAudio } = await import(url + 'src/infrastructure/web-audio.ts') as typeof import('../../src/infrastructure/web-audio');
          const { createFixedAudioClock, clockSampleIntervalMs, tickToUs } =
            await import(url + 'src/domain/audio-clock.ts') as typeof import('../../src/domain/audio-clock');
          const { scheduleTick } = await import(url + 'src/infrastructure/sfx.ts') as typeof import('../../src/infrastructure/sfx');
          const record: TrialRecord = {
            kind,
            performanceTimeOriginMs: performance.timeOrigin,
            contextsCreated: 0,
            status: 'preparing',
            done: false,
            preparation: null,
            gestures: [],
            activations: [],
            anchors: [],
            rawClockReads: [],
            samples: [],
            audioEvents: [],
            sourceEvents: [],
            resourceSnapshots: [],
            findings: [],
          };
          (window as TrialWindow).a2ar2TrackCycle = record;

          const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
          let context: AudioContext | undefined;
          let nativeId = 0;
          const nativeActive = new Set<number>();
          const audio = createWebAudio(tickToUs, () => {
            const created = new AudioContext({ sampleRate: 48000 });
            context = created;
            record.contextsCreated++;
            // Record the native calls used by the adapter without changing their value or order.
            const readTimestamp = created.getOutputTimestamp.bind(created);
            created.getOutputTimestamp = () => {
              const raw = readTimestamp();
              record.rawClockReads.push({
                atMs: performance.now(), currentTime: created.currentTime, state: created.state,
                raw: { ...raw },
              });
              return raw;
            };

            const createSource = created.createBufferSource.bind(created);
            created.createBufferSource = () => {
              const source = createSource();
              const sourceId = ++nativeId;
              const start = source.start.bind(source);
              const stop = source.stop.bind(source);
              const timing = () => ({
                atMs: performance.now(), contextTime: created.currentTime, active: nativeActive.size,
              });
              source.start = (...args) => {
                const beforeAtMs = performance.now();
                const beforeContextTime = created.currentTime;
                start(...args);
                nativeActive.add(sourceId);
                const [startSec = 0, offsetSec = 0, durationSec] = args;
                record.sourceEvents.push({
                  sourceId, kind: 'start', ...timing(), beforeAtMs, beforeContextTime, startSec, offsetSec,
                  ...(durationSec === undefined ? {} : { durationSec }),
                  bufferDurationSec: source.buffer?.duration ?? null,
                });
              };
              source.stop = (...args) => {
                stop(...args);
                nativeActive.delete(sourceId);
                record.sourceEvents.push({ sourceId, kind: 'stop', ...timing() });
              };
              source.addEventListener('ended', () => {
                nativeActive.delete(sourceId);
                record.sourceEvents.push({ sourceId, kind: 'ended', ...timing() });
              }, { once: true });
              return source;
            };
            return created;
          });
          const captureResources = (action: string) => {
            record.resourceSnapshots.push({ action, ...audio.diagnostics(), activeNative: nativeActive.size });
          };
          audio.subscribeAudioEvents((event) => record.audioEvents.push(event));
          const original: Token = { requestId: 'a2ar2-original', generation: 1, sessionId: 'a2ar2-track-cycle' };
          const replacement: Token = { ...original, requestId: 'a2ar2-restart', generation: 2 };
          let currentOwner: Token | null = null;
          let finishing = false;
          const finish = async (status: string, finding?: string) => {
            if (finishing) return;
            finishing = true;
            record.status = status;
            if (finding) record.findings.push(finding);
            captureResources('before-dispose');
            // Bound evidence collection if a backend never settles. No product timeout is added.
            const settled = await Promise.race([
              audio.dispose().then(() => true, (error: unknown) => {
                record.findings.push(String(error));
                return false;
              }),
              wait(800).then(() => false),
            ]);
            if (!settled) record.findings.push('Browser cleanup did not settle within the harness wait');
            captureResources('after-dispose');
            record.done = true;
          };

          const analyze = (buffer: AudioBuffer): PcmObservation => {
            let peak = 0;
            let nonfinite = 0;
            const blocks = new Set<number>();
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
              const samples = buffer.getChannelData(channel);
              for (let frame = 0; frame < samples.length; frame++) {
                const sample = samples[frame]!;
                if (!Number.isFinite(sample)) nonfinite++;
                peak = Math.max(peak, Math.abs(sample));
                if (Math.abs(sample) > 0.0001) blocks.add(Math.floor(frame / (buffer.sampleRate / 2)));
              }
            }
            return {
              length: buffer.length, channels: buffer.numberOfChannels, rate: buffer.sampleRate,
              pcmBytes: buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
              float32: buffer.getChannelData(0) instanceof Float32Array,
              peak, nonfinite, audibleHalfSecondBlocks: blocks.size,
            };
          };

          const mixPeak = async (voices: number, background?: AudioBuffer) => {
            const mix = new OfflineAudioContext(2, 4800, 48000);
            if (background) {
              const source = mix.createBufferSource();
              source.buffer = background;
              source.connect(mix.destination);
              source.start(0);
            }
            for (let index = 0; index < voices; index++) scheduleTick(mix, mix.destination);
            return analyze(await mix.startRendering()).peak;
          };

          const prepareWithEvidence = async () => {
            // Observe the genuine buffer returned to the product renderer. Sampling and sound use the unchanged API.
            const captured: { buffer?: AudioBuffer } = {};
            const prototype = OfflineAudioContext.prototype;
            const startRendering = prototype.startRendering;
            const started = performance.now();
            let track;
            try {
              prototype.startRendering = async function () {
                const buffer = await startRendering.call(this);
                captured.buffer = buffer;
                return buffer;
              };
              track = await audio.renderMusic(definition, original);
            } finally {
              prototype.startRendering = startRendering;
            }
            const preparedAtMs = performance.now();
            const buffer = captured.buffer;
            const audioBuffer = buffer ? analyze(buffer) : null;
            // Diagnostics run before user activation and do not retain a buffer during live playback.
            const mix = buffer ? {
              singleSfxPeak: await mixPeak(1),
              fourSfxPeak: await mixPeak(4),
              mixedFirst100msPeak: await mixPeak(4, buffer),
            } : null;
            record.preparation = {
              eventCount: definition.events.length, startedAtMs: started, preparedAtMs,
              elapsedMs: preparedAtMs - started,
              status: track.ok ? 'prepared' : 'failed', audioBuffer, mix,
            };
            return track;
          };

          const track = await prepareWithEvidence();
          if (!track.ok) {
            await finish('preparation-failed', track.error.code);
            return;
          }
          captureResources('prepared');

          const addButton = (label: string, action: string, handler: () => Promise<void>) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.disabled = true;
            document.body.append(button);
            button.addEventListener('click', (event) => {
              record.gestures.push({ action, trusted: event.isTrusted, atMs: performance.now() });
              button.disabled = true;
              void handler().catch((error: unknown) => finish('probe-error', String(error)));
            });
            return button;
          };

          const readNativeMetric = (owner: object | undefined, name: string): NativeMetric => {
            try {
              const value: unknown = owner ? Reflect.get(owner, name) : undefined;
              return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 'UNAVAILABLE';
            } catch {
              return 'UNAVAILABLE';
            }
          };
          const readChromiumDiagnostics = (): ChromiumPlaybackDiagnostics => {
            let stats: object | undefined;
            try {
              const value: unknown = context ? Reflect.get(context, 'playbackStats') : undefined;
              if (typeof value === 'object' && value !== null) stats = value;
            } catch {
              // Feature missing or inaccessible in this browser context.
            }
            return {
              playbackStats: stats ? 'AVAILABLE' : 'UNAVAILABLE',
              underrunDuration: readNativeMetric(stats, 'underrunDuration'),
              underrunEvents: readNativeMetric(stats, 'underrunEvents'),
              totalDuration: readNativeMetric(stats, 'totalDuration'),
              baseLatency: readNativeMetric(context, 'baseLatency'),
              outputLatency: readNativeMetric(context, 'outputLatency'),
            };
          };

          const monitor = async (token: Token, anchor: PlaybackAnchor, clock: ReturnType<typeof createFixedAudioClock>) => {
            if (!clock.ok) {
              await finish('invalid-anchor', clock.error.code);
              return;
            }
            let sampleNumber = 0;
            while (currentOwner === token && !finishing) {
              await wait(clockSampleIntervalMs);
              if (currentOwner !== token || finishing) return;
              const readsBefore = record.rawClockReads.length;
              const timestamp = audio.outputTimestamp();
              const result = clock.value.observe(timestamp);
              const raw = record.rawClockReads[readsBefore];
              const signedDifferenceUs = timestamp ? Math.round((timestamp.contextTime - (
                anchor.anchorAudioSec + (timestamp.performanceTime - anchor.anchorPerformanceMs) / 1000
              )) * 1_000_000) : null;
              const reading: ClockRecord = {
                generation: token.generation, sampleNumber: ++sampleNumber, atMs: performance.now(),
                raw, timestamp, signedDifferenceUs, result,
              };
              record.samples.push(reading);
              if (!result.ok) audio.stop(token);
              if (chromiumDiagnostics) reading.chromiumPlayback = readChromiumDiagnostics();
              if (!result.ok) {
                captureResources('safety-stop');
                await finish('safety-stop', result.error.messageKey);
                return;
              }

              const ended = record.audioEvents.some((event) => event.kind === 'ENDED'
                && event.playbackId === anchor.playbackId && event.clockGeneration === token.generation);
              if (ended) {
                captureResources('natural-ended');
                await finish(kind === 'natural' ? 'natural-completed' : 'unexpected-natural-end');
                return;
              }
              if (kind === 'stop-restart' && token === original && sampleNumber >= stopAfterClockSamples) {
                record.status = 'ready-to-stop';
                stopButton.disabled = false;
              }
              if (kind === 'stop-restart' && token === replacement && sampleNumber >= restartClockSamples) {
                captureResources('restart-observed');
                audio.stop(token);
                captureResources('restart-stopped');
                await finish('restart-completed');
                return;
              }
            }
          };

          const start = async (token: Token) => {
            record.status = 'activating';
            const readsBefore = record.rawClockReads.length;
            const activationStartedMs = performance.now();
            const activated = await Promise.race([audio.enable(), wait(activationWaitMs).then(() => null)]);
            if (!activated?.ok) {
              context?.getOutputTimestamp();
              record.activations.push({
                generation: token.generation, result: activated, state: context?.state ?? null,
                readings: record.rawClockReads.slice(readsBefore),
              });
              await finish('activation-unavailable', activated?.error.messageKey);
              return;
            }
            // Preserve every readiness read. The fixed anchor uses the adapter's next native sample.
            let available = audio.outputTimestamp();
            while (!available && performance.now() - activationStartedMs < activationWaitMs) {
              await wait(clockSampleIntervalMs);
              available = audio.outputTimestamp();
            }
            record.activations.push({
              generation: token.generation, result: activated, state: context?.state ?? null,
              readings: record.rawClockReads.slice(readsBefore),
            });
            if (!available) {
              await finish('anchor-unavailable');
              return;
            }
            const currentTime = audio.currentTime();
            if (currentTime === undefined) {
              await finish('anchor-unavailable', 'AudioContext time unavailable after activation');
              return;
            }
            const started = audio.playAt(track.value, 0 as Us, (currentTime + 0.05) as Sec, token);
            if (!started.ok) {
              await finish('start-refused', started.error.messageKey);
              return;
            }
            currentOwner = token;
            record.anchors.push(started.value);
            captureResources('started-' + token.generation);
            record.status = 'playing';

            if (token === replacement) {
              audio.stop(original);
              captureResources('stale-owner-stop');
            }
            await monitor(token, started.value, createFixedAudioClock(started.value, 0 as Us));
          };

          const startButton = addButton('R2 start', 'start', () => start(original));
          const stopButton = addButton('R2 stop', 'stop', async () => {
            if (currentOwner !== original) { await finish('stop-owner-mismatch'); return; }
            currentOwner = null;
            audio.stop(original);
            captureResources('stopped-original');
            record.status = 'ready-to-restart';
            restartButton.disabled = false;
          });
          const restartButton = addButton('R2 restart', 'restart', () => start(replacement));
          record.status = 'ready-to-start';
          startButton.disabled = false;
        }, { url: appUrl, kind, durationSec, activationWaitMs, stopAfterClockSamples, restartClockSamples, chromiumDiagnostics });

        let interactionFailure: string | undefined;
        try {
          const start = page.getByRole('button', { name: 'R2 start' });
          if (await start.count()) await start.click();
          if (kind === 'stop-restart') {
            await page.waitForFunction(() => {
              const status = (window as TrialWindow).a2ar2TrackCycle;
              return status?.done || status?.status === 'ready-to-stop';
            }, undefined, { timeout: progressWaitMs });
            if (await page.evaluate(() => (window as TrialWindow).a2ar2TrackCycle?.status === 'ready-to-stop')) {
              await page.getByRole('button', { name: 'R2 stop' }).click();
              await page.getByRole('button', { name: 'R2 restart' }).click();
            }
          }
          await page.waitForFunction(() => (window as TrialWindow).a2ar2TrackCycle?.done, undefined, { timeout: progressWaitMs });
        } catch (error) {
          interactionFailure = String(error);
        }
        const result = await page.evaluate(() => (window as TrialWindow).a2ar2TrackCycle);
        const outgoing = requests.filter((request) => new URL(request).origin !== new URL(appUrl).origin);
        await info.attach('a2ar2-playback-raw', {
          body: JSON.stringify({ engine: browserName, version: browser.version(), condition, kind, durationSec, run, result, outgoing, interactionFailure }),
          contentType: 'application/json',
        });
        expect(interactionFailure).toBeUndefined();
        if (!result) throw new Error('Missing R2 playback evidence');
        expect(result.preparation).toMatchObject({
          status: 'prepared',
          audioBuffer: {
            length: durationSec * 48_000, channels: 2, rate: 48_000,
            pcmBytes: durationSec * 48_000 * 2 * 4, float32: true, nonfinite: 0,
          },
        });
        expect(result.preparation?.audioBuffer?.audibleHalfSecondBlocks).toBeGreaterThanOrEqual(durationSec * 2 - 1);
        expect(result.preparation?.audioBuffer?.peak).toBeGreaterThan(0);
        expect(result.preparation?.audioBuffer?.peak).toBeLessThanOrEqual(10 ** (-3 / 20));
        expect(result.preparation?.mix?.singleSfxPeak).toBeLessThanOrEqual(0.0625);
        expect(result.preparation?.mix?.fourSfxPeak).toBeLessThanOrEqual(0.25);
        expect(result.preparation?.mix?.mixedFirst100msPeak).toBeLessThanOrEqual(10 ** (-3 / 20) + 0.25);
        expect(result.status).toBe(kind === 'natural' ? 'natural-completed' : 'restart-completed');

        expect(outgoing).toEqual([]);
        expect(result.contextsCreated).toBe(1);
        expect(result.findings).toEqual([]);
        expect(result.gestures).toHaveLength(kind === 'natural' ? 1 : 3);
        expect(result.gestures.every((gesture) => gesture.trusted)).toBe(true);
        expect(result.sourceEvents.every((event) => event.active <= 1)).toBe(true);
        expect(result.resourceSnapshots.every((snapshot) =>
          snapshot.sources <= 1 && snapshot.activeNative <= 1 && snapshot.cached <= 1 && snapshot.rendering <= 1)).toBe(true);
        expect(result.resourceSnapshots.at(-1)).toMatchObject({
          action: 'after-dispose', sources: 0, activeNative: 0, cached: 0, rendering: 0, voices: 0,
        });

        const starts = result.sourceEvents.filter((event) => event.kind === 'start');
        const originalAnchor = result.anchors[0];
        expect(originalAnchor).toMatchObject({ generation: 1, startSongUs: 0 });
        expect(starts[0]).toMatchObject({ sourceId: 1, offsetSec: 0, bufferDurationSec: expectedTrackUs / 1_000_000 });
        expect(starts).toHaveLength(kind === 'natural' ? 1 : 2);
        expect(result.samples.every((sample) => sample.result.ok && sample.raw !== undefined)).toBe(true);
        expect(result.samples[0]).toMatchObject({ generation: 1, sampleNumber: 1 });
        if (kind === 'natural') {
          expect(result.sourceEvents.map((event) => event.kind)).toEqual(['start', 'ended']);
          expect(result.audioEvents.filter((event) => event.kind === 'ENDED')).toMatchObject([
            { generation: 1, clockGeneration: 1, playbackId: originalAnchor?.playbackId },
          ]);
          expect(result.samples.at(-1)?.atMs).toBeGreaterThanOrEqual(result.sourceEvents[1]?.atMs ?? Infinity);
        } else {
          const restartAnchor = result.anchors[1];
          expect(restartAnchor).toMatchObject({ generation: 2, startSongUs: 0 });
          expect(restartAnchor?.playbackId).not.toBe(originalAnchor?.playbackId);
          expect(result.samples.find((sample) => sample.generation === 2)).toMatchObject({ sampleNumber: 1 });
          expect(result.audioEvents.filter((event) => event.kind === 'ENDED')).toEqual([]);
          expect(result.audioEvents.filter((event) => event.kind === 'STOPPED')).toMatchObject([
            { generation: 1, playbackId: originalAnchor?.playbackId },
            { generation: 2, playbackId: restartAnchor?.playbackId },
          ]);
          expect(starts[1]).toMatchObject({ sourceId: 2, offsetSec: 0 });
          expect(result.resourceSnapshots.find((snapshot) => snapshot.action === 'stale-owner-stop')).toMatchObject({
            sources: 1, activeNative: 1,
          });
        }
      } finally {
        await browser.close();
      }
    });
  }
}
