import { expect, test, type Page } from '@playwright/test';
import type { Gen, SaveDataV1 } from '../../src/contracts/interface_contracts';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import { buildIdealInputs, compileChart, createChartMusicContext } from '../../src/domain/chart-compiler';
import { installControlledReplay, scheduleControlledReplay } from './fixtures/a2dr1-replay';

const path = '/daily-mini-games/games/0011_rhythm-factory/';
const url = `http://127.0.0.1:4174${path}?stage-a2d-diagnostics=1`;
const keys = ['d', 'f', 'j', 'k'] as const;
const viewports = [
  { width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1280, height: 720 },
] as const;
const saveKey = 'daily-mini-games.game0011.save.v1';
const compiled = compileChart(stageA2TrialChart, createChartMusicContext(stageA2TrialMusic), 'complete');
if (!compiled.ok) throw new Error('The fixed chart must compile.');
const chart = compiled.value;
const plan = buildIdealInputs(chart, { sessionId: 'cr-0011-01-schedule', clockGeneration: 1 as Gen })
  .map(input => ({ judgeUs: input.judgeTimeUs, key: keys[input.lane - 1]!,
    type: input.action === 'DOWN' ? 'keydown' as const : 'keyup' as const }));

const screen = (page: Page) => page.locator('main[data-screen]');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const target = (page: Page, lane: number) => page.locator(`button[data-lane="${lane}"]`);

async function openMenu(page: Page, entry = url) {
  await page.goto(entry);
  await button(page, 'メニューへ').click();
  await expect(screen(page)).toHaveAttribute('data-writer', 'OWNED');
}

async function prepare(page: Page) {
  await button(page, '曲を選ぶ').click();
  await button(page, '音源を準備').click();
  await expect(button(page, '演奏を始める')).toBeEnabled({ timeout: 30_000 });
}

// Hold the real product view at INITIALIZING for layout and physical-only checks.
async function openPlayfieldWithoutAudio(page: Page) {
  await button(page, '演奏を始める').click();
  await expect(screen(page)).toHaveAttribute('data-state', 'INITIALIZING');
}

async function holdAudioInitialization(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(AudioContext.prototype, 'resume', { configurable: true, value: () => new Promise<void>(() => {}) });
  });
}

async function save(page: Page): Promise<SaveDataV1> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null') as SaveDataV1, saveKey);
}

async function center(page: Page, lane: number) {
  const box = await target(page, lane).boundingBox();
  if (!box) throw new Error(`No visible hit target for lane ${lane}.`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function assertAlignment(page: Page, zoomed = false) {
  const layout = await page.locator('.trial-board').evaluate((board, zoomed) => {
    if (zoomed) board.querySelector('button')?.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, 0);
    const canvas = board.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d')!;
    const buttons = [...board.querySelectorAll<HTMLButtonElement>('button[data-lane]')];
    return {
      field: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height, widthPixels: canvas.width, heightPixels: canvas.height },
      dpr: devicePixelRatio,
      hasOverflow: document.documentElement.scrollWidth > innerWidth,
      hits: buttons.map(button => {
        const hit = button.getBoundingClientRect();
        const x = hit.left + hit.width / 2;
        const y = hit.top + hit.height / 2;
        // The first TAP starts on the line. Read just inside the lane edge, clear of the marker.
        const sampleX = hit.left + hit.width * 0.08;
        const pixels = context.getImageData(Math.floor((sampleX - rect.left) / rect.width * canvas.width),
          Math.floor((y - rect.top) / rect.height * canvas.height), 1, 1).data;
        return {
          left: hit.left, right: hit.right, top: hit.top, bottom: hit.bottom, width: hit.width, height: hit.height,
          y, seesLine: pixels[0]! > 200 && pixels[1]! > 200 && pixels[2]! > 200,
          hit: document.elementFromPoint(x, y)?.closest('button') === button,
          hitElement: document.elementFromPoint(x, y)?.outerHTML.slice(0, 140),
          transparent: getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)',
        };
      }),
      outside: document.elementFromPoint(rect.left + rect.width / 8, rect.top + rect.height / 2)?.tagName,
    };
  }, zoomed);
  expect(layout.hits).toHaveLength(4);
  expect(layout.hasOverflow).toBe(false);
  expect(Math.abs(layout.field.widthPixels - Math.round(layout.field.width * layout.dpr))).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.field.heightPixels - Math.round(layout.field.height * layout.dpr))).toBeLessThanOrEqual(1);
  expect(layout.outside).toBe('CANVAS');
  const line = layout.field.top + layout.field.height * 0.8;
  for (const [index, hit] of layout.hits.entries()) {
    expect(hit.hit, `lane ${index + 1} must receive the center press: ${JSON.stringify({ hit, field: layout.field })}`).toBe(true);
    expect(hit.seesLine, `lane ${index + 1} must overlap the drawn line`).toBe(true);
    expect(hit.transparent, `lane ${index + 1} must not render a button plate`).toBe(true);
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.height).toBeGreaterThanOrEqual(44);
    expect(hit.top).toBeGreaterThanOrEqual(layout.field.top);
    expect(hit.bottom).toBeLessThanOrEqual(layout.field.bottom);
    expect(Math.abs(hit.y - line)).toBeLessThan(0.51);
    expect(Math.abs(hit.left - (layout.field.left + layout.field.width * index / 4))).toBeLessThan(0.51);
    expect(Math.abs(hit.right - (layout.field.left + layout.field.width * (index + 1) / 4))).toBeLessThan(0.51);
    if (index > 0) expect(hit.left).toBeGreaterThanOrEqual(layout.hits[index - 1]!.right);
  }
}

test('CR-T01/02/03/12–16: Canvas pixels and independent DOM hit targets align at all layouts', async ({ browser, browserName }, info) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: viewports[0], deviceScaleFactor: 2, hasTouch: true });
  try {
    const page = await context.newPage();
    await holdAudioInitialization(page);
    await openMenu(page);
    await prepare(page);
    await openPlayfieldWithoutAudio(page);
    await expect(page.getByText('ノーツが白い線に重なった瞬間に、そのレーンの線を押します。')).toBeVisible();
    for (const viewport of [...viewports, { width: 1024, height: 768 }, viewports[0]]) {
      await page.setViewportSize(viewport);
      await expect(async () => assertAlignment(page)).toPass({ timeout: 4_000 });
      if (browserName === 'chromium') {
        await info.attach(`line-${viewport.width}x${viewport.height}`, { body: await page.screenshot(), contentType: 'image/png' });
      }
    }
    await page.evaluate(() => { document.body.style.zoom = '1.25'; });
    await page.setViewportSize({ width: 540, height: 950 });
    await expect(async () => assertAlignment(page, true)).toPass({ timeout: 4_000 });
    if (browserName === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { mobile: false, width: 540, height: 950, deviceScaleFactor: 1.5 });
      await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1.5);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.1 });
      await expect.poll(() => page.evaluate(() => visualViewport?.scale)).toBeCloseTo(1.1, 6);
      await expect(async () => assertAlignment(page, true)).toPass({ timeout: 4_000 });
    }
  } finally {
    await context.close();
  }
});

test('CR-T08/09/16: trusted multi-touch owns its starting lanes across a drag, ignores the field above the line and cancels safely', async ({ browserName, browser }) => {
  test.skip(browserName !== 'chromium', 'Trusted multi-touch uses the Chromium protocol.');
  test.setTimeout(45_000);
  const context = await browser.newContext({ viewport: viewports[0], hasTouch: true });
  try {
    const page = await context.newPage();
    await installControlledReplay(page);
    await page.addInitScript(() => {
      const inputs: { lane: number; action: string }[] = [];
      const captures: { lane: string | undefined; trusted: boolean }[] = [];
      Object.assign(window, { crInputs: inputs, crCaptures: captures });
      window.addEventListener('stage-a2d:input', event => {
        const { lane, action } = (event as CustomEvent<{lane: number; action: string}>).detail;
        inputs.push({ lane, action });
      });
      document.addEventListener('gotpointercapture', event => {
        captures.push({ lane: (event.target as HTMLElement).dataset.lane, trusted: event.isTrusted });
      });
    });
    await openMenu(page);
    await prepare(page);
    await button(page, '演奏を始める').click();
    await expect(screen(page)).toHaveAttribute('data-state', 'PLAYING', { timeout: 12_000 });
    const cdp = await context.newCDPSession(page);
    const first = { ...await center(page, 1), id: 1 };
    const third = { ...await center(page, 3), id: 3 };
    const second = await center(page, 2);
    const fourth = await center(page, 4);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, third] });
    await expect(target(page, 1)).toHaveAttribute('data-pressed', 'true');
    await expect(target(page, 3)).toHaveAttribute('data-pressed', 'true');
    const lit = await target(page, 1).evaluate(node => getComputedStyle(node, '::before').opacity);
    expect(lit).toBe('1');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { ...second, id: 1 }, { ...fourth, y: fourth.y - 45, id: 3 },
    ] });
    await expect(target(page, 1)).toHaveAttribute('data-pressed', 'true');
    await expect(target(page, 3)).toHaveAttribute('data-pressed', 'true');
    for (const lane of [2, 4]) await expect(target(page, lane)).not.toHaveAttribute('data-pressed', 'true');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...first, y: first.y - 49 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const trace = await page.evaluate(() => ({
      inputs: Reflect.get(window, 'crInputs'), captures: Reflect.get(window, 'crCaptures'),
    }));
    expect(trace.inputs).toHaveLength(4);
    expect(trace.inputs).toEqual(expect.arrayContaining([
      { lane: 1, action: 'DOWN' }, { lane: 3, action: 'DOWN' }, { lane: 1, action: 'UP' }, { lane: 3, action: 'UP' },
    ]));
    expect(trace.captures).toEqual(expect.arrayContaining([{ lane: '1', trusted: true }, { lane: '3', trusted: true }]));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [second] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(target(page, 2)).toHaveAttribute('data-pressed', 'false');
    await expect(screen(page)).toHaveAttribute('data-state', 'PAUSED');
    expect(await page.evaluate(() => Reflect.get(window, 'crInputs'))).toHaveLength(5);
  } finally {
    await context.close();
  }
});

test('CR-T04–07/17: controlled-clock ideal replay uses line hit testing for all 82 judgements and stores the result once', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses the fixed R1 controlled audio timestamp fixture.');
  test.setTimeout(75_000);
  await installControlledReplay(page);
  await page.addInitScript(({ keys }) => {
    const dispatchAtLine = (event: KeyboardEvent) => {
      const index = keys.findIndex(key => key === event.key);
      if (event.isTrusted || index < 0) return;
      event.stopImmediatePropagation();
      const button = document.querySelector<HTMLButtonElement>(`button[data-lane="${index + 1}"]`)!;
      const box = button.getBoundingClientRect();
      const clientX = box.left + box.width / 2;
      const clientY = box.top + box.height / 2;
      const hit = document.elementFromPoint(clientX, clientY);
      if (hit !== button || !button.closest('.trial-board')) throw new Error('Replay missed the on-line input target.');
      const pointer = new PointerEvent(event.type === 'keydown' ? 'pointerdown' : 'pointerup', {
        pointerType: 'touch', pointerId: index + 1, clientX, clientY, button: 0, bubbles: true, cancelable: true,
      });
      Object.defineProperty(pointer, 'timeStamp', { value: event.timeStamp });
      hit.dispatchEvent(pointer);
    };
    window.addEventListener('keydown', dispatchAtLine, true);
    window.addEventListener('keyup', dispatchAtLine, true);
  }, { keys: [...keys] });
  await page.setViewportSize(viewports[0]);
  await openMenu(page);
  await prepare(page);
  await button(page, '演奏を始める').click();
  await scheduleControlledReplay(page, plan);
  await expect(screen(page)).toHaveAttribute('data-state', 'CLEAR', { timeout: 7_000 });
  await expect(screen(page)).toHaveAttribute('data-save-status', 'SAVED');
  expect(await save(page)).toMatchObject({ revision: 1, commitReceipt: { revision: 1 },
    records: { 'CHART-01-H': { failed: null, clear: { bestScore: 1_000_000, bestCombo: 82, clearCount: 1,
      allPerfectAchieved: true, fullComboAchieved: true, bestScoreResult: { remainingLifeUnits: 200,
        counts: { perfect: 82, great: 0, good: 0, miss: 0, unplayed: 0, ghost: 0 } },
    } } } });
});

test('CR-T10: default keys and saved physical bindings light the corresponding line segment', async ({ page }) => {
  test.setTimeout(60_000);
  await holdAudioInitialization(page);
  await openMenu(page);
  await prepare(page);
  await openPlayfieldWithoutAudio(page);
  for (const [index, key] of keys.entries()) {
    await page.keyboard.down(key);
    await expect(target(page, index + 1)).toHaveAttribute('data-pressed', 'true');
    await page.keyboard.up(key);
    await expect(target(page, index + 1)).toHaveAttribute('data-pressed', 'false');
  }
  await button(page, '演奏を中断').click();
  await button(page, '設定').click();
  await page.getByLabel('レーン1', { exact: true }).fill('A');
  await button(page, '設定を保存').click();
  await expect.poll(async () => (await save(page)).settings.keyBindings).toEqual(['KeyA', 'KeyF', 'KeyJ', 'KeyK']);
  await button(page, 'メニューへ').click();
  await prepare(page);
  await openPlayfieldWithoutAudio(page);
  await expect(button(page, 'レーン1 A')).toBeVisible();
  await page.keyboard.press('d');
  await expect(target(page, 1)).not.toHaveAttribute('data-pressed', 'true');
  await page.keyboard.down('a');
  await expect(target(page, 1)).toHaveAttribute('data-pressed', 'true');
  await page.keyboard.up('a');
  await expect(target(page, 1)).toHaveAttribute('data-pressed', 'false');
});

test('CR-T11: line rehold release resets the countdown and pointer rehold establishes the new generation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses the fixed R1 controlled audio timestamp fixture.');
  test.setTimeout(45_000);
  const hold = chart.events.find(event => event.type === 'HOLD_START')!;
  const cutoff = hold.targetTimeUs + 310_000;
  await page.setViewportSize(viewports[0]);
  await installControlledReplay(page);
  await openMenu(page);
  await prepare(page);
  await button(page, '演奏を始める').click();
  await scheduleControlledReplay(page, plan.filter(stroke => stroke.judgeUs <= hold.targetTimeUs + 50_000));
  const source = (await page.evaluate(() => window.stageA2dr1ControlledReplay?.sources[0]))!;
  const offset = source.stamp.performanceTime + (source.whenSec - source.stamp.contextTime - source.offsetSec) * 1000;
  await page.waitForFunction(at => performance.now() >= at, offset + cutoff / 1000);
  const generation = Number(await screen(page).getAttribute('data-generation'));
  await page.keyboard.press('Escape');
  await expect(screen(page)).toHaveAttribute('data-state', 'PAUSED');
  await page.keyboard.up(keys[hold.lane - 1]!);
  await button(page, '再開').click();
  await expect(target(page, hold.lane)).toHaveAttribute('data-rehold', 'true');
  const { x, y } = await center(page, hold.lane);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(screen(page)).toHaveAttribute('data-state', 'RESUMING');
  await page.mouse.up();
  await expect(screen(page)).toHaveAttribute('data-state', 'REHOLD_WAIT');
  await page.mouse.down();
  await expect(screen(page)).toHaveAttribute('data-state', 'PLAYING', { timeout: 8_000 });
  await expect(screen(page)).toHaveAttribute('data-generation', String(generation + 1));
  await page.mouse.up();
  await button(page, '演奏を中断').click();
  await expect(screen(page)).toHaveAttribute('data-screen', 'MENU');
  expect(await save(page)).toMatchObject({ revision: 0, records: {} });
});
