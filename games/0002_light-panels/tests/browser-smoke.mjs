import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const browserName = process.argv[2];
const gameUrl = process.argv[3] ?? "http://127.0.0.1:4174/games/0002_light-panels/index.html";
const browserExecutables = {
  chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  edge: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
};
const viewportCases = [
  { width: 320, height: 568, mobile: true },
  { width: 375, height: 667, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 568, height: 320, mobile: true },
  { width: 1280, height: 720, mobile: false },
];
const knownSolutions = {
  2: [[0, 0], [2, 2]],
  3: [[0, 1], [1, 0], [2, 2]],
  4: [[1, 1], [2, 2], [0, 3]],
  5: [[0, 0], [0, 3], [3, 0], [3, 3]],
  6: [[0, 1], [1, 3], [2, 0], [3, 2], [1, 1], [2, 2]],
};

if (!browserExecutables[browserName]) {
  throw new Error(`Usage: node browser-smoke.mjs <chrome|edge> [url]`);
}

async function run() {
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), `game0002-${browserName}-`));
let browserProcess;
let client;

try {
  const launched = await launchBrowser(browserExecutables[browserName], profileDirectory);
  browserProcess = launched.process;
  const pageTarget = await findPageTarget(launched.port);
  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");

  const runtimeErrors = [];
  const resourceErrors = [];
  client.on("Runtime.exceptionThrown", (params) => runtimeErrors.push(params.exceptionDetails?.text ?? "Runtime exception"));
  client.on("Log.entryAdded", (params) => {
    if (["error", "warning"].includes(params.entry?.level)) {
      runtimeErrors.push(params.entry.text);
    }
  });
  client.on("Network.loadingFailed", (params) => {
    if (!params.canceled) {
      resourceErrors.push(`${params.type}: ${params.errorText}`);
    }
  });
  client.on("Network.responseReceived", (params) => {
    if (params.response?.status >= 400) {
      resourceErrors.push(`${params.response.status}: ${params.response.url}`);
    }
  });

  await client.send("Page.navigate", { url: gameUrl });
  await waitForReady(client);
  await evaluate(client, "localStorage.clear(); location.reload(); true");
  await waitForReady(client);

  const browserVersion = await client.send("Browser.getVersion");
  const initial = await summary(client);
  assert.equal(initial.title, "ひかりのパネル | Daily Mini Games");
  assert.equal(initial.screen, "title");
  assert.equal(initial.horizontalOverflow, false);

  const errorScreens = await verifyErrorScreenScenarios(client);
  assert.deepEqual(errorScreens, {
    "ERR-01": { screen: "ERROR", visibleScreen: "ERROR", errorTitle: "ゲームを読み込めません" },
    "ERR-02": { screen: "ERROR", visibleScreen: "ERROR", errorTitle: "ゲームを読み込めません" },
    "ERR-03": { screen: "ERROR", visibleScreen: "ERROR", errorTitle: "ゲームを読み込めません" },
    "ERR-04": { screen: "ERROR", visibleScreen: "ERROR", errorTitle: "ゲームを読み込めません" },
    "ERR-05": { screen: "TITLE", visibleScreen: "TITLE", errorTitle: "ゲームを読み込めません" },
  });

  await click(client, "#open-select-button");
  const locks = await evaluate(client, `[...document.querySelectorAll('.stage-button')].map((button) => button.disabled)`);
  assert.deepEqual(locks, [false, true, true, true, true, true]);
  await click(client, "#select-back-button");

  await verifyTitleViewports(client);
  await clearFocus(client);
  await pressKey(client, "Tab");
  assert.equal(await activeElement(client), "start-button");
  await pressKey(client, "Enter");
  let playing = await summary(client);
  assert.equal(playing.panelCount, 9);
  assert.equal(playing.boardRole, null);
  assert.equal(playing.nativePanelSemantics, true);

  for (let index = 0; index < 4; index += 1) {
    await pressKey(client, "Tab");
  }
  assert.equal(await activeElement(client), "panel-1-1");
  await pressKey(client, "Space");
  let result = await summary(client);
  assert.equal(result.screen, "cleared");
  assert.equal(result.resultMoves, 1);

  await click(client, "#next-button");
  assert.equal(await activeElement(client), "panel-0-0");
  await pressAndRepeatEnter(client);
  assert.equal((await summary(client)).moves, 1);
  await clickPanel(client, 2, 2);
  result = await summary(client);
  assert.equal(result.screen, "cleared");
  assert.equal(result.resultMoves, 2);

  await click(client, "#next-button");
  await clickPanel(client, 0, 0);
  assert.equal((await summary(client)).moves, 1);
  await click(client, "#play-select-button");
  await click(client, 'button[data-stage-id="3"]');
  assert.equal((await summary(client)).moves, 0);
  await clickPanel(client, 0, 0);
  await click(client, "#restart-button");
  assert.equal((await summary(client)).moves, 0);
  await clickPanel(client, 0, 0);
  await client.send("Page.reload", { ignoreCache: true });
  await waitForReady(client);
  assert.equal((await summary(client)).screen, "title");
  await click(client, "#start-button");
  assert.equal((await summary(client)).moves, 0);
  assert.equal((await summary(client)).stage, "03");
  await solveCurrentStage(client, knownSolutions[3]);

  for (const stageId of [4, 5, 6]) {
    await click(client, "#next-button");
    if (stageId === 4) {
      await verifyPlayingViewports(client);
    }
    await solveCurrentStage(client, knownSolutions[stageId]);
  }

  result = await summary(client);
  assert.equal(result.screen, "all-cleared");
  assert.equal(result.resultMoves, 6);
  assert.equal(result.resultBest, 6);

  await click(client, "#all-select-button");
  const completedStages = await evaluate(client, `[...document.querySelectorAll('.stage-button')].map((button) => ({ disabled: button.disabled, text: button.innerText }))`);
  assert.equal(completedStages.every((stage) => !stage.disabled), true);
  assert.equal(completedStages.every((stage) => /自己ベスト/.test(stage.text)), true);

  await client.send("Page.reload", { ignoreCache: true });
  await waitForReady(client);
  const reloaded = await summary(client);
  assert.equal(reloaded.screen, "title");
  assert.equal(reloaded.startText, "ステージ一覧へ");
  assert.match(reloaded.progressSummary, /全6ステージ制覇済み/);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(resourceErrors, []);

  console.log(JSON.stringify({
    browser: browserName,
    product: browserVersion.product,
    userAgent: browserVersion.userAgent,
    status: "PASS",
    checks: [
      "initial title and S01-only unlock",
      "ERR-01 through ERR-04 display the user-facing ERROR screen",
      "ERR-05 approved stages start normally",
      "real Tab and Enter start activation",
      "real Space panel activation and S01 clear",
      "real Enter repeat guard on S02",
      "native button semantics without grid/gridcell roles",
      "restart resets board attempt",
      "S01-S06 progression and all-clear",
      "best moves and reload persistence",
      "320x568, 375x667, 390x844, 568x320, 1280x720",
      "4x4 cells at least 44 CSS px and no horizontal overflow",
      "no runtime warnings or errors",
      "no failed, missing, or HTTP error resources",
    ],
  }, null, 2));
} finally {
  client?.close();
  if (browserProcess && browserProcess.exitCode === null) {
    const exited = new Promise((resolve) => browserProcess.once("exit", resolve));
    browserProcess.kill();
    await Promise.race([exited, delay(2_000)]);
  }
  await removeTemporaryProfile(profileDirectory);
}
}

async function verifyTitleViewports(cdp) {
  for (const viewport of viewportCases) {
    await setViewport(cdp, viewport);
    const state = await summary(cdp);
    assert.equal(state.screen, "title", JSON.stringify(viewport));
    assert.equal(state.horizontalOverflow, false, JSON.stringify(viewport));
    assert.ok(state.primaryHeight >= 44, JSON.stringify(viewport));
  }
}

async function verifyPlayingViewports(cdp) {
  for (const viewport of viewportCases) {
    await setViewport(cdp, viewport);
    const state = await summary(cdp);
    assert.equal(state.screen, "playing", JSON.stringify(viewport));
    assert.equal(state.panelCount, 16, JSON.stringify(viewport));
    assert.equal(state.horizontalOverflow, false, JSON.stringify(viewport));
    assert.ok(state.minPanelWidth >= 44, JSON.stringify(viewport));
    assert.ok(state.minPanelHeight >= 44, JSON.stringify(viewport));
  }
}

async function verifyErrorScreenScenarios(cdp) {
  return evaluate(cdp, `(async () => {
    const stageModule = await import('./stages.mjs');
    const gameLogicModule = await import('./game-logic.mjs');
    const gameModule = await import('./game.js');
    const screenElements = {
      TITLE: document.querySelector('#title-screen'),
      SELECT: document.querySelector('#select-screen'),
      PLAYING: document.querySelector('#play-screen'),
      CLEARED: document.querySelector('#cleared-screen'),
      ALL_CLEARED: document.querySelector('#all-cleared-screen'),
      ERROR: document.querySelector('#error-screen'),
    };
    const approved = () => stageModule.STAGES.map((stage) => ({
      id: stage.id,
      size: stage.size,
      rows: stage.board.map((row) => row.join('')),
    }));

    const invalidCell = approved();
    invalidCell[0].rows[0] = '210';
    const missingRows = approved();
    delete missingRows[0].rows;
    const invalidShape = approved();
    invalidShape[0].rows = ['010', '111'];
    const cases = {
      'ERR-01': invalidCell,
      'ERR-02': missingRows,
      'ERR-03': invalidShape,
      'ERR-04': approved().slice(0, 5),
      'ERR-05': approved(),
    };

    const results = {};
    for (const [id, definitions] of Object.entries(cases)) {
      const stages = stageModule.createStageCollection(definitions);
      const screen = gameLogicModule.resolveInitialScreen(
        stageModule.validateStageCollection(stages),
      );
      gameModule.setVisibleScreen(screen, screenElements);
      const visible = Object.entries(screenElements)
        .filter(([, element]) => !element.hidden)
        .map(([name]) => name);
      results[id] = {
        screen,
        visibleScreen: visible.length === 1 ? visible[0] : visible.join(','),
        errorTitle: document.querySelector('#error-title').textContent,
      };
    }

    gameModule.setVisibleScreen(
      gameLogicModule.resolveInitialScreen(
        stageModule.validateStageCollection(stageModule.STAGES),
      ),
      screenElements,
    );
    return results;
  })()`);
}

async function setViewport(cdp, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenOrientation: viewport.width > viewport.height
      ? { type: "landscapePrimary", angle: 90 }
      : { type: "portraitPrimary", angle: 0 },
  });
  await delay(40);
}

async function solveCurrentStage(cdp, solution) {
  for (const [row, column] of solution) {
    await clickPanel(cdp, row, column);
  }
}

async function clickPanel(cdp, row, column) {
  await click(cdp, `[data-row="${row}"][data-column="${column}"]`);
}

async function click(cdp, selector) {
  const clicked = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
  assert.equal(clicked, true, `Missing element: ${selector}`);
}

async function focus(cdp, selector) {
  const focused = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.focus(); return document.activeElement === element; })()`);
  assert.equal(focused, true, `Could not focus: ${selector}`);
}

async function clearFocus(cdp) {
  const cleared = await evaluate(cdp, `(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute('tabindex');
    return document.activeElement === document.body;
  })()`);
  assert.equal(cleared, true, "Could not reset keyboard focus");
}

async function activeElement(cdp) {
  return evaluate(cdp, `(() => {
    const element = document.activeElement;
    if (!element) return null;
    if (element.classList.contains('panel-cell')) {
      return 'panel-' + element.dataset.row + '-' + element.dataset.column;
    }
    return element.id || element.tagName.toLowerCase();
  })()`);
}

async function pressKey(cdp, keyName) {
  const keys = {
    Tab: { key: "Tab", code: "Tab", virtualKeyCode: 9 },
    Enter: { key: "Enter", code: "Enter", virtualKeyCode: 13, text: "\r" },
    Space: { key: " ", code: "Space", virtualKeyCode: 32, text: " " },
  };
  const key = keys[keyName];
  assert.ok(key, `Unsupported key: ${keyName}`);
  await dispatchKeyDown(cdp, key, false);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.virtualKeyCode,
    nativeVirtualKeyCode: key.virtualKeyCode,
  });
  await delay(40);
}

async function dispatchKeyDown(cdp, key, autoRepeat) {
  const params = {
    type: "keyDown",
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.virtualKeyCode,
    nativeVirtualKeyCode: key.virtualKeyCode,
    autoRepeat,
  };
  if (key.text !== undefined) {
    params.text = key.text;
    params.unmodifiedText = key.text;
  }
  await cdp.send("Input.dispatchKeyEvent", params);
}

async function pressAndRepeatEnter(cdp) {
  const enter = { key: "Enter", code: "Enter", virtualKeyCode: 13, text: "\r" };
  await dispatchKeyDown(cdp, enter, false);
  await dispatchKeyDown(cdp, enter, true);
  await dispatchKeyDown(cdp, enter, true);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: enter.key,
    code: enter.code,
    windowsVirtualKeyCode: enter.virtualKeyCode,
    nativeVirtualKeyCode: enter.virtualKeyCode,
  });
  await delay(40);
}

async function summary(cdp) {
  return evaluate(cdp, `(() => {
    const screen = !document.querySelector('#title-screen').hidden ? 'title'
      : !document.querySelector('#select-screen').hidden ? 'select'
        : !document.querySelector('#play-screen').hidden ? 'playing'
          : !document.querySelector('#cleared-screen').hidden ? 'cleared'
            : !document.querySelector('#all-cleared-screen').hidden ? 'all-cleared'
              : 'error';
    const panels = [...document.querySelectorAll('.panel-cell')];
    const panelRects = panels.map((panel) => panel.getBoundingClientRect());
    const primary = document.querySelector(screen === 'title' ? '#start-button' : screen === 'playing' ? '.panel-cell' : screen === 'cleared' ? '#next-button' : '#all-select-button');
    const primaryRect = primary?.getBoundingClientRect() ?? { height: 0 };
    return {
      title: document.title,
      screen,
      moves: Number(document.querySelector('#move-count').textContent),
      stage: document.querySelector('#stage-number').textContent,
      resultMoves: Number(screen === 'all-cleared' ? document.querySelector('#final-stage-moves').textContent : document.querySelector('#cleared-moves').textContent),
      resultBest: Number(screen === 'all-cleared' ? document.querySelector('#final-stage-best').textContent : document.querySelector('#cleared-best').textContent),
      panelCount: panels.length,
      boardRole: document.querySelector('#board').getAttribute('role'),
      nativePanelSemantics: panels.every((panel) => panel.tagName === 'BUTTON'
        && panel.getAttribute('role') === null
        && /^(true|false)$/.test(panel.getAttribute('aria-pressed') ?? '')
        && /^行[0-9]+ 列[0-9]+：(点灯|消灯)$/.test(panel.getAttribute('aria-label') ?? '')),
      minPanelWidth: panelRects.length ? Math.min(...panelRects.map((rect) => rect.width)) : 0,
      minPanelHeight: panelRects.length ? Math.min(...panelRects.map((rect) => rect.height)) : 0,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      primaryHeight: primaryRect.height,
      startText: document.querySelector('#start-button').textContent,
      progressSummary: document.querySelector('#progress-summary').textContent,
    };
  })()`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(`${message.error.code}: ${message.error.message}`));
        } else {
          resolve(message.result);
        }
        return;
      }
      if (message.method && this.handlers.has(message.method)) {
        for (const handler of this.handlers.get(message.method)) {
          handler(message.params);
        }
      }
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  close() {
    this.socket?.close();
  }
}

async function launchBrowser(browserPath, userDataDirectory) {
  const child = spawn(browserPath, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const debugInfo = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Browser launch timeout: ${stderr}`)), 15_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ port: Number(match[2]) });
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (code !== null && !stderr.includes("DevTools listening")) {
        clearTimeout(timeout);
        reject(new Error(`Browser exited with ${code}: ${stderr}`));
      }
    });
  });

  return { process: child, ...debugInfo };
}

async function findPageTarget(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) {
        return page;
      }
    } catch {
      // Browser endpoint may not be ready yet.
    }
    await delay(100);
  }
  throw new Error("No debuggable page target found");
}

async function waitForReady(cdp) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(cdp, "document.readyState === 'complete' && Boolean(document.querySelector('#start-button'))");
      if (ready) {
        return;
      }
    } catch {
      // Navigation may still be replacing the execution context.
    }
    await delay(50);
  }
  throw new Error("Game page did not become ready");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function removeTemporaryProfile(directory) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        console.warn(`Temporary browser profile could not be removed: ${error.message}`);
        return;
      }
      await delay(200 * attempt);
    }
  }
}

await run();
