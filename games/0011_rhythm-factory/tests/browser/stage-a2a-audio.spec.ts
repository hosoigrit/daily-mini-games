import { expect, test } from '@playwright/test';
import type { Sec, Token, Us } from '../../src/contracts/interface_contracts';

const appUrl = 'http://127.0.0.1:4173/daily-mini-games/games/0011_rhythm-factory/';

test('A-2a / POC-01: renders the original QA track and measures four SFX voices', async ({ page, browser }, info) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(appUrl);
  const result = await page.evaluate(async (url) => {
    const entry = await import(url + 'src/content/stage-a2-trial.ts') as typeof import('../../src/content/stage-a2-trial');
    const renderer = await import(url + 'src/infrastructure/offline-music.ts') as typeof import('../../src/infrastructure/offline-music');
    const clock = await import(url + 'src/domain/audio-clock.ts') as typeof import('../../src/domain/audio-clock');
    const sfx = await import(url + 'src/infrastructure/sfx.ts') as typeof import('../../src/infrastructure/sfx');

    const analyze = (buffer: AudioBuffer) => {
      let peak = 0;
      let nonfinite = 0;
      let lastFrameOverNoiseFloor = 0;
      const blocks = new Set<number>();
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let frame = 0; frame < samples.length; frame++) {
          const sample = samples[frame]!;
          if (!Number.isFinite(sample)) nonfinite++;
          peak = Math.max(peak, Math.abs(sample));
          if (Math.abs(sample) > 0.0001) {
            lastFrameOverNoiseFloor = Math.max(lastFrameOverNoiseFloor, frame);
            blocks.add(Math.floor(frame / 24_000));
          }
        }
      }
      return { peak, nonfinite, lastFrameOverNoiseFloor, audibleHalfSecondBlocks: blocks.size };
    };

    const times = [];
    const { buffer, durationUs } = await renderer.renderMusicBuffer(entry.stageA2TrialMusic, clock.tickToUs);
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      await renderer.renderMusicBuffer(entry.stageA2TrialMusic, clock.tickToUs);
      times.push(performance.now() - started);
    }
    const makeMix = async (voices: number, background: boolean) => {
      const mix = new OfflineAudioContext(2, 4800, 48000);
      if (background) {
        const music = mix.createBufferSource();
        music.buffer = buffer;
        music.connect(mix.destination);
        music.start(0);
      }
      for (let voice = 0; voice < voices; voice++) sfx.scheduleTick(mix, mix.destination);
      return analyze(await mix.startRendering());
    };
    const verifyInvalid = async (kind: 'missing-instrument' | 'duplicate-event') => {
      const events = [...entry.stageA2TrialMusic.events];
      const first = events[0]!;
      if (kind === 'missing-instrument') events[0] = { ...first, instrumentId: 'missing' };
      else events.push(first);
      try {
        await renderer.renderMusicBuffer({ ...entry.stageA2TrialMusic, events }, clock.tickToUs);
        return false;
      } catch (error) {
        return error instanceof renderer.InvalidMusicDefinition;
      }
    };
    return {
      length: buffer.length, rate: buffer.sampleRate, channels: buffer.numberOfChannels,
      float32: buffer.getChannelData(0) instanceof Float32Array, durationUs,
      bytes: buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
      music: analyze(buffer), singleSfx: await makeMix(1, false),
      fourSfx: await makeMix(4, false), mix: await makeMix(4, true),
      renderMs: times,
      invalid: await Promise.all([verifyInvalid('missing-instrument'), verifyInvalid('duplicate-event')]),
    };
  }, appUrl);

  const outgoing = requests.filter((url) => new URL(url).origin !== new URL(appUrl).origin);
  await info.attach('audio-render-result', { body: JSON.stringify({ ...result, version: browser.version(), outgoing }), contentType: 'application/json' });
  expect(result).toMatchObject({ length: 1_152_000, rate: 48_000, channels: 2, durationUs: 24_000_000, float32: true, bytes: 9_216_000, invalid: [true, true] });
  expect(result.music.nonfinite + result.mix.nonfinite).toBe(0);
  expect(result.music.audibleHalfSecondBlocks).toBeGreaterThanOrEqual(47);
  expect(result.music.lastFrameOverNoiseFloor).toBeLessThan(1_152_000 - 2400);
  expect(result.music.peak).toBeGreaterThan(0.01);
  expect(result.music.peak).toBeLessThanOrEqual(10 ** (-3 / 20));
  expect(result.singleSfx.peak).toBeGreaterThan(0.01);
  expect(result.singleSfx.peak).toBeLessThanOrEqual(0.0625);
  expect(result.fourSfx.peak).toBeLessThanOrEqual(0.25);
  expect(result.mix.peak).toBeLessThanOrEqual(10 ** (-3 / 20) + 0.25);
  expect([...result.renderMs].sort((a, b) => a - b)[1]).toBeLessThanOrEqual(5000);
  expect(Math.max(...result.renderMs)).toBeLessThanOrEqual(10000);
  expect(outgoing).toEqual([]);
});

test('A-2a / POC-02: real output clock stays within the approved fixed-anchor bound', async ({ page, browser }, info) => {
  let finish!: (value: unknown) => void;
  const capture = new Promise((resolve) => { finish = resolve; });
  await page.exposeFunction('recordA2AudioOutput', finish);
  await page.goto(appUrl);
  await page.evaluate(async (url) => {
    const { stageA2TrialMusic } = await import(url + 'src/content/stage-a2-trial.ts') as typeof import('../../src/content/stage-a2-trial');
    const { createWebAudio } = await import(url + 'src/infrastructure/web-audio.ts') as typeof import('../../src/infrastructure/web-audio');
    const clockModule = await import(url + 'src/domain/audio-clock.ts') as typeof import('../../src/domain/audio-clock');
    const report = Reflect.get(window, 'recordA2AudioOutput') as (value: unknown) => Promise<void>;
    let context: AudioContext | undefined;
    const audio = createWebAudio(clockModule.tickToUs, () => {
      context = new AudioContext({ sampleRate: 48000 });
      return context;
    });
    const token: Token = { requestId: 'live-proof', generation: 1, sessionId: 'a2a-live-proof' };
    const track = await audio.renderMusic(stageA2TrialMusic, token);
    if (!track.ok) { await report({ status: 'preparation-failed', error: track.error }); return; }

    const button = document.createElement('button');
    button.textContent = 'A-2a 出力時計検証';
    document.body.append(button);
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    button.addEventListener('click', () => {
      void (async () => {
        // The test bounds waiting for evidence. This is not a product initialization timeout.
        const activation = await Promise.race([audio.enable(), wait(1800).then(() => null)]);
        if (!activation?.ok) {
          await report({ status: 'activation-unavailable', contextState: context?.state,
            currentTime: context?.currentTime, timestamp: context?.getOutputTimestamp() });
          void audio.dispose().catch(() => {});
          return;
        }
        for (let i = 0; i < 8 && !audio.outputTimestamp(); i++) await wait(100);
        const currentTime = audio.currentTime();
        const anchor = audio.playAt(track.value, 0 as Us, ((currentTime ?? 0) + 0.05) as Sec, token);
        if (!anchor.ok) {
          await report({ status: 'anchor-unavailable', error: anchor.error, timestamp: context?.getOutputTimestamp() });
          await audio.dispose();
          return;
        }
        const clock = clockModule.createFixedAudioClock(anchor.value, 0 as Us);
        if (!clock.ok) { await report({ status: 'invalid-anchor', error: clock.error }); await audio.dispose(); return; }
        const results = [];
        const lifecycle: unknown[] = [];
        const unsubscribe = audio.subscribeAudioEvents((event) => lifecycle.push(event));
        audio.setVolume('MUSIC', 100);
        audio.setVolume('SFX', 100);
        for (let i = 0; i < 5; i++) audio.playTick();
        const peakVoices = audio.diagnostics().voices;
        for (let index = 0; index < 12; index++) {
          await wait(clockModule.clockSampleIntervalMs);
          const timestamp = audio.outputTimestamp();
          const observation = clock.value.observe(timestamp);
          results.push({ timestamp, now: performance.now(), observation });
          if (!observation.ok) {
            audio.stop(token);
            await report({ status: 'safety-stop', anchor: anchor.value, peakVoices,
              results, stopped: audio.diagnostics().sources === 0 });
            unsubscribe();
            await audio.dispose();
            return;
          }
        }
        const replay = audio.playAt(
          track.value, 0 as Us, ((audio.currentTime() ?? 0) + 0.05) as Sec,
          { ...token, requestId: 'new-playback', generation: 2 },
        );
        await wait(80);
        audio.stop(token);
        const staleStopIgnored = audio.diagnostics().sources === 1;
        unsubscribe();
        await audio.dispose();
        await report({ status: 'running', anchor: anchor.value, peakVoices, results, lifecycle,
          staleStopIgnored, replay, disposed: audio.diagnostics() });
      })().catch((error: unknown) => report({ status: 'probe-error', error: String(error) }));
    }, { once: true });
  }, appUrl);
  await page.getByRole('button', { name: 'A-2a 出力時計検証' }).click();
  const result = await capture;
  await info.attach('output-clock-result', { body: JSON.stringify({ version: browser.version(), result }), contentType: 'application/json' });
  expect(result).toMatchObject({
    status: 'running', peakVoices: 4, staleStopIgnored: true, lifecycle: [],
    replay: { ok: true, value: { generation: 2 } },
    disposed: { cached: 0, sources: 0, voices: 0 },
  });
});
