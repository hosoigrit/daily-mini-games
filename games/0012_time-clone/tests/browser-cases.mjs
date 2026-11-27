import assert from './evidence.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { golden } from './adapter.mjs';
import { SAVE_KEY } from '../src/progress.mjs';

const require = createRequire(import.meta.url);
const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript' };
const codes = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
const at = (x, y) => '.tile[data-x="' + x + '"][data-y="' + y + '"]';
const defaultProgress = n => JSON.stringify({
  schemaVersion: 1,
  stages: Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [i + 1, { cleared: true, bestStars: 3, minMoves: 100 }]))
});

export async function startBrowser() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    executablePath: process.env.GAME0012_CHROMIUM || undefined,
    headless: true
  });
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      const path = pathname === '/' ? '/index.html' : pathname;
      if (!/^\/(?:index\.html|style\.css|src\/[a-z]+\.mjs)$/.test(path)) {
        response.writeHead(404).end();
        return;
      }
      const bytes = await readFile(new URL('..' + path, import.meta.url));
      response.writeHead(200, { 'content-type': types[path.split('.').at(-1)] + '; charset=utf-8' }).end(bytes);
    } catch {
      response.writeHead(500).end();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    await browser.close();
    throw error;
  }
  const url = 'http://127.0.0.1:' + server.address().port;
  return {
    browser, url,
    async close() {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

export async function setup(engine, {
  level = 1, raw = defaultProgress(level), mobile = false, prepare = '', virtual = true, dismissTutorial = true
} = {}) {
  const context = await engine.browser.newContext({
    viewport: mobile ? { width: 320, height: 720 } : { width: 900, height: 820 },
    hasTouch: mobile, isMobile: mobile, acceptDownloads: true
  });
  try {
    const page = await context.newPage();
    const errors = [], outbound = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(engine.url)) outbound.push(request.url());
    });
    await page.addInitScript(({ key, raw, prepare }) => {
      if (!sessionStorage.getItem('test-ready')) {
        sessionStorage.setItem('test-ready', '1');
        localStorage.setItem(key, raw);
        localStorage.setItem('other-game', 'sentinel');
        if (prepare === 'deny-writes') {
          const actual = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name, value) {
            if (this === localStorage && name === key) throw new DOMException('Full', 'QuotaExceededError');
            return actual.call(this, name, value);
          };
        }
        if (prepare === 'count-writes') {
          const actual = Storage.prototype.setItem;
          globalThis.observedWrites = [];
          Storage.prototype.setItem = function (name, value) {
            if (this === localStorage && name === key) globalThis.observedWrites.push(value);
            return actual.call(this, name, value);
          };
        }
      }
    }, { key: SAVE_KEY, raw, prepare });
    if (virtual) {
      await page.clock.install({ time: new Date('2026-11-26T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-11-26T00:00:10Z'));
    }
    await page.goto(engine.url);
    await page.locator('[data-stage="1"]').waitFor();
    return {
      page, context, errors, outbound, level,
      click: id => page.locator('#' + id).click(),
      async choose() {
        await page.locator('[data-stage="' + level + '"]').click();
        if (dismissTutorial) await dismissFirstTutorial(page);
      },
      tick: () => page.clock.runFor(500),
      stored: () => page.evaluate(key => localStorage.getItem(key), SAVE_KEY),
      async step(action, code = codes[action]) {
        if (code && action !== '.') await page.keyboard.press(code);
        await page.clock.runFor(500);
      }
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function dismissFirstTutorial(page) {
  const tutorial = page.locator('#tutorial');
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: 'スキップ' }).click();
    await tutorial.waitFor({ state: 'hidden' });
  }
}

function checkMarker(page, id) {
  return page.locator('.marker.' + id).evaluate(element => [
    Number(element.parentElement.dataset.x), Number(element.parentElement.dataset.y)
  ]);
}

const hidden = (page, selector) => page.locator(selector).isHidden();
const txt = (page, id) => page.locator('#' + id).textContent();
const phase = page => page.locator('#game').getAttribute('data-phase');
const logicalTick = page => page.locator('#game').getAttribute('data-tick');

async function ready(f) {
  await f.choose();
  await f.click('primary');
  assert.equal(await phase(f.page), 'RECORDING');
}

async function record(f, actions) {
  await ready(f);
  for (const action of actions) await f.step(action);
  await f.click('primary');
  assert.equal(await phase(f.page), 'RECORDED');
}

async function play(f, index, limit = Infinity) {
  const c = golden[index];
  await record(f, c.recordActions);
  await f.click('primary');
  for (const [i, action] of c.replayActions.slice(0, limit).entries()) {
    await f.step(action);
    const expected = c.replaySnapshots[i + 1];
    assert.equal(await phase(f.page), expected.gamePhase);
    assert.deepEqual(await checkMarker(f.page, 'player'), [expected.player.x, expected.player.y]);
    if (expected.ghost) assert.deepEqual(await checkMarker(f.page, 'ghost'), [expected.ghost.x, expected.ghost.y]);
    else assert.equal(await f.page.locator('.marker.ghost').count(), 0);
    for (const [door, value] of Object.entries(expected.doors)) {
      assert.equal(await f.page.locator('[data-tile="' + door + '"]').getAttribute('data-door'), value);
    }
  }
}

async function keyboardTo(page, selector) {
  for (let i = 0; i < 15; i++) {
    if (await page.locator(selector).evaluate(node => node === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail('Tab could not reach ' + selector);
}

async function resetInput(f, keyboardOnly) {
  const { page } = f;
  if (keyboardOnly) {
    await keyboardTo(page, '#rearm');
    await page.keyboard.press('Enter');
    await keyboardTo(page, '#confirm');
    await page.keyboard.press('Enter');
  } else {
    await f.click('rearm');
    await f.click('confirm');
  }
  await page.locator('#confirmation').waitFor({ state: 'hidden' });
  assert.equal(await txt(page, 'primary'), '再開');
}

export function registerBrowser(add, engine) {
  function scenario(id, run, options = {}) {
    add(id, async () => {
      if (!engine) throw new Error('Chromium did not start');
      const f = await setup(engine, options);
      try {
        const detail = await run(f);
        assert.deepEqual(f.errors, []);
        assert.deepEqual(f.outbound, []);
        return detail;
      } finally {
        await f.context.close();
      }
    }, 'Chromium');
  }

  scenario('R01-F01-USER-CHROMIUM', async f => {
    await record(f, 'R');
    await f.click('primary');
    await f.step('R');
    await f.click('pause');
    const { page } = f;
    const snapshot = async () => ({
      phase: await phase(page), tick: await logicalTick(page),
      player: await checkMarker(page, 'player'), ghost: await checkMarker(page, 'ghost'),
      action: await txt(page, 'primary')
    });
    const before = await snapshot();
    assert.deepEqual(before, { phase: 'REPLAYING', tick: '1', player: [2, 1], ghost: [2, 1], action: '再開' });
    for (const control of ['retry', 'rerecord']) {
      const button = page.locator('#' + control);
      assert.equal(await button.isDisabled(), true);
      await button.dispatchEvent('click');
      assert.deepEqual(await snapshot(), before);
    }
    await f.click('primary');
    assert.equal(await page.locator('#retry').isEnabled(), true);
    assert.equal(await page.locator('#rerecord').isEnabled(), true);
    await f.click('retry');
    assert.equal(await phase(page), 'RECORDED');
    await f.click('rerecord');
    assert.equal(await phase(page), 'RECORDING');
    return { paused: before, afterResume: await phase(page), tick: await logicalTick(page) };
  });

  for (const kind of ['REJECTED', 'ACCEPTED']) {
    scenario('R01-F02-' + kind + '-CANCEL-CHROMIUM', async f => {
      await ready(f);
      const { page } = f;
      const pointer = { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true };
      const right = page.locator('[data-direction="R"]');
      const left = page.locator('[data-direction="L"]');
      await right.dispatchEvent('pointerdown', pointer);
      await right.dispatchEvent('pointerup', pointer);
      if (kind === 'REJECTED') await page.keyboard.press('ArrowUp');
      await left.dispatchEvent('pointerdown', pointer);
      const notification = await txt(page, 'notice');
      if (kind === 'REJECTED') assert.match(notification, /満杯/);
      else assert.equal(notification, '');
      await left.dispatchEvent('pointercancel', pointer);
      const positions = [];
      for (let tick = 1; tick <= 3; tick++) {
        await f.tick();
        assert.equal(await logicalTick(page), String(tick));
        positions.push(await checkMarker(page, 'player'));
      }
      assert.deepEqual(positions, [[2, 1], [2, 1], [2, 1]]);
      return { kind, notification, positions };
    });
  }

  scenario('INP-13', async f => {
    await ready(f);
    const button = f.page.locator('[data-direction="R"]');
    await button.dispatchEvent('pointerdown', { pointerId: 1, button: 0, pointerType: 'touch' });
    await button.dispatchEvent('pointerup', { pointerId: 1, button: 0, pointerType: 'touch' });
    await button.dispatchEvent('click');
    await f.tick();
    assert.deepEqual(await checkMarker(f.page, 'player'), [2, 1]);
    await f.tick();
    assert.deepEqual(await checkMarker(f.page, 'player'), [2, 1]);
  });
  for (const id of ['INP-23', 'INP-26']) {
    scenario(id, async f => {
      const { page } = f;
      await ready(f);
      await page.keyboard.down('ArrowRight');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await txt(page, 'primary'), '再開');
      assert.equal(await logicalTick(page), '0');
      await page.keyboard.up('ArrowRight');
      await resetInput(f, id === 'INP-26');
      await page.clock.runFor(2000);
      assert.equal(await logicalTick(page), '0');
      if (id === 'INP-26') {
        await keyboardTo(page, '#primary');
        await page.keyboard.press('Enter');
      } else {
        await f.click('primary');
      }
      await page.clock.runFor(499);
      assert.equal(await logicalTick(page), '0');
      await page.clock.runFor(1);
      assert.equal(await logicalTick(page), '1');
      assert.deepEqual(await checkMarker(page, 'player'), [1, 1]);
    });
  }
  scenario('SAV-17', async f => {
    for (const goToSecondStep of [false, true]) {
      await f.click('reset-save');
      if (goToSecondStep) {
        await f.click('confirm');
        await f.page.locator('#confirm').filter({ hasText: '初期化を実行' }).waitFor();
      }
      await f.page.locator('#confirmation [value=cancel]').click();
      await f.page.locator('#confirmation').waitFor({ state: 'hidden' });
      assert.equal(await f.stored(), '{oops');
      assert.match(await txt(f.page, 'save-status'), /一時進捗/);
    }
    assert.deepEqual(await f.page.evaluate(() => observedWrites), []);
  }, { raw: '{oops', prepare: 'count-writes' });
  scenario('SAV-18', async f => {
    await f.click('reset-save');
    assert.match(await txt(f.page, 'confirm-description'), /別タブ/);
    assert.match(await txt(f.page, 'confirm-description'), /元には戻せません/);
    assert.equal(await f.stored(), '{oops');
    await f.click('confirm');
    await f.page.locator('#confirm').filter({ hasText: '初期化を実行' }).waitFor();
    assert.equal(await f.stored(), '{oops');
    await f.click('confirm');
    await f.page.getByText('保存データを初期化しました。', { exact: true }).waitFor();
    const empty = '{"schemaVersion":1,"stages":{}}';
    assert.equal(await f.stored(), empty);
    assert.deepEqual(await f.page.evaluate(() => observedWrites), [empty]);
    assert(await hidden(f.page, '#reset-save'));
  }, { raw: '{oops', prepare: 'count-writes' });
  const maliciousText = '<img src=x onerror=alert(1)>\n';
  scenario('SAV-22', async f => {
    const download = f.page.waitForEvent('download');
    await f.click('export-save');
    const file = await download;
    assert.equal(file.suggestedFilename(), 'game-0012-save.txt');
    assert.equal(await readFile(await file.path(), 'utf8'), maliciousText);
    assert.equal(await f.page.locator('img').count(), 0);
    assert.equal(await f.stored(), maliciousText);
    assert.equal(await f.page.evaluate(() => localStorage.getItem('other-game')), 'sentinel');
  }, { raw: maliciousText });

  scenario('UI-01', async f => {
    assert.equal(await f.page.title(), '時間の分身');
    assert.equal(await f.page.locator('[data-stage]').count(), 6);
  });
  scenario('UI-02', async f => {
    assert.equal(await f.page.locator('[data-stage="1"]').isEnabled(), true);
    assert.equal(await f.page.locator('[data-stage="2"]').isEnabled(), false);
    await play(f, 0);
    await f.click('return');
    assert.equal(await f.page.locator('[data-stage="2"]').isEnabled(), true);
    assert.equal(await f.page.locator('[data-stage="3"]').isEnabled(), false);
  });
  scenario('UI-03', async f => {
    await ready(f);
    assert.match(await txt(f.page, 'phase'), /記録中/);
    assert.match(await txt(f.page, 'turn'), /0 \/ 16/);
    await f.tick();
    assert.match(await txt(f.page, 'turn'), /1 \/ 16/);
  });
  scenario('UI-04', async f => {
    await record(f, 'RR');
    assert.match(await txt(f.page, 'guide'), /残り14枠は待機/);
    assert.equal(await f.page.locator('#timeline [data-padded]').count(), 14);
  });
  scenario('UI-05', async f => {
    await record(f, 'RR');
    await f.click('primary');
    assert.equal(await f.page.locator(at(1, 1) + ' .marker.player').count(), 1);
    assert.equal(await f.page.locator(at(1, 1) + ' .marker.ghost.overlap').count(), 1);
    const visuals = await f.page.locator('.marker').evaluateAll(elements => elements.map(e => {
      const css = getComputedStyle(e);
      return [css.borderStyle, css.backgroundColor, css.borderRadius];
    }));
    assert.notDeepEqual(visuals[0], visuals[1]);
  });
  scenario('UI-06', async f => {
    await ready(f);
    assert.match(await txt(f.page, 'mechanisms'), /a → D 閉/);
    await f.step('R');
    await f.step('R');
    assert.match(await txt(f.page, 'mechanisms'), /a → D 開/);
  });
  scenario('UI-07', async f => {
    await play(f, 2, 4);
    assert.match(await txt(f.page, 'notice'), /同期解錠/);
    assert.match(await txt(f.page, 'mechanisms'), /a＋b → L 開/);
  }, { level: 3 });
  scenario('UI-08', async f => {
    await record(f, 'RR.R');
    await f.click('primary');
    for (const action of 'RRRR') await f.step(action);
    const door = f.page.locator('[data-tile="D"]');
    assert.equal(await door.getAttribute('data-door'), 'HELD_OPEN');
    assert.match(await txt(f.page, 'mechanisms'), /閉鎖保留/);
    await f.step('R');
    assert.equal(await door.getAttribute('data-door'), 'CLOSED');
  });
  scenario('UI-09', async f => {
    await ready(f);
    await f.tick();
    await f.click('pause');
    await f.page.clock.runFor(10000);
    assert.equal(await logicalTick(f.page), '1');
    await f.click('primary');
    await f.tick();
    assert.equal(await logicalTick(f.page), '2');
  });
  scenario('UI-10', async f => {
    await play(f, 0, 2);
    assert.equal(await txt(f.page, 'retry'), '再挑戦');
    assert.equal(await txt(f.page, 'rerecord'), '再記録');
    await f.click('retry');
    assert.equal(await phase(f.page), 'RECORDED');
    assert.equal(await logicalTick(f.page), '2');
    await f.click('rerecord');
    assert.equal(await phase(f.page), 'RECORDING');
    assert.equal(await logicalTick(f.page), '0');
  });
  scenario('UI-11', async f => {
    await play(f, 5, 16);
    assert.match(await txt(f.page, 'guide'), /分身は16枠で消滅/);
    assert.match(await txt(f.page, 'phase'), /一人で続行/);
  }, { level: 5 });
  scenario('UI-12', async f => {
    await play(f, 0);
    assert.equal(await txt(f.page, 'stars'), '★★★');
    assert.match(await txt(f.page, 'moves'), /合計 8 手/);
    await f.click('next');
    assert.match(await txt(f.page, 'level-title'), /ステージ 2/);
  });
  scenario('UI-13', async f => {
    await ready(f);
    for (const dir of ['ArrowRight', 'ArrowUp', 'ArrowDown']) await f.page.keyboard.press(dir);
    assert.match(await txt(f.page, 'notice'), /満杯/);
    await f.tick();
    assert.deepEqual(await checkMarker(f.page, 'player'), [2, 1]);
  });
  scenario('UI-14', async f => {
    await ready(f);
    const sizes = await f.page.locator('#board, #directions button').evaluateAll(nodes => nodes.map(node => {
      const b = node.getBoundingClientRect();
      return [b.left, b.right, b.width, b.height];
    }));
    assert(sizes.every(([left, right]) => left >= 0 && right <= 320));
    assert(sizes.slice(1).every(([, , width, height]) => width >= 44 && height >= 44));
    const direction = f.page.locator('[data-direction=R]');
    await direction.tap();
    await f.tick();
    const { x, y } = golden[6].recordPositions[0];
    assert.deepEqual(await checkMarker(f.page, 'player'), [x + 1, y]);
  }, { level: 6, mobile: true });
  scenario('UI-15', async f => {
    await ready(f);
    await f.step('R', 'KeyD');
    assert.deepEqual(await checkMarker(f.page, 'player'), [2, 1]);
    await f.step('R', 'ArrowRight');
    assert.deepEqual(await checkMarker(f.page, 'player'), [3, 1]);
  });
  scenario('UI-16', async f => {
    await play(f, 0);
    assert.match(await txt(f.page, 'save-status'), /保存データを利用できません/);
    assert.match(await txt(f.page, 'save-status'), /一時進捗/);
    assert.equal(await f.stored(), defaultProgress(1));
  }, { prepare: 'deny-writes' });

  scenario('BROWSER-SAV-19', async f => {
    await f.click('reset-save');
    await f.click('confirm');
    await f.page.locator('#confirm').filter({ hasText: '初期化を実行' }).waitFor();
    const otherTab = await f.context.newPage();
    await otherTab.goto(engine.url);
    await otherTab.evaluate(key => localStorage.setItem(key, 'R2'), SAVE_KEY);
    await f.page.getByText('別タブで保存データが変更されたため', { exact: false }).waitFor();
    await f.page.locator('#confirmation').waitFor({ state: 'hidden' });
    assert.equal(await f.stored(), 'R2');
    assert.deepEqual(await f.page.evaluate(() => observedWrites), []);
  }, { raw: '{oops', prepare: 'count-writes' });
  scenario('BROWSER-LIVE-CLOCK', async f => {
    await ready(f);
    await f.page.keyboard.press('ArrowRight');
    await f.page.locator(at(2, 1) + ' .player').waitFor({ timeout: 3000 });
    await f.click('pause');
    const pausedTick = await logicalTick(f.page);
    await f.page.waitForTimeout(600);
    assert.equal(await logicalTick(f.page), pausedTick);
    assert.deepEqual(await checkMarker(f.page, 'player'), [2, 1]);
    return { clock: 'performance.now and browser timers', pauseTick: Number(pausedTick) };
  }, { virtual: false });

  for (const [index, c] of golden.entries()) {
    scenario('BROWSER-' + c.caseId, async f => {
      await play(f, index);
      const expected = c.replaySnapshots.at(-1);
      assert.match(await txt(f.page, 'moves'), new RegExp('合計 ' + expected.totalMoves + ' 手'));
      assert.equal(await f.page.locator('#result').isVisible(), true);
      const saved = JSON.parse(await f.stored());
      assert.equal(saved.stages[c.stage].minMoves, expected.totalMoves);
      await f.page.reload();
      assert.equal(await f.page.locator('[data-stage="' + c.stage + '"]').isEnabled(), true);
      if (c.stage < 6) assert.equal(await f.page.locator('[data-stage="' + (c.stage + 1) + '"]').isEnabled(), true);
      return { browserVersion: engine.browser.version(), stage: c.stage, phase: expected.gamePhase, replayTicks: expected.tick, moves: expected.totalMoves };
    }, { level: c.stage });
  }
}
