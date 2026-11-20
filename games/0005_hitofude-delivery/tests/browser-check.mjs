import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPreviewServer } from "./preview-server.mjs";

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(join(tmpdir(), "game0005-chrome-"));
const debugPort = Number(process.env.DEBUGGING_PORT || 9227);
const gameRoot = process.env.GAME_ROOT
  ? resolve(process.env.GAME_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const reportDirectory = process.env.EVIDENCE_DIRECTORY
  ? resolve(process.env.EVIDENCE_DIRECTORY)
  : fileURLToPath(new URL("../../../reports/0005_hitofude-delivery/", import.meta.url));
await mkdir(reportDirectory, { recursive: true });

const server = createPreviewServer(gameRoot);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
const gameUrl = `http://127.0.0.1:${port}/games/0005_hitofude-delivery/`;

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

try {
  await waitForDebugger();
  const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(gameUrl)}`, { method: "PUT" }).then((response) => response.json());
  const client = createClient(created.webSocketDebuggerUrl);
  await client.opened;
  const exceptions = [];
  const requests = [];
  client.on("Runtime.exceptionThrown", (event) => exceptions.push(event.params.exceptionDetails.text));
  client.on("Network.requestWillBeSent", (event) => requests.push(event.params.request.url));
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.send("Page.navigate", { url: gameUrl });
  await client.waitFor("Page.loadEventFired");
  await delay(100);

  const initial = await evaluate(client, `({
    title: document.title,
    titleVisible: !document.querySelector('#title-screen').hidden,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  })`);
  assert(initial.title.includes("ひとふで配達"), "document title");
  assert(initial.titleVisible, "title screen visible");
  assert(initial.scrollWidth <= initial.width, "mobile title has no horizontal overflow");

  await click(client, "#start-button");
  await delay(50);
  const stageSelect = await evaluate(client, `({
    visible: !document.querySelector('#stage-screen').hidden,
    cardCount: document.querySelectorAll('.stage-card').length,
    stage1Enabled: !document.querySelector('[data-stage-id="1"]').disabled,
    stage2Locked: document.querySelector('[data-stage-id="2"]').disabled,
  })`);
  assert(stageSelect.visible && stageSelect.cardCount === 6 && stageSelect.stage1Enabled, "UI-01 title to stage select");
  assert(stageSelect.stage2Locked, "UI-02 locked stage cannot start");
  await screenshot(client, "chrome-stage-select-390x844.png");

  await click(client, '[data-stage-id="1"]');
  await click(client, "#hint-button");
  await delay(30);
  const hintVisible = await evaluate(client, `({
    highlighted: document.querySelectorAll('.cell.hint').length,
    score: document.querySelector('#score-value').textContent,
    hints: document.querySelector('#hint-value').textContent,
    message: document.querySelector('#play-message').textContent,
  })`);
  assert(hintVisible.highlighted === 1 && hintVisible.score === "900" && hintVisible.hints === "1/2", "IR-0005-04 hint is highlighted immediately");
  await delay(2600);
  const hintExpired = await evaluate(client, `({
    highlighted: document.querySelectorAll('.cell.hint').length,
    score: document.querySelector('#score-value').textContent,
    hints: document.querySelector('#hint-value').textContent,
    message: document.querySelector('#play-message').textContent,
  })`);
  assert(hintExpired.highlighted === 0, "IR-0005-04 hint highlight expires after 2.5 seconds");
  assert(hintExpired.score === hintVisible.score && hintExpired.hints === hintVisible.hints && hintExpired.message === hintVisible.message, "IR-0005-04 expiry changes no game state or direction message");
  await clickCell(client, 0, 1);
  await click(client, "#undo-button");
  const playState = await evaluate(client, `({
    visible: !document.querySelector('#play-screen').hidden,
    score: document.querySelector('#score-value').textContent,
    parcels: document.querySelector('#parcel-value').textContent,
    hints: document.querySelector('#hint-value').textContent,
    routeCells: document.querySelectorAll('.cell.route').length,
    boardTouchAction: getComputedStyle(document.querySelector('#board')).touchAction,
  })`);
  assert(playState.visible, "play screen visible");
  assert(playState.score === "850" && playState.parcels === "0/1" && playState.hints === "1/2", "UI-03 HUD matches move, hint, undo");
  assert(playState.routeCells === 1 && playState.boardTouchAction === "none", "UI-03 route and touch action");
  await screenshot(client, "chrome-play-390x844.png");

  await clickCell(client, 0, 1);
  for (const [row, col] of [[0, 2], [1, 2], [2, 2], [2, 3], [3, 3]]) await clickCell(client, row, col);
  await delay(40);
  const result = await evaluate(client, `({
    visible: !document.querySelector('#result-screen').hidden,
    score: document.querySelector('#result-score').textContent,
    label: document.querySelector('#result-label').textContent,
    stars: document.querySelector('#result-stars').getAttribute('aria-label'),
    best: document.querySelector('#best-message').textContent,
    nextAvailable: !document.querySelector('#next-button').hidden && !document.querySelector('#next-button').disabled,
    storageWarningHidden: document.querySelector('#result-storage-warning').hidden,
  })`);
  assert(result.visible && result.score === "850" && result.label === "GOOD" && result.stars === "星2", "UI-04 result values");
  assert(result.best.includes("自己ベスト") && result.nextAvailable, "UI-04 best and next-stage action");
  assert(result.storageWarningHidden, "IR-0005-03 successful save shows no warning");
  await screenshot(client, "chrome-result-390x844.png");

  await click(client, "#retry-button");
  await clickCell(client, 0, 1);
  await click(client, "#hint-button");
  await delay(30);
  assert(await evaluate(client, `document.querySelectorAll('.cell.hint').length === 1`), "IR-0005-04 second challenge shows a hint before screen switch");
  await evaluate(client, "window.confirm = () => true");
  await click(client, "#exit-button");
  await click(client, '[data-stage-id="1"]');
  const retried = await evaluate(client, `({
    score: document.querySelector('#score-value').textContent,
    routeCells: document.querySelectorAll('.cell.route').length,
    best: JSON.parse(localStorage.getItem('daily-mini-games.0005.progress.v1')).bestScores['1'],
    stage2Unlocked: JSON.parse(localStorage.getItem('daily-mini-games.0005.progress.v1')).unlockedStage >= 2,
  })`);
  assert(retried.score === "1000" && retried.routeCells === 1, "UI-05 retry and re-entry start fresh");
  assert(retried.best === 850 && retried.stage2Unlocked, "UI-05 best and unlock survive exit");
  await delay(2600);
  const afterStaleHintTimer = await evaluate(client, `({
    score: document.querySelector('#score-value').textContent,
    hints: document.querySelector('#hint-value').textContent,
    routeCells: document.querySelectorAll('.cell.route').length,
    highlighted: document.querySelectorAll('.cell.hint').length,
  })`);
  assert(afterStaleHintTimer.score === "1000" && afterStaleHintTimer.hints === "2/2" && afterStaleHintTimer.routeCells === 1 && afterStaleHintTimer.highlighted === 0, "IR-0005-04 stale timer cannot affect a new challenge");

  await evaluate(client, `(() => {
    globalThis.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemFailure() { throw new DOMException('Denied', 'SecurityError'); };
  })()`);
  for (const [row, col] of [[0, 1], [0, 2], [1, 2], [2, 2], [2, 3], [3, 3]]) await clickCell(client, row, col);
  await delay(40);
  const failedSaveResult = await evaluate(client, `({
    warningVisible: !document.querySelector('#result-storage-warning').hidden,
    warning: document.querySelector('#result-storage-warning').textContent,
    best: document.querySelector('#best-message').textContent,
    nextAvailable: !document.querySelector('#next-button').hidden && !document.querySelector('#next-button').disabled,
    total: document.querySelector('#total-score').textContent,
  })`);
  assert(failedSaveResult.warningVisible && failedSaveResult.warning.includes('再読み込み後'), "IR-0005-03 failed save warns immediately on result screen");
  assert(failedSaveResult.best.includes('自己ベスト') && failedSaveResult.nextAvailable && failedSaveResult.total.includes('1000'), "IR-0005-03 session best and unlock remain available");
  await screenshot(client, "chrome-result-storage-warning-390x844.png");

  const loaded = client.waitFor("Page.loadEventFired");
  await evaluate(client, `(() => {
    Storage.prototype.setItem = globalThis.__originalStorageSetItem;
    localStorage.setItem('daily-mini-games.0005.progress.v1', JSON.stringify({
      version: 1,
      unlockedStage: 6,
      bestScores: { 1: 850, 2: 850, 3: 850, 4: 850, 5: 850, 6: null },
    }));
    location.reload();
  })()`);
  await loaded;
  const reloadedToStageSelect = await evaluate(client, `!document.querySelector('#stage-screen').hidden`);
  assert(reloadedToStageSelect, "reload returns to stage selection without restoring a play route");
  await click(client, '[data-stage-id="6"]');

  const viewports = [];
  for (const viewport of [{ width: 320, height: 568, mobile: true }, { width: 1280, height: 720, mobile: false }]) {
    await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
    await delay(40);
    const layout = await evaluate(client, `({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      boardWidth: document.querySelector('#board').getBoundingClientRect().width,
      minCell: Math.min(...[...document.querySelectorAll('.cell')].map((cell) => cell.getBoundingClientRect().width)),
    })`);
    assert(layout.scrollWidth <= layout.innerWidth, `${viewport.width}px has no horizontal overflow`);
    assert(layout.boardWidth <= layout.innerWidth, `${viewport.width}px board fits viewport`);
    assert(layout.minCell >= 44, `${viewport.width}px cells remain at least 44px`);
    viewports.push({ viewport, ...layout });
  }

  await click(client, "#exit-button");
  await click(client, '[data-stage-id="3"]');
  for (const [row, col] of [[1, 0], [1, 1], [0, 1]]) await clickCell(client, row, col);
  const deadEndUi = await evaluate(client, `({
    message: document.querySelector('#play-message').textContent,
    score: document.querySelector('#score-value').textContent,
    routeCells: document.querySelectorAll('.cell.route').length,
  })`);
  assert(deadEndUi.message.includes('これ以上進めません') && deadEndUi.score === '1000' && deadEndUi.routeCells === 4, "IR-0005-02 dead end is announced without state penalty");

  assert(exceptions.length === 0, `runtime exceptions: ${exceptions.join(", ")}`);
  const externalRequests = requests.filter((url) => !url.startsWith(`http://127.0.0.1:${port}/`) && !url.startsWith("data:"));
  assert(externalRequests.length === 0, `unexpected external requests: ${externalRequests.join(", ")}`);

  console.log(JSON.stringify({
    result: "PASS",
    url: gameUrl,
    cases: ["UI-01", "UI-02", "UI-03", "UI-04", "UI-05", "IR-0005-02", "IR-0005-03", "IR-0005-04"],
    initial,
    stageSelect,
    playState,
    resultScreen: result,
    retried,
    afterStaleHintTimer,
    hintVisible,
    hintExpired,
    failedSaveResult,
    deadEndUi,
    viewports,
    runtimeExceptions: exceptions.length,
    externalRequests: externalRequests.length,
    evidence: [
      join(reportDirectory, "chrome-stage-select-390x844.png"),
      join(reportDirectory, "chrome-play-390x844.png"),
      join(reportDirectory, "chrome-result-390x844.png"),
      join(reportDirectory, "chrome-result-storage-warning-390x844.png"),
    ],
  }, null, 2));
  client.close();
} finally {
  chrome.kill();
  await new Promise((resolve) => server.close(resolve));
}

async function click(client, selector) {
  const clicked = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `click ${selector}`);
  await delay(10);
}

async function clickCell(client, row, col) {
  return click(client, `.cell[data-row="${row}"][data-col="${col}"]`);
}

async function screenshot(client, filename) {
  const result = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(reportDirectory, filename), Buffer.from(result.data, "base64"));
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

function createClient(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id) {
      const handler = pending.get(data.id);
      if (!handler) return;
      pending.delete(data.id);
      if (data.error) handler.reject(new Error(data.error.message));
      else handler.resolve(data.result);
      return;
    }
    for (const listener of listeners.get(data.method) || []) listener(data);
  });
  return {
    opened,
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, listener) {
      const current = listeners.get(method) || [];
      current.push(listener);
      listeners.set(method, current);
    },
    waitFor(method) {
      return new Promise((resolve) => {
        const once = (event) => {
          const current = listeners.get(method) || [];
          listeners.set(method, current.filter((listener) => listener !== once));
          resolve(event);
        };
        const current = listeners.get(method) || [];
        current.push(once);
        listeners.set(method, current);
      });
    },
    close() { socket.close(); },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

function assert(condition, label) {
  if (!condition) throw new Error(`Browser check failed: ${label}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

