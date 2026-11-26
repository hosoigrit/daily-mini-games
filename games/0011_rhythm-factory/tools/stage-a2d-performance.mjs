/* global document, localStorage, performance, window */
import { execFile as execFileCallback } from 'node:child_process';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL, fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { chromium, firefox, webkit } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import {
  performanceReference, summarizeAudioSync, summarizeFrames, summarizeInputDelivery, summarizeResources, summarizeSamples,
} from './stage-a2d-performance-metrics.ts';

const execFile = promisify(execFileCallback);
const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const mount = '/daily-mini-games/games/0011_rhythm-factory/';
const keyboard = ['d', 'f', 'j', 'k'];
const diagnosticQuery = '?stage-a2d-diagnostics=1';
const saveKey = 'daily-mini-games.game0011.save.v1';
const bandwidth = Object.freeze({ downBps: 1_600_000, upBps: 750_000, latencyMs: 150 });
const labels = Object.freeze({
  entry: 'メニューへ',
  select: '曲を選ぶ',
  start: '演奏を始める',
  pause: '一時停止',
  resume: '再開',
  retry: 'リトライ',
});
const { values: flags } = parseArgs({
  options: {
    out: { type: 'string' }, browser: { type: 'string', default: 'chromium' },
    cycles: { type: 'string', default: String(performanceReference.lifecycleCycles) },
    'sample-ms': { type: 'string', default: '7500' }, 'build-dir': { type: 'string' },
  },
});
const browsers = { chromium, firefox, webkit };
const cycles = Number(flags.cycles);
const sampleMs = Number(flags['sample-ms']);
if (!flags.out || !Object.hasOwn(browsers, flags.browser)
  || !Number.isSafeInteger(cycles) || cycles < 0 || cycles > performanceReference.lifecycleCycles
  || !Number.isSafeInteger(sampleMs) || sampleMs <= performanceReference.frameWarmupMs || sampleMs > 20_000) {
  throw new Error('Usage: node tools/stage-a2d-performance.mjs --out <json> [--browser chromium|firefox|webkit] [--cycles 0..20] [--sample-ms 3001..20000] [--build-dir <dist>]');
}

async function serveProduction(buildDir) {
  const files = new Map();
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
  for (const entry of await readdir(buildDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(mount + relative(buildDir, path), { bytes: await readFile(path), type: mimeTypes[extname(path)] });
  }
  const server = createServer((request, response) => {
    const requested = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const file = files.get(requested === mount ? mount + 'index.html' : requested);
    if (!file || !['GET', 'HEAD'].includes(request.method)) return response.writeHead(404).end();
    response.writeHead(200, {
      'Content-Type': file.type ?? 'application/octet-stream',
      'Content-Length': file.bytes.length,
    });
    return response.end(request.method === 'HEAD' ? undefined : file.bytes);
  });
  server.listen(4195, '127.0.0.1');
  await once(server, 'listening');
  const assets = [...files].map(([path, { bytes }]) => ({
    path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  })).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { server, assets };
}

async function readIdealInputs() {
  const toolsServer = await createViteServer({ root: gameRoot, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { stageA2TrialChart } = await toolsServer.ssrLoadModule('/src/content/stage-a2b-trial-chart.ts');
    const { stageA2TrialMusic } = await toolsServer.ssrLoadModule('/src/content/stage-a2-trial.ts');
    const { compileChart, createChartMusicContext, buildIdealInputs } = await toolsServer.ssrLoadModule('/src/domain/chart-compiler.ts');
    const compilation = compileChart(stageA2TrialChart, createChartMusicContext(stageA2TrialMusic), 'complete');
    if (!compilation.ok) throw new Error(compilation.error.messageKey);
    return buildIdealInputs(compilation.value, { sessionId: 'observer-schedule', clockGeneration: 0 })
      .map(input => ({ atMs: input.songTimeUs / 1000, key: keyboard[input.lane - 1], action: input.action }));
  } finally {
    await toolsServer.close();
  }
}

async function openWindow(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    const records = { frame: [], clock: [], audio: [], input: [], prepare: [], resources: [] };
    window.__a2dPerformanceRecords = records;
    for (const type of Object.keys(records)) {
      window.addEventListener('stage-a2d:' + type, event => {
        records[type].push(event.detail);
      });
    }
  });
  const page = await context.newPage();
  const externalRequests = new Set();
  const errors = [];
  page.on('pageerror', error => errors.push({ kind: 'PAGE_ERROR', message: error.message }));
  page.on('request', request => {
    const address = new URL(request.url());
    if (address.protocol.match(/^https?:$/) && address.origin !== origin) externalRequests.add(address.origin + address.pathname);
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push({
      kind: 'HTTP_ERROR', path: new URL(response.url()).pathname, status: response.status(),
    });
  });
  return { context, page, errors, externalRequests };
}

const button = (page, label) => page.getByRole('button', { name: label, exact: true });
const state = (page, value) => page.locator(`main[data-state="${value}"]`);
async function waitInteractive(page, label, timeout = 20_000) {
  await page.waitForFunction(name => [...document.querySelectorAll('button')]
    .some(button => button.textContent?.trim() === name && !button.disabled && button.getAttribute('aria-disabled') !== 'true'),
  label, { timeout });
}
async function openMenu(page) {
  await page.goto(origin + mount + diagnosticQuery, { waitUntil: 'domcontentloaded' });
  if (!await button(page, labels.select).isVisible()) await button(page, labels.entry).click({ timeout: 10_000 });
  await waitInteractive(page, labels.select, 10_000);
}

const describeError = error => error instanceof Error ? error.message : String(error);

async function measureColdMenu(browser) {
  const { context, page, errors, externalRequests } = await openWindow(browser);
  try {
    const controlled = flags.browser === 'chromium';
    if (controlled) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: bandwidth.latencyMs, downloadThroughput: bandwidth.downBps / 8,
        uploadThroughput: bandwidth.upBps / 8,
      });
    }
    await openMenu(page);
    const navigation = await page.evaluate(() => {
      const resources = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')];
      return {
        elapsedMs: performance.now(),
        assets: resources.map(entry => ({
          path: new URL(entry.name).pathname, transferBytes: entry.transferSize,
          encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize,
        })),
      };
    });
    return {
      result: 'OBSERVED', coldContext: true, networkControl: controlled ? bandwidth : null,
      startupGate: 'navigationStart to enabled song-selection operation after entering the menu',
      serverCompression: 'HTTP identity', networkMethod: controlled ? 'Chromium CDP network emulation' : 'unthrottled trial only',
      errors, externalRequests: [...externalRequests], ...navigation,
    };
  } catch (error) {
    return { result: 'UNMEASURED', error: describeError(error), errors, externalRequests: [...externalRequests] };
  } finally {
    await context.close();
  }
}

function summarizeTelemetry(telemetry) {
  return {
    frames: summarizeFrames(telemetry.frame),
    input: summarizeInputDelivery(telemetry.input),
    audio: summarizeAudioSync(telemetry.audio),
    resources: summarizeResources(telemetry.resources),
  };
}

async function telemetryFor(page) {
  return page.evaluate(() => window.__a2dPerformanceRecords);
}

async function prepareTrack(page) {
  await openMenu(page);
  await button(page, labels.select).click();
  await waitInteractive(page, labels.start);
}

async function measureColdPreparation(browser) {
  const { context, page, errors, externalRequests } = await openWindow(browser);
  let error = null;
  let durationMs = null;
  try {
    await prepareTrack(page);
  } catch (failure) {
    error = describeError(failure);
  }
  try {
    const telemetry = await telemetryFor(page);
    const end = telemetry.prepare.find(event => event.phase === 'end');
    const start = end && telemetry.prepare.find(event => event.phase === 'start' && event.requestId === end.requestId);
    if (start && end && Number.isFinite(end.atMs - start.atMs) && end.atMs >= start.atMs) {
      durationMs = end.atMs - start.atMs;
    }
    return {
      result: durationMs === null ? 'UNMEASURED' : 'OBSERVED', coldContext: true,
      durationMs, error, prepare: telemetry.prepare, resources: summarizeResources(telemetry.resources),
      errors, externalRequests: [...externalRequests],
    };
  } finally {
    await context.close();
  }
}

async function startTrack(page) {
  await button(page, labels.start).click({ timeout: 10_000 });
  await state(page, 'PLAYING').waitFor({ timeout: 15_000 });
}

async function observeActivePlay(browser, inputs) {
  const { context, page, errors, externalRequests } = await openWindow(browser);
  let terminalError = null;
  let durationMs = null;
  let keysSent = 0;
  let completedWindow = false;
  try {
    await prepareTrack(page);
    await button(page, labels.start).click({ timeout: 10_000 });
    const activeClock = await page.waitForFunction(() => window.__a2dPerformanceRecords.clock
      .find(sample => ['PREROLL', 'PLAYING'].includes(sample.state) && Number.isFinite(sample.judgeTimeUs)),
    undefined, { timeout: 15_000 });
    const opened = await activeClock.jsonValue();
    const browserNow = await page.evaluate(() => performance.now());
    const startedAt = performance.now() - (browserNow - opened.atMs) - opened.judgeTimeUs / 1000;
    for (const input of inputs) {
      if (input.atMs > sampleMs) break;
      const remaining = input.atMs - (performance.now() - startedAt);
      if (remaining > 0) await delay(remaining);
      if (!await page.locator('main:is([data-state="PREROLL"], [data-state="PLAYING"])').count()) break;
      if (input.action === 'DOWN') await page.keyboard.down(input.key);
      else await page.keyboard.up(input.key);
      keysSent++;
    }
    const remaining = sampleMs - (performance.now() - startedAt);
    if (remaining > 0 && await state(page, 'PLAYING').count()) await delay(remaining);
    durationMs = performance.now() - startedAt;
    completedWindow = Boolean(await state(page, 'PLAYING').count()) && durationMs >= sampleMs - 10;
    if (!completedWindow) terminalError = 'PLAYING stopped before the observation completed';
  } catch (failure) {
    terminalError = describeError(failure);
  }
  try {
    const telemetry = await telemetryFor(page);
    return {
      result: completedWindow ? 'OBSERVED' : 'PARTIAL_OR_BLOCKED', sampleWindowMs: sampleMs,
      nominalInputMethod: 'trusted Playwright keyboard from the shipped trial chart',
      keysSent, durationMs, terminalError, errors, externalRequests: [...externalRequests],
      finalState: await page.locator('main').getAttribute('data-state', { timeout: 1000 }).catch(() => null),
      metrics: summarizeTelemetry(telemetry), telemetry,
    };
  } finally {
    await context.close();
  }
}

async function measureLifecycle(browser) {
  if (!cycles) return { result: 'NOT_RUN', completed: 0, requested: 0, trace: [] };
  const { context, page, errors, externalRequests } = await openWindow(browser);
  const trace = [];
  let completed = 0;
  let error = null;
  try {
    await prepareTrack(page);
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const item = { cycle, steps: [] };
      trace.push(item);
      await startTrack(page);
      item.generationBefore = await page.locator('main').getAttribute('data-generation');
      item.steps.push('PLAYING');
      await button(page, labels.pause).click({ timeout: 5000 });
      await state(page, 'PAUSED').waitFor({ timeout: 5000 });
      item.steps.push('PAUSED');
      await button(page, labels.resume).click({ timeout: 5000 });
      await state(page, 'PLAYING').waitFor({ timeout: 10_000 });
      item.generationAfter = await page.locator('main').getAttribute('data-generation');
      if (item.generationBefore === null || item.generationAfter === null
        || Number(item.generationAfter) <= Number(item.generationBefore)) throw new Error('Resume did not expose a new clock generation');
      item.steps.push('PLAYING_NEW_GENERATION');
      const outcome = page.locator('main:is([data-screen="RESULT"], [data-state="ERROR"])');
      await outcome.waitFor({ timeout: 15_000 });
      const terminal = await outcome.getAttribute('data-state');
      item.steps.push(terminal);
      if (terminal !== 'FAILED') {
        item.appError = await outcome.getAttribute('data-error');
        throw new Error('No-input playback did not reach FAILED; observed ' + terminal + ' ' + (item.appError ?? ''));
      }
      await button(page, labels.retry).click({ timeout: 5000 });
      await button(page, labels.start).waitFor({ timeout: 10_000 });
      item.steps.push('RETRY_READY');
      completed++;
    }
  } catch (failure) {
    error = describeError(failure);
  }
  try {
    const telemetry = await telemetryFor(page);
    const save = await page.evaluate(key => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return { revision: data.revision, failures: Object.values(data.records).map(record => record.failed?.failureCount ?? 0) };
    }, saveKey).catch(() => null);
    const measured = summarizeResources(telemetry.resources);
    const expectedFailureCount = completed;
    const observedFailureCount = save?.failures.reduce((total, failures) => total + failures, 0) ?? null;
    return {
      result: completed === cycles ? 'OBSERVED' : 'PARTIAL_OR_BLOCKED', completed, requested: cycles,
      expectedFailureCount, observedFailureCount,
      saveExactlyOnce: observedFailureCount === null ? 'UNMEASURED' : observedFailureCount === expectedFailureCount,
      trace, error, errors, externalRequests: [...externalRequests], save, resources: measured,
      resourceTimeline: telemetry.resources,
      audioClock: summarizeAudioSync(telemetry.audio),
      listenerAndAnimationLoopCountsAvailable: measured.activeListeners.sampleCount > 0 && measured.activeRafLoops.sampleCount > 0,
    };
  } finally {
    await context.close();
  }
}

const origin = 'http://127.0.0.1:4195';
const work = await mkdtemp(join(tmpdir(), 'rhythm-factory-a2d-perf-'));
let server;
let browser;
const output = resolve(flags.out);
const report = {
  reference: performanceReference,
  scope: 'Stage A-2d integrated production build on Playwright-managed desktop headless emulation',
  interpretation: 'WITHIN_REFERENCE applies only to observed local browser data and does not approve a physical device or formal track.',
  quantiles: 'P95/P99 nearest rank (ceil(q*N), one-indexed); median averages the two middle samples for even N',
  playbackFixture: '24-second 回転灯 technical trial',
  longFixture84Seconds: { status: 'NOT_RUN', reason: 'Run stage-a2d-long-fixture.mjs separately; the fixture is excluded from the production build.' },
  totalMemory: { status: 'UNMEASURED', reason: 'The tool does not sample total process or device memory.' },
  browser: flags.browser,
  audioEnvironment: process.env.PULSE_SERVER ? 'explicit PulseAudio environment' : 'browser default environment',
  nodeVersion: process.version,
  coldMenu: [], coldPreparation: [], playback: [], lifecycle: null,
};
try {
  const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: gameRoot });
  report.commit = stdout.trim();
  const { stdout: gitStatus } = await execFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: gameRoot });
  report.workingTreeDirty = gitStatus.length > 0;
  const buildDir = flags['build-dir'] ? resolve(flags['build-dir']) : join(work, 'dist');
  if (!flags['build-dir']) {
    const build = await execFile(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', buildDir], { cwd: gameRoot });
    report.buildOutput = build.stdout;
  }
  report.build = flags['build-dir'] ? 'caller-supplied dist; verify identity separately' : 'vite production build with approved relative base';
  const served = await serveProduction(buildDir);
  server = served.server;
  report.buildAssets = served.assets;
  const launcher = flags.browser === 'webkit' ? process.env.STAGE_A1_WEBKIT_EXECUTABLE : undefined;
  browser = await browsers[flags.browser].launch(launcher ? { executablePath: launcher } : {});
  report.browserVersion = browser.version();
  const idealInputs = await readIdealInputs();
  for (let trial = 1; trial <= performanceReference.coldGenerationTrials; trial++) {
    report.coldMenu.push({ trial, ...await measureColdMenu(browser) });
    report.coldPreparation.push({ trial, ...await measureColdPreparation(browser) });
    report.playback.push({ trial, ...await observeActivePlay(browser, idealInputs) });
    log(`A-2d ${flags.browser} ${trial}/${performanceReference.coldGenerationTrials} observations recorded`);
  }
  report.lifecycle = await measureLifecycle(browser);
} catch (error) {
  report.error = describeError(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server?.listening) {
    server.close();
    await once(server, 'close');
  }
  await rm(work, { recursive: true, force: true });
  const coldMenuMs = summarizeSamples(report.coldMenu.flatMap(trial =>
    trial.networkControl && Number.isFinite(trial.elapsedMs) ? [trial.elapsedMs] : []));
  const coldPreparationMs = summarizeSamples(report.coldPreparation.flatMap(trial => trial.durationMs === null ? [] : [trial.durationMs]));
  const initialTransferBytes = summarizeSamples(report.coldMenu.flatMap(trial =>
    trial.assets?.length ? [trial.assets.reduce((sum, asset) => sum + asset.transferBytes, 0)] : []));
  report.aggregate = {
    coldMenuMs, coldMenuStatus: coldMenuMs.sampleCount < 3 ? 'UNMEASURED'
      : coldMenuMs.median <= performanceReference.maximumColdMenuMedianMs ? 'WITHIN_REFERENCE' : 'OUTSIDE_REFERENCE',
    coldPreparationMs, coldPreparationStatus: coldPreparationMs.sampleCount < 3 ? 'UNMEASURED'
      : coldPreparationMs.median <= performanceReference.maximumColdGenerationMedianMs
         && coldPreparationMs.maximum <= performanceReference.maximumColdGenerationMs ? 'WITHIN_REFERENCE' : 'OUTSIDE_REFERENCE',
    initialTransferBytes,
    initialTransferStatus: initialTransferBytes.sampleCount < 3 ? 'UNMEASURED'
      : initialTransferBytes.maximum <= performanceReference.maximumInitialTransferBytes ? 'WITHIN_REFERENCE' : 'OUTSIDE_REFERENCE',
    exceedsInternalTransferBudget: initialTransferBytes.maximum === null ? null
      : initialTransferBytes.maximum > performanceReference.internalTransferBudgetBytes,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  log(output);
}
