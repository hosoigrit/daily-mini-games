import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import type { Gen, SaveDataV1 } from '../../src/contracts/interface_contracts';
import { buildIdealInputs, compileChart, createChartMusicContext } from '../../src/domain/chart-compiler';

const mount = '/daily-mini-games/games/0011_rhythm-factory/';
const saveKey = 'daily-mini-games.game0011.save.v1';
const lockName = 'daily-mini-games.game0011.writer';
const modes = [{ name: 'dev', port: 4173 }, { name: 'dist', port: 4174 }] as const;
const viewports = [
  { width: 320, height: 568 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;
const keys = ['d', 'f', 'j', 'k'] as const;
const compiled = compileChart(stageA2TrialChart, createChartMusicContext(stageA2TrialMusic), 'complete');
if (!compiled.ok) throw new Error('The fixed Stage A-2 trial chart no longer compiles.');
const ideal = buildIdealInputs(compiled.value, { sessionId: 'playwright-schedule-only', clockGeneration: 1 as Gen });
const totalJudgements = compiled.value.totalJudgements;

const application = (page: Page) => page.locator('main[data-screen]');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function open(page: Page, url: string): Promise<void> {
  expect([200, 304]).toContain((await page.goto(url))?.status());
  await expect(application(page)).toHaveAttribute('data-screen', 'TITLE');
  await button(page, 'メニューへ').click();
  await expect(application(page)).toHaveAttribute('data-screen', 'MENU');
}

async function openSelection(page: Page): Promise<void> {
  await button(page, '曲を選ぶ').click();
  await expect(application(page)).toHaveAttribute('data-screen', 'MUSIC_SELECT');
}

async function beginPlayback(page: Page, url: string): Promise<void> {
  await open(page, url);
  await expect(application(page)).toHaveAttribute('data-writer', 'OWNED');
  await openSelection(page);
  await button(page, '音源を準備').click();
  const start = button(page, '演奏を始める');
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
}

async function startNative(page: Page, url: string): Promise<void> {
  await beginPlayback(page, url);
  await expect(application(page)).toHaveAttribute('data-state', 'PLAYING', { timeout: 12_000 });
}

async function readSave(page: Page): Promise<SaveDataV1 | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw) as SaveDataV1;
  }, saveKey);
}

async function observeNativeTrial(page: Page, info: TestInfo): Promise<() => Promise<void>> {
  const issues: { type: string; message: string }[] = [];
  const requests = new Set<string>();
  page.on('request', (request) => requests.add(request.url()));
  page.on('pageerror', (error) => issues.push({ type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      issues.push({ type: message.type(), message: message.text() });
    }
  });
  // Records the public UI transition stream without modifying browser audio or the game clock.
  await page.addInitScript(() => {
    const events: Readonly<Record<string, string | number | null>>[] = [];
    let previous = '';
    const observer = new MutationObserver(() => {
      const root = document.querySelector('main[data-screen]');
      if (!root) return;
      const state = {
        screen: root.getAttribute('data-screen'),
        state: root.getAttribute('data-state'),
        writer: root.getAttribute('data-writer'),
        generation: root.getAttribute('data-generation'),
        saveStatus: root.getAttribute('data-save-status'),
        error: root.getAttribute('data-error'),
      };
      const key = JSON.stringify(state);
      if (key === previous) return;
      previous = key;
      events.push({ performanceMs: performance.now(), ...state });
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-screen', 'data-state', 'data-writer', 'data-generation', 'data-save-status', 'data-error'] });
    Object.defineProperty(window, 'a2dE2eTransitions', { value: events });
    const diagnostics: { kind: string; detail: unknown }[] = [];
    for (const kind of ['clock', 'audio', 'input', 'prepare', 'resources']) {
      window.addEventListener(`stage-a2d:${kind}`, (event) => {
        diagnostics.push({ kind, detail: (event as CustomEvent<unknown>).detail });
      });
    }
    document.addEventListener('pointerdown', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-lane]') : null;
      if (button) diagnostics.push({ kind: 'dom-pointer', detail: {
        lane: Number(button.getAttribute('data-lane')), pointerType: event.pointerType, trusted: event.isTrusted,
      } });
    }, true);
    for (const type of ['keydown', 'keyup'] as const) {
      document.addEventListener(type, (event) => {
        diagnostics.push({ kind: 'dom-key', detail: { type, code: event.code, trusted: event.isTrusted, timestamp: event.timeStamp } });
      }, true);
    }
    document.addEventListener('visibilitychange', () => {
      diagnostics.push({ kind: 'visibility', detail: { atMs: performance.now(), state: document.visibilityState } });
    });
    Object.defineProperty(window, 'a2dE2eDiagnostics', { value: diagnostics });
  });
  return async () => {
    const data = await page.evaluate(() => ({
      transitions: Reflect.get(window, 'a2dE2eTransitions') as unknown,
      diagnostics: Reflect.get(window, 'a2dE2eDiagnostics') as unknown,
    }));
    await info.attach('audio-ui-transitions', { body: JSON.stringify({ ...data, issues, requests: [...requests] }), contentType: 'application/json' });
    const scope = new URL(mount, page.url()).href;
    expect([...requests].every(request => request.startsWith(scope))).toBe(true);
  };
}

async function scheduleTrustedKeys(page: Page): Promise<void> {
  const firstClock = await page.waitForFunction(() => {
    const diagnostics = Reflect.get(window, 'a2dE2eDiagnostics') as readonly {
      kind: string;
      detail: { atMs: number; judgeTimeUs: number | null; state: string };
    }[];
    const tick = diagnostics.find(({ kind, detail }) => kind === 'clock' && detail.judgeTimeUs !== null
      && ['PREROLL', 'PLAYING'].includes(detail.state));
    if (!tick || tick.detail.judgeTimeUs === null) return false;
    return performance.timeOrigin + tick.detail.atMs - tick.detail.judgeTimeUs / 1000;
  }, undefined, { timeout: 12_000 });
  const judgeZeroEpochMs = await firstClock.jsonValue();
  if (judgeZeroEpochMs === false) throw new Error('No active judgement clock.');
  for (const input of ideal) {
    const delay = judgeZeroEpochMs + input.judgeTimeUs / 1000 - Date.now();
    // The chart defines intended button times; Chromium generates the trusted events and their timestamps.
    if (delay > 0) await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
    const key = keys[input.lane - 1]!;
    if (input.action === 'DOWN') await page.keyboard.down(key);
    else await page.keyboard.up(key);
  }
}

async function installOutputClockFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const origin = new WeakMap<AudioContext, { context: number; performance: number }>();
    // Use native synthesis, source nodes and user activation. Replace just the output timestamp pair.
    Object.defineProperty(AudioContext.prototype, 'getOutputTimestamp', {
      configurable: true,
      value(this: AudioContext): AudioTimestamp {
        if (this.state !== 'running' || this.currentTime <= 0) return {};
        const at = performance.now();
        let first = origin.get(this);
        if (!first) {
          first = { context: this.currentTime, performance: at };
          origin.set(this, first);
        }
        return { contextTime: first.context + (at - first.performance) / 1000, performanceTime: at };
      },
    });
  });
}

async function expectPerfectSave(page: Page, info: TestInfo): Promise<void> {
  await expect(application(page)).toHaveAttribute('data-screen', 'RESULT', { timeout: 6_000 });
  await expect(page.getByRole('heading', { name: 'CLEAR', exact: true })).toBeVisible();
  await expect(application(page)).toHaveAttribute('data-save-status', 'SAVED');
  const saved = await readSave(page);
  await info.attach('clear-save-readback', { body: JSON.stringify(saved), contentType: 'application/json' });
  expect(saved).toMatchObject({ revision: 1,
    records: { 'CHART-01-H': { clear: { bestScore: 1_000_000, clearCount: 1,
      fullComboAchieved: true, allPerfectAchieved: true,
      bestScoreResult: { counts: { perfect: totalJudgements,
        great: 0, good: 0, miss: 0, unplayed: 0, ghost: 0 } },
    }, failed: null } },
  });
}

for (const { name, port } of modes) {
  const url = `http://127.0.0.1:${port}${mount}`;

  test(`Stage A-2d / ${name}: product subpath, responsive routes and local resources`, async ({ page, browser }, info) => {
    const failures: string[] = [];
    const requests = new Set<string>();
    const sockets = new Set<string>();
    const assets = new Set<string>();
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('request', (request) => requests.add(request.url()));
    page.on('websocket', (socket) => {
      const connection = new URL(socket.url());
      sockets.add(connection.origin + connection.pathname);
    });
    page.on('requestfailed', (request) => failures.push(`${request.url()} ${request.failure()?.errorText}`));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
      if (['script', 'stylesheet'].includes(response.request().resourceType())) assets.add(response.url());
    });
    info.annotations.push({ type: 'browser version', description: browser.version() });

    await open(page, url);
    await openSelection(page);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight],
        scrollWidth: document.documentElement.scrollWidth,
        controls: Array.from(document.querySelectorAll('main button'), (node) => {
          const { width, height } = node.getBoundingClientRect();
          return { label: (node.textContent ?? '').trim(), width, height };
        }),
      }));
      expect(layout.viewport).toEqual([viewport.width, viewport.height]);
      expect(layout.scrollWidth).toBeLessThanOrEqual(viewport.width);
      expect(layout.controls.some(control => control.label === '音源を準備')).toBe(true);
      for (const control of layout.controls) {
        expect(control.width, control.label).toBeGreaterThanOrEqual(44);
        expect(control.height, control.label).toBeGreaterThanOrEqual(44);
      }
      await info.attach(`viewport-${viewport.width}x${viewport.height}`, { body: JSON.stringify(layout), contentType: 'application/json' });
      await info.attach(`selection-${viewport.width}x${viewport.height}`, { body: await page.screenshot(), contentType: 'image/png' });
    }

    expect(assets.size).toBeGreaterThan(0);
    expect([...assets].every(asset => asset.startsWith(url))).toBe(true);
    expect([...requests].every(request => request.startsWith(url))).toBe(true);
    expect([...sockets].every(socket => socket.startsWith(`ws://127.0.0.1:${port}/`))).toBe(true);
    if (name === 'dist') {
      expect(sockets.size).toBe(0);
      expect([...assets].some(asset => /\/assets\/[^/]+\.js$/.test(asset))).toBe(true);
      expect([...assets].some(asset => /\/assets\/[^/]+\.css$/.test(asset))).toBe(true);
      expect((await page.request.get(`http://127.0.0.1:${port}/`)).status()).toBe(404);
      expect((await page.request.get(`${url}missing.js`)).status()).toBe(404);
    }
    await info.attach('product-request-inventory', {
      body: JSON.stringify({ assets: [...assets], requests: [...requests], sockets: [...sockets], failures }), contentType: 'application/json',
    });
    expect(failures).toEqual([]);
  });

  test(`Stage A-2d / ${name}: native Web Locks and LocalStorage enforce the integrated writer gates`, async ({ page, context }, info) => {
    await open(page, url);
    await expect(application(page)).toHaveAttribute('data-writer', 'OWNED');
    await button(page, '設定').click();
    await expect(application(page)).toHaveAttribute('data-screen', 'SETTINGS');
    const ownerStart = await readSave(page);
    expect(ownerStart).toMatchObject({ schemaVersion: 1, revision: 0 });
    await page.evaluate(() => localStorage.setItem('a2d-unrelated-sentinel', 'unchanged'));

    const viewer = await context.newPage();
    await open(viewer, url);
    await expect(application(viewer)).toHaveAttribute('data-writer', 'UNOWNED');
    await openSelection(viewer);
    await button(viewer, '音源を準備').click();
    await expect(button(viewer, '試聴する')).toBeEnabled({ timeout: 20_000 });
    await expect(button(viewer, '演奏を始める')).toBeDisabled();
    await expect.poll(() => viewer.evaluate(async target => (await navigator.locks.query()).held?.filter(lock => lock.name === target).length,
      lockName)).toBe(1);
    await button(viewer, 'メニューへ').click();
    await button(viewer, '設定').click();
    await expect(button(viewer, '設定を保存')).toBeDisabled();
    await expect(button(viewer, 'タイミング補正を測る')).toBeDisabled();
    await expect(button(viewer, '進捗を初期化')).toBeDisabled();

    await page.bringToFront();
    await page.getByLabel('音楽の音量', { exact: true }).fill('31');
    await button(page, '設定を保存').click();
    await expect.poll(() => readSave(viewer)).toMatchObject({ revision: 1, settings: { musicVolume: 31 } });
    expect(await viewer.evaluate(() => localStorage.getItem('a2d-unrelated-sentinel'))).toBe('unchanged');
    await viewer.close();
    await expect(application(page)).toHaveAttribute('data-writer', 'OWNED');
    const readback = await readSave(page);
    expect(readback).toMatchObject({ saveEpoch: ownerStart?.saveEpoch, revision: 1, settings: { musicVolume: 31 }, commitReceipt: null });
    await info.attach('native-integrated-writer-readback', { body: JSON.stringify({ ownerStart, readback }), contentType: 'application/json' });
  });

  test(`Stage A-2d / ${name}: native audio, no-input FAILED and one persisted result`, async ({ page, browser }, info) => {
    test.setTimeout(55_000);
    info.annotations.push({ type: 'browser version', description: browser.version() });
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await startNative(page, url);
      await expect(application(page)).toHaveAttribute('data-screen', 'RESULT', { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'FAILED', exact: true })).toBeVisible();
      await expect(application(page)).toHaveAttribute('data-save-status', 'SAVED');
      const save = await readSave(page);
      expect(save).toMatchObject({ revision: 1,
        records: { 'CHART-01-H': { clear: null, failed: { failureCount: 1, bestScore: 0 } } },
        commitReceipt: { revision: 1 },
      });
      expect(save?.commitReceipt?.sessionId).toBe(save?.records['CHART-01-H']?.failed?.latestResult.sessionId);
      await info.attach('native-failed-save-readback', { body: JSON.stringify(save), contentType: 'application/json' });
      await button(page, 'リトライ').click();
      await expect(application(page)).toHaveAttribute('data-screen', 'GAME');
      await expect(application(page)).toHaveAttribute('data-state', 'READY');
      await expect(button(page, '演奏を始める')).toBeEnabled();
      await button(page, '演奏を中断').click();
      await expect(application(page)).toHaveAttribute('data-screen', 'MENU');
      expect(await readSave(page)).toEqual(save);
    } finally {
      await saveObservation();
    }
  });

  test(`Stage A-2d / ${name}: native audio pauses, resumes in a new generation and aborts without a record`, async ({ page, browser, browserName }, info) => {
    test.setTimeout(60_000);
    info.annotations.push({ type: 'browser version', description: browser.version() });
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await startNative(page, url);
      const field = application(page);
      const initialGeneration = await field.getAttribute('data-generation');
      expect(initialGeneration).toMatch(/^\d+$/);
      await button(page, '一時停止').click();
      await expect(field).toHaveAttribute('data-state', 'PAUSED');
      await expect(field).toHaveAttribute('data-screen', 'PAUSE');
      if (browserName === 'chromium') {
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await expect(field).toHaveAttribute('data-state', 'PAUSED');
          await info.attach(`paused-playfield-${viewport.width}x${viewport.height}`, {
            body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
          });
        }
      }
      await button(page, '再開').click();
      await expect(field).toHaveAttribute('data-state', 'PLAYING', { timeout: 12_000 });
      const resumedGeneration = await field.getAttribute('data-generation');
      expect(resumedGeneration).toMatch(/^\d+$/);
      expect(Number(resumedGeneration)).toBeGreaterThan(Number(initialGeneration));
      await button(page, '演奏を中断').click();
      await expect(field).toHaveAttribute('data-screen', 'MENU');
      expect(await readSave(page)).toMatchObject({ revision: 0, records: {}, commitReceipt: null });
    } finally {
      await saveObservation();
    }
  });

  test.describe(`Stage A-2d / ${name} native touch`, () => {
    test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });
    test('native audio accepts a trusted DOM touch without horizontal overflow', async ({ page, browser }, info) => {
      test.setTimeout(55_000);
      info.annotations.push({ type: 'browser version', description: browser.version() });
      const saveObservation = await observeNativeTrial(page, info);
      try {
        await startNative(page, `${url}?stage-a2d-diagnostics=1`);
        const lane = button(page, 'レーン1 D');
        const bounds = await lane.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        await lane.tap();
        const observed: unknown = await page.evaluate(() => Reflect.get(window, 'a2dE2eDiagnostics'));
        expect(observed).toEqual(expect.arrayContaining([
          { kind: 'dom-pointer', detail: { lane: 1, pointerType: 'touch', trusted: true } },
          { kind: 'input', detail: expect.objectContaining({ lane: 1, action: 'DOWN' }) },
          { kind: 'input', detail: expect.objectContaining({ lane: 1, action: 'UP' }) },
        ]));
        await button(page, '演奏を中断').click();
        await expect(application(page)).toHaveAttribute('data-screen', 'MENU');
        expect(await readSave(page)).toMatchObject({ revision: 0, records: {}, commitReceipt: null });
      } finally {
        await saveObservation();
      }
    });
  });

  test(`Stage A-2d / ${name}: native audio completes the chart with trusted key replay`, async ({ page, browser, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Supplementary full-chart trial planned separately for Chromium.');
    test.setTimeout(85_000);
    info.annotations.push({ type: 'browser version', description: browser.version() });
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await beginPlayback(page, `${url}?stage-a2d-diagnostics=1`);
      await scheduleTrustedKeys(page);
      await expectPerfectSave(page, info);
    } finally {
      await saveObservation();
    }
  });

  test(`Stage A-2d / ${name}: clock fixture DOM completes the chart with trusted key replay`, async ({ page, browser, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Controlled output timestamp fixture planned for Chromium only.');
    test.setTimeout(85_000);
    info.annotations.push({ type: 'browser version', description: browser.version() });
    info.annotations.push({ type: 'condition', description: 'Controlled AudioContext output timestamp fixture. Excluded from native audio synchronization evidence.' });
    await installOutputClockFixture(page);
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await beginPlayback(page, `${url}?stage-a2d-diagnostics=1`);
      await scheduleTrustedKeys(page);
      await expectPerfectSave(page, info);
    } finally {
      await saveObservation();
    }
  });
}
