import { expect, test } from '@playwright/test';
import type { AudioEvent, PlaybackAnchor, Result, Sec, Token, Us } from '../../src/contracts/interface_contracts';
import type { OutputClockSample } from '../../src/domain/audio-clock';

const appUrl = 'http://127.0.0.1:4173/daily-mini-games/games/0011_rhythm-factory/';
const activationWaitMs = 1800;
const expectedTrackUs = 24_000_000;
const stopAfterClockSamples = 10;
const restartClockSamples = 10;
const progressWaitMs = 45_000;

type TrialKind = 'natural' | 'stop-restart';

interface NativeSourceEvent {
  sourceId: number;
  kind: 'start' | 'stop' | 'ended';
  atMs: number;
  contextTime: number;
  active: number;
  startSec?: number;
  offsetSec?: number;
  durationSec?: number;
  bufferDurationSec?: number | null;
}

interface ClockReading {
  atMs: number;
  currentTime: number;
  raw: AudioTimestamp;
}

interface ClockRecord {
  sampleNumber: number;
  atMs: number;
  generation: number;
  raw: ClockReading | undefined;
  timestamp: OutputClockSample | undefined;
  signedDifferenceUs: number | null;
  result: Result<{ readonly differenceUs: Us }>;
}

interface TrialRecord {
  kind: TrialKind;
  status: string;
  done: boolean;
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
  a2arTrackCycle?: TrialRecord;
}

for (const kind of ['natural', 'stop-restart'] as const) {
  for (let run = 1; run <= 3; run++) {
    test(`A-2a-R CASE-05 ${kind} trial ${run}`, async ({ playwright, browserName, launchOptions }, info) => {
      test.setTimeout(60_000);
      const browser = await playwright[browserName].launch(launchOptions);
      try {
        const page = await browser.newPage();
        const requests: string[] = [];
        page.on('request', (request) => requests.push(request.url()));
        await page.goto(appUrl);

        await page.evaluate(async ({ url, kind, activationWaitMs, stopAfterClockSamples, restartClockSamples }) => {
          const { stageA2TrialMusic } = await import(url + 'src/content/stage-a2-trial.ts') as typeof import('../../src/content/stage-a2-trial');
          const { createWebAudio } = await import(url + 'src/infrastructure/web-audio.ts') as typeof import('../../src/infrastructure/web-audio');
          const { createFixedAudioClock, clockSampleIntervalMs, tickToUs } =
            await import(url + 'src/domain/audio-clock.ts') as typeof import('../../src/domain/audio-clock');
          const record: TrialRecord = {
            kind,
            status: 'preparing',
            done: false,
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
          (window as TrialWindow).a2arTrackCycle = record;

          const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
          let context: AudioContext | undefined;
          let nativeId = 0;
          const nativeActive = new Set<number>();
          const audio = createWebAudio(tickToUs, () => {
            const created = new AudioContext({ sampleRate: 48000 });
            context = created;
            // Record the native calls used by the adapter without changing their value or order.
            const readTimestamp = created.getOutputTimestamp.bind(created);
            created.getOutputTimestamp = () => {
              const raw = readTimestamp();
              record.rawClockReads.push({
                atMs: performance.now(), currentTime: created.currentTime,
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
                start(...args);
                nativeActive.add(sourceId);
                const [startSec = 0, offsetSec = 0, durationSec] = args;
                record.sourceEvents.push({
                  sourceId, kind: 'start', ...timing(), startSec, offsetSec,
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
          const original: Token = { requestId: 'a2ar-original', generation: 1, sessionId: 'a2ar-trial-cycle' };
          const replacement: Token = { ...original, requestId: 'a2ar-restart', generation: 2 };
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

          const track = await audio.renderMusic(stageA2TrialMusic, original);
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
              record.samples.push({
                generation: token.generation, sampleNumber: ++sampleNumber, atMs: performance.now(),
                raw, timestamp, signedDifferenceUs, result,
              });
              if (!result.ok) {
                audio.stop(token);
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

          const startButton = addButton('CASE-05 start', 'start', () => start(original));
          const stopButton = addButton('CASE-05 stop', 'stop', async () => {
            if (currentOwner !== original) { await finish('stop-owner-mismatch'); return; }
            currentOwner = null;
            audio.stop(original);
            captureResources('stopped-original');
            record.status = 'ready-to-restart';
            restartButton.disabled = false;
          });
          const restartButton = addButton('CASE-05 restart', 'restart', () => start(replacement));
          record.status = 'ready-to-start';
          startButton.disabled = false;
        }, { url: appUrl, kind, activationWaitMs, stopAfterClockSamples, restartClockSamples });

        let interactionFailure: string | undefined;
        try {
          const start = page.getByRole('button', { name: 'CASE-05 start' });
          if (await start.count()) await start.click();
          if (kind === 'stop-restart') {
            await page.waitForFunction(() => {
              const status = (window as TrialWindow).a2arTrackCycle;
              return status?.done || status?.status === 'ready-to-stop';
            }, undefined, { timeout: progressWaitMs });
            if (await page.evaluate(() => (window as TrialWindow).a2arTrackCycle?.status === 'ready-to-stop')) {
              await page.getByRole('button', { name: 'CASE-05 stop' }).click();
              await page.getByRole('button', { name: 'CASE-05 restart' }).click();
            }
          }
          await page.waitForFunction(() => (window as TrialWindow).a2arTrackCycle?.done, undefined, { timeout: progressWaitMs });
        } catch (error) {
          interactionFailure = String(error);
        }
        const result = await page.evaluate(() => (window as TrialWindow).a2arTrackCycle);
        const outgoing = requests.filter((request) => new URL(request).origin !== new URL(appUrl).origin);
        await info.attach('a2ar-case-05-raw', {
          body: JSON.stringify({ engine: browserName, version: browser.version(), kind, run, result, outgoing, interactionFailure }),
          contentType: 'application/json',
        });
        expect(interactionFailure).toBeUndefined();
        expect(result?.status).toBe(kind === 'natural' ? 'natural-completed' : 'restart-completed');
        if (!result) throw new Error('Missing CASE-05 evidence');

        expect(outgoing).toEqual([]);
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
