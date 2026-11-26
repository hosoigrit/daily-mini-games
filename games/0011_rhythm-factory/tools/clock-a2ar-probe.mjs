/* global AudioContext, OfflineAudioContext, document, navigator, performance, window */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { log } from 'node:console';
import process from 'node:process';
import { chromium, firefox, webkit } from '@playwright/test';

const [output] = process.argv.slice(2);
if (!output) throw new Error('Specify a scratch JSON output path');
const server = createServer((_, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Web Audio probe</title><button>音声を開始</button></html>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
const profiles = [
  { engine: chromium, version: '159.0.8154.6', launcher: 'Playwright-managed headless Chromium' },
  { engine: firefox, version: '159.0', launcher: 'Playwright-managed headless Firefox with approved A-1 local launch environment' },
  { engine: webkit, version: '27.2', launcher: 'Playwright-managed headless WebKit WPE with approved A-1 wrapper' },
];
if (!process.env.STAGE_A1_WEBKIT_EXECUTABLE) throw new Error('Use the approved Stage A-1 WebKit wrapper');
const caseDefinitions = [
  { id: 'CASE-01', signal: 'none', sequence: 'resume-first' },
  { id: 'CASE-02', signal: 'oscillator', sequence: 'resume-first' },
  { id: 'CASE-02', signal: 'oscillator', sequence: 'connect-first' },
  { id: 'CASE-03', signal: 'buffer', sequence: 'prepared-before-click' },
  { id: 'CASE-04', signal: 'timestamp', sequence: 'scheduled-after-anchor' },
];

async function runCase(browser, definition) {
  const page = await browser.newPage();
  const diagnostics = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) diagnostics.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', text: error.message }));
  const startedAt = new Date().toISOString();
  try {
    await page.goto(url, { timeout: 5000 });
    await page.evaluate(async (definition) => {
      const missing = 'UNAVAILABLE';
      const clockMs = 100;
      const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const hasFixture = definition.signal === 'buffer' || definition.signal === 'timestamp';
      let fixture;
      if (hasFixture) {
        const offline = new OfflineAudioContext(2, 14_400, 48_000);
        const oscillator = offline.createOscillator();
        const gain = offline.createGain();
        oscillator.frequency.value = 440;
        gain.gain.value = 0.007;
        oscillator.connect(gain).connect(offline.destination);
        oscillator.start(0);
        oscillator.stop(0.3);
        fixture = await offline.startRendering();
      }
      document.querySelector('button').addEventListener('click', (event) => {
        const log = {
          trusted: event.isTrusted,
          activation: { active: navigator.userActivation?.isActive ?? missing, ever: navigator.userActivation?.hasBeenActive ?? missing },
          preparedBeforeGesture: Boolean(fixture),
          timeOrigin: performance.timeOrigin ?? missing,
          clickAtMs: performance.now(),
          stateChanges: [],
          samples: [],
          resume: { status: 'pending' },
          anchor: null,
          exceptions: [],
        };
        let context;
        let source;
        let volume;
        let started = false;
        const snapshot = () => {
          let stamp = {};
          try {
            stamp = context.getOutputTimestamp?.() ?? {};
          } catch (error) {
            log.exceptions.push(String(error));
          }
          const serialize = (value) => typeof value !== 'number' ? missing : Number.isFinite(value) ? value : String(value);
          return {
            atMs: performance.now(),
            state: context.state,
            currentTime: serialize(context.currentTime),
            contextTime: serialize(stamp.contextTime),
            performanceTime: serialize(stamp.performanceTime),
            baseLatency: serialize(context.baseLatency),
            outputLatency: serialize(context.outputLatency),
            sampleRate: serialize(context.sampleRate),
            backend: missing,
          };
        };
        const prepareSignal = () => {
          if (definition.signal === 'none') return;
          volume = context.createGain();
          volume.gain.value = definition.signal === 'oscillator' ? 0.007 : 1;
          source = fixture ? context.createBufferSource() : context.createOscillator();
          if (fixture) source.buffer = fixture;
          source.connect(volume).connect(context.destination);
          source.addEventListener('ended', () => { log.endedAtMs = performance.now(); }, { once: true });
        };
        const startSignal = (scheduledSec) => {
          if (!source) return;
          log.sourceStartScheduledSec = scheduledSec;
          source.start(scheduledSec);
          if (!fixture) source.stop(scheduledSec + 0.25);
          started = true;
        };
        const run = async () => {
          try {
            context = new AudioContext({ sampleRate: 48_000 });
            log.constructedAtMs = performance.now();
            context.addEventListener('statechange', () => {
              log.stateChanges.push({ atMs: performance.now(), state: context.state });
            });
            log.samples.push({ phase: 'constructed', ...snapshot() });
            if (definition.sequence === 'connect-first') prepareSignal();
            log.resume.calledAtMs = performance.now();
            log.resume.activationAtCall = navigator.userActivation?.isActive ?? missing;
            void context.resume().then(
              () => { log.resume.status = 'fulfilled'; log.resume.settledAtMs = performance.now(); },
              (error) => { log.resume.status = 'rejected'; log.resume.settledAtMs = performance.now(); log.resume.error = String(error); },
            );
            if (definition.sequence !== 'connect-first') prepareSignal();
            if (definition.signal !== 'timestamp') startSignal(context.currentTime);

            // A finite harness window; no product startup timeout.
            for (let index = 0; index < 16; index++) {
              await delay(clockMs);
              const reading = snapshot();
              const record = { phase: 'observe', ...reading };
              if (definition.signal === 'timestamp') {
                if (log.anchor === null && reading.state === 'running' && reading.currentTime > 0
                    && reading.contextTime > 0 && reading.performanceTime > 0
                    && Number.isFinite(reading.contextTime) && Number.isFinite(reading.performanceTime)) {
                  log.anchor = { contextTime: reading.contextTime, performanceTime: reading.performanceTime, atMs: reading.atMs };
                  startSignal(context.currentTime + 0.175);
                } else if (log.anchor !== null && Number.isFinite(reading.contextTime) && Number.isFinite(reading.performanceTime)) {
                  record.predictedContextTime = log.anchor.contextTime + (reading.performanceTime - log.anchor.performanceTime) / 1000;
                  record.differenceMs = Math.abs(reading.contextTime - record.predictedContextTime) * 1000;
                  if (record.differenceMs > 20 && log.firstExceeded === undefined) {
                    log.firstExceeded = { index, ...record };
                    if (started && log.endedAtMs === undefined) source.stop();
                  }
                }
              }
              log.samples.push(record);
            }
            log.resumeAtCutoff = { ...log.resume };
            log.finalAtCutoff = snapshot();
          } catch (error) {
            log.exceptions.push(String(error));
          } finally {
            source?.disconnect();
            volume?.disconnect();
            if (context && context.state !== 'closed') {
              try {
                log.close = await Promise.race([context.close().then(() => 'fulfilled'), delay(1200).then(() => 'pending')]);
              } catch (error) {
                log.close = String(error);
              }
              log.finalState = context.state;
            }
          }
          return log;
        };
        window.a2arProbe = run();
      }, { once: true });
    }, definition);
    await page.getByRole('button', { name: '音声を開始' }).click();
    const log = await page.evaluate(() => window.a2arProbe);
    return { ...definition, startedAt, ...log, diagnostics };
  } finally {
    await page.close();
  }
}

const results = [];
try {
  for (const { engine, version, launcher } of profiles) {
    for (let trial = 1; trial <= 3; trial++) {
      const browser = await engine.launch({ headless: true, timeout: 10000, ...(engine === webkit ? { executablePath: process.env.STAGE_A1_WEBKIT_EXECUTABLE } : {}) });
      try {
        if (browser.version() !== version) throw new Error(`${engine.name()} version ${browser.version()} differs from ${version}`);
        const cases = [];
        for (const definition of caseDefinitions) cases.push(await runCase(browser, definition));
        results.push({ browser: engine.name(), version, mode: 'headless', launcher, trial, cases });
        await writeFile(output, JSON.stringify({ observations: results, condition: 'Loopback, real trusted input, fresh browser processes, 100 ms, 20 ms, application code not loaded' }, null, 2) + '\n');
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  server.close();
}
const os = await readFile('/etc/os-release', 'utf8');
log(`Completed ${results.length} independent browser launches on ${os.match(/^PRETTY_NAME=(.*)$/m)?.[1] ?? 'Linux'}`);
