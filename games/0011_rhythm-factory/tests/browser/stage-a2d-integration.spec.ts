import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import type { Gen, SaveDataV1 } from '../../src/contracts/interface_contracts';
import { buildIdealInputs, compileChart, createChartMusicContext } from '../../src/domain/chart-compiler';
import { installControlledReplay, scheduleControlledReplay } from './fixtures/a2dr1-replay';
import { installNativeAudioObserver, type NativeAudioTrace, type NativeSourceStart } from '../fixtures/a2dr1-native-observer';

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
const trialChart = compiled.value;
const ideal = buildIdealInputs(trialChart, { sessionId: 'playwright-schedule-only', clockGeneration: 1 as Gen });
const totalJudgements = trialChart.totalJudgements;

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

async function expectFirstPlayViewport(page: Page, action: string): Promise<void> {
  const layout = await page.evaluate((name) => {
    scrollTo(0, 0);
    const controls = [...document.querySelectorAll('main button')];
    const actionButton = controls.find(node => node.textContent?.trim() === name);
    const target = [document.querySelector('main canvas'), ...controls.filter(node => node.hasAttribute('data-lane')), actionButton];
    return {
      viewport: [innerWidth, innerHeight],
      scrollWidth: document.documentElement.scrollWidth,
      bounds: target.map(node => node?.getBoundingClientRect().toJSON() as { left: number; top: number;
        right: number; bottom: number; width: number; height: number } | null),
    };
  }, action);
  expect(layout.viewport).toEqual([320, 568]);
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  expect(layout.bounds).toHaveLength(6);
  for (const box of layout.bounds) {
    expect(box).toBeTruthy();
    expect(box?.left).toBeGreaterThanOrEqual(0);
    expect(box?.top).toBeGreaterThanOrEqual(0);
    expect(box?.right).toBeLessThanOrEqual(320);
    expect(box?.bottom).toBeLessThanOrEqual(568);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
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
      controlledReplay: window.stageA2dr1ControlledReplay ?? null,
      nativeAudio: Reflect.get(window, 'stageA2dr1NativeAudio') as unknown,
      trustedReplayIssuance: Reflect.get(window, 'stageA2dr1TrustedReplayIssuance') as unknown,
    }));
    await info.attach('audio-ui-transitions', { body: JSON.stringify({ ...data, issues, requests: [...requests] }), contentType: 'application/json' });
    const scope = new URL(mount, page.url()).href;
    expect([...requests].every(request => request.startsWith(scope))).toBe(true);
  };
}

async function scheduleTrustedKeys(page: Page, inputs = ideal, targetGeneration?: number): Promise<void> {
  const ordinal = targetGeneration === undefined ? 1 : 2;
  const sourceHandle = await page.waitForFunction((ordinal) => {
    const trace = Reflect.get(window, 'stageA2dr1NativeAudio') as NativeAudioTrace | undefined;
    return trace?.sources.filter(source => source.scope === 'full-track-bgm')[ordinal - 1] ?? false;
  }, ordinal, { timeout: 12_000 });
  const source = await sourceHandle.jsonValue();
  if (!source || source.anchorPerformanceTime === null || source.anchorContextTime === null
      || source.whenSec === null || source.offsetSec === null) throw new Error('Native trial source has no fixed clock evidence.');
  if ((targetGeneration === undefined && source.offsetSec !== 0) || (targetGeneration !== undefined && source.offsetSec <= 0)) {
    throw new Error('Native trial source offset did not match the requested playback segment.');
  }
  const save = await readSave(page);
  expect(save?.settings.timingOffsetMs).toBe(0);
  if (targetGeneration !== undefined && inputs.some(input => input.judgeTimeUs <= Math.round(source.offsetSec! * 1_000_000))) {
    throw new Error('Native replay would cross the frozen judgement boundary.');
  }
  const originMs = source.anchorPerformanceTime + (source.whenSec - source.anchorContextTime - source.offsetSec) * 1000;
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const issued: { judgeUs: number; lane: number; action: string; plannedBrowserMs: number; issuedEpochMs: number }[] = [];
  try {
    let lastStateCheckUs = Number.NEGATIVE_INFINITY;
    for (const [index, input] of inputs.entries()) {
      const plannedBrowserMs = originMs + input.judgeTimeUs / 1000;
      const check = async () => {
        const data = await application(page).evaluate(root => ({ state: root.dataset.state, error: root.dataset.error,
          generation: root.dataset.generation }));
        if (data.state === 'ERROR') throw new Error(`Native replay stopped before ${input.judgeTimeUs}us: ${data.error}`);
        if (targetGeneration !== undefined && Number(data.generation) !== targetGeneration) throw new Error('Native replay generation not established.');
        lastStateCheckUs = input.judgeTimeUs;
      };
      if (index !== 0 && input.judgeTimeUs - lastStateCheckUs >= 500_000) await check();
      const delay = timeOrigin + plannedBrowserMs - Date.now();
      if (delay > 0) await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
      if (index === 0) await check();
      const key = keys[input.lane - 1]!;
      issued.push({ judgeUs: input.judgeTimeUs, lane: input.lane, action: input.action, plannedBrowserMs, issuedEpochMs: Date.now() });
      // Chromium supplies the trusted KeyboardEvent timestamp. The plan is only a scheduling target.
      if (input.action === 'DOWN') await page.keyboard.down(key);
      else await page.keyboard.up(key);
    }
  } finally {
    await page.evaluate((segment) => {
      const previous = Reflect.get(window, 'stageA2dr1TrustedReplayIssuance') as unknown[] | undefined;
      Reflect.set(window, 'stageA2dr1TrustedReplayIssuance', [...(previous ?? []), segment]);
    }, { ordinal, targetGeneration, source, originMs, timeOrigin, issued });
  }
}

async function scheduleControlledKeys(page: Page, inputs = ideal, generation?: number): Promise<void> {
  await scheduleControlledReplay(page, inputs.map(input => ({ judgeUs: input.judgeTimeUs,
    type: input.action === 'DOWN' ? 'keydown' : 'keyup', key: keys[input.lane - 1]!,
  })), generation);
}

async function expectPerfectSave(page: Page, info: TestInfo, expectedSources = 1): Promise<void> {
  expect(trialChart.notes).toHaveLength(63);
  expect(totalJudgements).toBe(82);
  await expect(application(page)).toHaveAttribute('data-screen', 'RESULT', { timeout: 6_000 });
  await expect(page.getByRole('heading', { name: 'CLEAR', exact: true })).toBeVisible();
  await expect(application(page)).toHaveAttribute('data-save-status', 'SAVED');
  const saved = await readSave(page);
  await info.attach('clear-save-readback', { body: JSON.stringify(saved), contentType: 'application/json' });
  expect(saved).toMatchObject({ revision: 1,
    records: { 'CHART-01-H': { clear: { bestScore: 1_000_000, bestCombo: totalJudgements, clearCount: 1,
      fullComboAchieved: true, allPerfectAchieved: true,
      bestScoreResult: { maxCombo: totalJudgements, remainingLifeUnits: 200, counts: { perfect: totalJudgements,
        great: 0, good: 0, miss: 0, unplayed: 0, ghost: 0 } },
    }, failed: null } },
    commitReceipt: { revision: 1 },
  });
  expect(saved?.commitReceipt?.sessionId).toBe(saved?.records['CHART-01-H']?.clear?.bestScoreResult.sessionId);

  const control = await page.evaluate(() => {
    const trace = window.stageA2dr1ControlledReplay;
    if (!trace) return null;
    const diagnostics = Reflect.get(window, 'a2dE2eDiagnostics') as readonly {
      kind: string; detail: { eventPerformanceMs?: number; judgeTimeUs?: number; lane?: number; action?: string };
    }[];
    const inputs = diagnostics.filter(record => record.kind === 'input').map(record => record.detail);
    const exact = trace.dispatches.map(stroke => {
      const lane = ['d', 'f', 'j', 'k'].indexOf(stroke.key) + 1;
      const action = stroke.type === 'keydown' ? 'DOWN' : 'UP';
      const matches = inputs.filter(input => input.eventPerformanceMs === stroke.modeledOccurrenceMs
        && input.lane === lane && input.action === action);
      return { plannedJudgeUs: stroke.judgeUs, receivedJudgeUs: matches[0]?.judgeTimeUs ?? null, matches: matches.length };
    });
    return { exact, sources: trace.sources.length, unexpected: trace.unexpected };
  });
  if (control) {
    await info.attach('controlled-exact-input-reconciliation', { body: JSON.stringify(control), contentType: 'application/json' });
    expect(control.unexpected).toEqual([]);
    expect(control.sources).toBe(expectedSources);
    expect(control.exact).toHaveLength(ideal.length);
    expect(control.exact.every(row => row.matches === 1 && row.plannedJudgeUs === row.receivedJudgeUs)).toBe(true);
  }
}

function nativeSampleWithinLimit(source: NativeSourceStart, context: number, performanceMs: number): boolean {
  // Evaluate the independent signed residual on an exact decimal millisecond scale.
  // The product's diagnostic double is retained in the raw trace rather than used for this boundary comparison.
  if (source.anchorContextTime === null || source.anchorPerformanceTime === null) return false;
  const readings = [context, source.anchorContextTime, performanceMs, source.anchorPerformanceTime].map(value => {
    const [mantissa, exponent = '0'] = String(value).split('e');
    const fraction = mantissa!.split('.')[1] ?? '';
    return { n: BigInt(mantissa!.replace('.', '')), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(0, ...readings.map(reading => reading.scale));
  const [audio, audioAnchor, wall, wallAnchor] = readings.map(reading => reading.n * 10n ** BigInt(scale - reading.scale));
  const residual = (audio! - audioAnchor!) * 1000n - (wall! - wallAnchor!);
  const limit = 20n * 10n ** BigInt(scale);
  return residual >= -limit && residual <= limit;
}

async function expectNativeLifecycle(page: Page, info: TestInfo, sources: number): Promise<void> {
  const terminalMs = await page.evaluate(() => {
    const events = Reflect.get(window, 'a2dE2eTransitions') as readonly { screen: string; state: string; performanceMs: number }[];
    return events.find(row => row.screen === 'RESULT' && row.state === 'CLEAR')?.performanceMs ?? null;
  });
  expect(terminalMs).not.toBeNull();
  // Observe through the next expected 100ms monitor opportunity after terminal UI publication.
  await page.waitForFunction((atMs) => atMs !== null && performance.now() >= atMs + 100, terminalMs);
  const trace = await page.evaluate(() => (Reflect.get(window, 'stageA2dr1NativeAudio') as NativeAudioTrace | undefined) ?? null);
  expect(trace).not.toBeNull();
  if (!trace) throw new Error('Native audio trace missing.');
  const bgm = trace.sources.filter(source => source.scope === 'full-track-bgm');
  const groups = [...new Set(trace.monitor.map(row => row.generation))];
  await info.attach('native-terminal-audio-check', { body: JSON.stringify({ terminalMs, sourceIds: bgm.map(row => row.sourceId),
    groups, lastMonitorMs: trace.monitor.at(-1)?.atMs ?? null, resources: trace.resources.at(-1), lifecycle: trace.lifecycle,
  }), contentType: 'application/json' });
  expect(trace.missingHooks).toEqual([]);
  expect(trace.observerErrors).toEqual([]);
  expect(bgm).toHaveLength(sources);
  expect(groups).toHaveLength(sources);
  if (sources === 2) expect(groups[1]).toBe(groups[0]! + 1);
  expect(bgm[0]?.offsetSec).toBe(0);
  if (sources === 2) expect(bgm[1]?.offsetSec).toBeGreaterThan(0);
  for (const [index, source] of bgm.entries()) {
    expect(source.anchorPerformanceTime).toBeGreaterThan(0);
    expect(source.anchorContextTime).toBeGreaterThan(0);
    const samples = trace.monitor.filter(row => row.generation === groups[index]);
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      const read = trace.timestampReads.find(row => row.readId === sample.nativeReadId);
      expect(sample.correlation).toBe('fresh-same-context');
      expect(sample.anchorReadId).toBe(source.anchorReadId);
      expect(sample.sourceId).toBe(source.sourceId);
      expect(sample.contextId).toBe(source.contextId);
      expect(read?.contextTime).toBeGreaterThan(0);
      expect(read?.performanceTime).toBeGreaterThan(0);
      expect(read?.state).toBe('running');
      expect(sample.errorCode).toBeUndefined();
      expect(sample.rawDifferenceUs !== null && Number.isFinite(sample.rawDifferenceUs)).toBe(true);
      expect(read?.contextTime != null && read.performanceTime != null
        && nativeSampleWithinLimit(source, read.contextTime, read.performanceTime)).toBe(true);
      // This is the externally observed dispatch interval, not the internal tick timestamp.
      if (sample.intervalMs !== null) expect(sample.intervalMs).toBeGreaterThan(0);
    }
    expect(trace.lifecycle.some(row => row.sourceId === source.sourceId && row.phase === 'ended')).toBe(true);
  }
  expect(trace.activeSourceIds).toEqual([]);
  expect(trace.resources.at(-1)).toMatchObject({ activeSources: 0, activeRafLoops: 0, activeRenders: 0, voices: 0 });
  expect(trace.monitor.at(-1)?.atMs).toBeLessThanOrEqual(terminalMs!);
}


async function exerciseHeldRehold(page: Page, info: TestInfo, url: string, replay: typeof scheduleControlledKeys): Promise<void> {
  const hold = trialChart.events.find(event => event.type === 'HOLD_START');
  if (!hold) throw new Error('The fixed trial must include a HOLD.');
  const prior = ideal.filter(input => input.judgeTimeUs <= hold.targetTimeUs + 50_000);
  const later = ideal.slice(prior.length);
  const key = keys[hold.lane - 1]!;
  await beginPlayback(page, `${url}?stage-a2d-diagnostics=1`);
  await replay(page, prior);
  await page.waitForFunction((afterUs) => {
    const diagnostics = Reflect.get(window, 'a2dE2eDiagnostics') as readonly { kind: string; detail: { judgeTimeUs?: number } }[];
    return diagnostics.some(({ kind, detail }) => kind === 'clock' && (detail.judgeTimeUs ?? 0) >= afterUs);
  }, hold.targetTimeUs + 120_000, { timeout: 4_000 });

  const state = application(page);
  const score = page.locator('[data-stat="score"]');
  const firstGeneration = Number(await state.getAttribute('data-generation'));
  await button(page, '一時停止').click();
  await expect(state).toHaveAttribute('data-state', 'PAUSED');
  await page.setViewportSize({ width: 320, height: 568 });
  await expectFirstPlayViewport(page, '再開');
  const pausedScore = await score.innerText();
  await page.keyboard.up(key);
  await button(page, '再開').click();
  await expect(state).toHaveAttribute('data-state', 'REHOLD_WAIT');
  const lane = page.locator(`button[data-lane="${hold.lane}"]`);
  await expect(lane).toHaveAttribute('data-rehold', 'true');
  await page.keyboard.down(key);
  await expect(state).toHaveAttribute('data-state', 'RESUMING');
  await expect(lane).toHaveAttribute('data-reheld', 'true');
  await page.keyboard.up(key);
  await expect(state).toHaveAttribute('data-state', 'REHOLD_WAIT');
  await expect(lane).toHaveAttribute('data-reheld', 'false');
  await expect(score).toHaveText(pausedScore);
  await expect(state).toHaveAttribute('data-generation', String(firstGeneration));

  const reheldAt = Date.now();
  await page.keyboard.down(key);
  const resumedGeneration = firstGeneration + 1;
  let reholdElapsedMs = 0;
  await Promise.all([
    replay(page, later, resumedGeneration),
    (async () => {
      await expect(state).toHaveAttribute('data-state', 'RESUMING');
      await expect(state).toHaveAttribute('data-state', 'PLAYING', { timeout: 8_000 });
      reholdElapsedMs = Date.now() - reheldAt;
      expect(reholdElapsedMs).toBeGreaterThanOrEqual(3000);
      await expect(state).toHaveAttribute('data-generation', String(resumedGeneration));
    })(),
  ]);
  await page.keyboard.up(key);
  await expectPerfectSave(page, info, 2);
  await info.attach('rehold-new-generation', { body: JSON.stringify({
    lane: hold.lane, firstGeneration, resumedGeneration, reholdElapsedMs, pausedScore,
  }), contentType: 'application/json' });
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
        records: { 'CHART-01-H': { clear: null, failed: { failureCount: 1, bestScore: 0,
          latestResult: { remainingLifeUnits: 0, counts: { perfect: 0, great: 0, good: 0, miss: 10, unplayed: 72, ghost: 0 } } } } },
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
          if (viewport.width === 320) await expectFirstPlayViewport(page, '再開');
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
        await expectFirstPlayViewport(page, '一時停止');
        const lane = button(page, 'レーン1 D');
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
    await installNativeAudioObserver(page);
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await beginPlayback(page, `${url}?stage-a2d-diagnostics=1`);
      await scheduleTrustedKeys(page);
      await expectPerfectSave(page, info);
      await expectNativeLifecycle(page, info, 1);
    } finally {
      await saveObservation();
    }
  });

  test(`Stage A-2d / ${name}: native audio performs a held HOLD release and new-generation rehold`, async ({ page, browser, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Supplementary held HOLD native trial planned for Chromium.');
    test.setTimeout(90_000);
    info.annotations.push({ type: 'browser version', description: browser.version() });
    info.annotations.push({ type: 'condition', description: 'Original output timestamp pair and Chromium trusted key events.' });
    await installNativeAudioObserver(page);
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await exerciseHeldRehold(page, info, url, scheduleTrustedKeys);
      await expectNativeLifecycle(page, info, 2);
    } finally {
      await saveObservation();
    }
  });

  test(`Stage A-2d / ${name}: native preview ends naturally and leaves records untouched`, async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Supplementary native preview trial planned separately for Chromium.');
    test.setTimeout(45_000);
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await open(page, `${url}?stage-a2d-diagnostics=1`);
      await expect(application(page)).toHaveAttribute('data-writer', 'OWNED');
      const before = await readSave(page);
      await openSelection(page);
      await button(page, '音源を準備').click();
      const preview = button(page, '試聴する');
      await expect(preview).toBeEnabled({ timeout: 20_000 });
      await preview.click();
      await expect(button(page, '試聴を停止')).toBeVisible();
      await expect(preview).toBeEnabled({ timeout: stageA2TrialMusic.master.previewDurationMs + 8_000 });
      await expect(application(page)).toHaveAttribute('data-screen', 'MUSIC_SELECT');
      expect(await readSave(page)).toEqual(before);
    } finally {
      await saveObservation();
    }
  });

  test(`Stage A-2d / ${name}: clock fixture DOM completes the chart with controlled key timestamps`, async ({ page, browser, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Controlled output timestamp fixture planned for Chromium only.');
    test.setTimeout(85_000);
    info.annotations.push({ type: 'browser version', description: browser.version() });
    info.annotations.push({ type: 'condition', description: 'Controlled audio output timestamps and DOM keyboard event timestamps. Excluded from native audio synchronization evidence.' });
    await installControlledReplay(page);
    const saveObservation = await observeNativeTrial(page, info);
    try {
      await beginPlayback(page, `${url}?stage-a2d-diagnostics=1`);
      await scheduleControlledKeys(page);
      await expectPerfectSave(page, info);
    } finally {
      await saveObservation();
    }
  });

  test.describe(`Stage A-2d / ${name} controlled browser routes`, () => {
    test('result UI recovers an unreadable first commit without applying the result twice', async ({ page, browserName }, info) => {
      test.skip(browserName !== 'chromium', 'Storage failure injection is scoped to Chromium.');
      test.setTimeout(45_000);
      await installControlledReplay(page);
      await page.addInitScript(key => {
        const get = Storage.prototype.getItem;
        const set = Storage.prototype.setItem;
        let injected = false;
        let failReadback = false;
        Storage.prototype.setItem = function (name, value) {
          set.call(this, name, value);
          if (!injected && name === key && (JSON.parse(value) as SaveDataV1).commitReceipt?.revision === 1) failReadback = true;
        };
        Storage.prototype.getItem = function (name) {
          if (failReadback && name === key) {
            failReadback = false;
            injected = true;
            throw new DOMException('A-2d controlled first-save readback failure', 'InvalidStateError');
          }
          return get.call(this, name);
        };
      }, saveKey);
      const saveObservation = await observeNativeTrial(page, info);
      try {
        await startNative(page, `${url}?stage-a2d-diagnostics=1`);
        await expect(application(page)).toHaveAttribute('data-screen', 'RESULT', { timeout: 10_000 });
        await expect(page.getByRole('heading', { name: 'FAILED', exact: true })).toBeVisible();
        await expect(application(page)).toHaveAttribute('data-save-status', 'SAVE_ERROR');
        await expect(button(page, 'リトライ')).toBeDisabled();
        const written = await readSave(page);
        expect(written).toMatchObject({ revision: 1, commitReceipt: { revision: 1 }, records: {
          'CHART-01-H': { clear: null, failed: { failureCount: 1, bestScore: 0,
            latestResult: { counts: { miss: 10, unplayed: 72 }, remainingLifeUnits: 0 } } },
        } });
        await button(page, '保存を再試行').click();
        await expect(application(page)).toHaveAttribute('data-save-status', 'SAVED');
        expect(await readSave(page)).toEqual(written);
        await info.attach('recovered-first-write', { body: JSON.stringify(written), contentType: 'application/json' });
      } finally {
        await saveObservation();
      }
    });

    test('clock fixture DOM rehold release resets the countdown and the new generation retains the hold', async ({ page, browserName }, info) => {
      test.skip(browserName !== 'chromium', 'Controlled output timestamp fixture planned for Chromium only.');
      test.setTimeout(85_000);
      info.annotations.push({ type: 'condition', description: 'Controlled output and chart input timestamps, trusted manual rehold transitions.' });
      await installControlledReplay(page);
      const saveObservation = await observeNativeTrial(page, info);
      try {
        await exerciseHeldRehold(page, info, url, scheduleControlledKeys);
      } finally {
        await saveObservation();
      }
    });

    test('clock fixture DOM practice completion records tutorial progress only', async ({ page, browserName }, info) => {
      test.skip(browserName !== 'chromium', 'Controlled output timestamp fixture planned for Chromium only.');
      test.setTimeout(85_000);
      info.annotations.push({ type: 'condition', description: 'Controlled output timestamps. A real isolated storage context is used.' });
      await installControlledReplay(page);
      const saveObservation = await observeNativeTrial(page, info);
      try {
        await open(page, `${url}?stage-a2d-diagnostics=1`);
        await expect(application(page)).toHaveAttribute('data-writer', 'OWNED');
        await button(page, '練習').click();
        await expect(application(page)).toHaveAttribute('data-screen', 'TUTORIAL');
        await button(page, '練習音源を準備').click();
        const start = button(page, '練習を始める');
        await expect(start).toBeEnabled({ timeout: 30_000 });
        await start.click();
        await scheduleControlledKeys(page);
        await expect(application(page)).toHaveAttribute('data-screen', 'RESULT');
        await expect(application(page)).toHaveAttribute('data-state', 'CLEAR');
        await expect(page.getByRole('heading', { name: '練習完了', exact: true })).toBeVisible();
        await expect.poll(() => readSave(page)).toMatchObject({ revision: 1,
          progress: { completedTutorialIds: ['TUT-01'] }, records: {}, collection: {}, commitReceipt: null,
        });
        await info.attach('practice-save-readback', { body: JSON.stringify(await readSave(page)), contentType: 'application/json' });
      } finally {
        await saveObservation();
      }
    });

    test('clock fixture DOM calibration applies the measured timing offset', async ({ page, browserName }, info) => {
      test.skip(browserName !== 'chromium', 'Controlled output timestamp fixture planned for Chromium only.');
      test.setTimeout(40_000);
      info.annotations.push({ type: 'condition', description: 'Controlled output timestamps with trusted calibration key presses.' });
      await installControlledReplay(page);
      const saveObservation = await observeNativeTrial(page, info);
      try {
        await open(page, `${url}?stage-a2d-diagnostics=1`);
        await expect(application(page)).toHaveAttribute('data-writer', 'OWNED');
        await button(page, '設定').click();
        await button(page, '音声を有効にする').click();
        // Observation-only setup allowance for the real AudioContext to start producing a timestamp.
        await page.waitForTimeout(250);
        await button(page, 'タイミング補正を測る').click();
        await expect(application(page)).toHaveAttribute('data-screen', 'CALIBRATION');
        for (let beat = 4; beat < 16; beat++) {
          await page.waitForFunction(index => document.querySelector('[data-calibration-beat]')
            ?.getAttribute('data-calibration-beat') === String(index), beat, { timeout: 4000 });
          await page.keyboard.press('d');
        }
        const status = page.getByRole('status').filter({ hasText: '補正の提案' });
        await expect(status).toBeVisible();
        const proposed = Number((await status.locator('strong').innerText()).replace(' ms', ''));
        expect(Number.isInteger(proposed)).toBe(true);
        expect(Math.abs(proposed)).toBeLessThanOrEqual(200);
        expect(proposed % 5 === 0).toBe(true);
        await button(page, '補正を適用').click();
        await expect(application(page)).toHaveAttribute('data-screen', 'SETTINGS');
        const save = await readSave(page);
        expect(save).toMatchObject({ revision: 1, settings: { timingOffsetMs: proposed }, records: {}, commitReceipt: null });
        await button(page, 'タイミング補正を測る').click();
        await expect(application(page)).toHaveAttribute('data-screen', 'CALIBRATION');
        await page.waitForFunction(() => document.querySelector('[data-calibration-beat]')?.hasAttribute('data-calibration-beat'));
        const target = await button(page, '拍に合わせて入力').boundingBox();
        if (!target) throw new Error('Calibration input target is unavailable.');
        const pointer = await page.context().newCDPSession(page);
        try {
          await pointer.send('Input.dispatchTouchEvent', {
            type: 'touchStart', touchPoints: [{ x: target.x + target.width / 2, y: target.y + target.height / 2 }],
          });
          await pointer.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        } finally {
          await pointer.detach();
        }
        await expect(application(page)).toHaveAttribute('data-screen', 'SETTINGS');
        expect(await readSave(page)).toEqual(save);
        await info.attach('calibration-save-readback', { body: JSON.stringify({ proposed, save }), contentType: 'application/json' });
      } finally {
        await saveObservation();
      }
    });
  });
}
