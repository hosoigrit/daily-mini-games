import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const browserName = process.argv[2] ?? "chrome";
const gameUrl = process.argv[3] ?? "http://127.0.0.1:4173/";
const evidenceDirectory = path.resolve(
  process.argv[4] ?? "../../reports/0001_target-tap_browser-evidence",
);
const browserExecutables = {
  chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  edge: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
};
const viewportCases = [
  { name: "320x568", width: 320, height: 568, mobile: true },
  { name: "375x667", width: 375, height: 667, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "568x320", width: 568, height: 320, mobile: true },
  { name: "1280x720", width: 1280, height: 720, mobile: false },
];

const executable = browserExecutables[browserName];
if (!executable) {
  throw new Error(`Unsupported browser: ${browserName}`);
}

await mkdir(evidenceDirectory, { recursive: true });
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), `game0001-${browserName}-`));
let browserProcess;
let client;

async function run() {
try {
  const debugInfo = await launchBrowser(executable, profileDirectory);
  browserProcess = debugInfo.process;
  const pageTarget = await findPageTarget(debugInfo.port);
  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: gameUrl });
  await waitForPageReady(client);

  const initial = await evaluate(client, pageSummaryExpression());
  assert.equal(initial.title, "ターゲットタップ | Daily Mini Games");
  assert.equal(initial.phase, "ready");
  assert.equal(initial.score, 0);
  assert.equal(initial.targetCount, 0);
  assert.equal(initial.horizontalOverflow, false);
  await verifyViewportMatrix(client, browserName, "ready");

  await evaluate(client, "document.querySelector('#start-button').click(); true");
  await delay(100);
  let playing = await evaluate(client, pageSummaryExpression());
  assert.equal(playing.phase, "playing");
  assert.equal(playing.score, 0);
  assert.equal(playing.targetCount, 1);
  assert.ok(Math.abs(playing.target.width - 64) < 0.01);
  assert.ok(Math.abs(playing.target.height - 64) < 0.01);

  for (let index = 0; index < 5; index += 1) {
    await clickTargetWithMouse(client);
  }
  playing = await evaluate(client, pageSummaryExpression());
  assert.equal(playing.score, 5);

  await clickPlayfieldMiss(client);
  assert.equal((await evaluate(client, pageSummaryExpression())).score, 5);

  await focusTarget(client);
  await pressKey(client, "Enter", "Enter", 13);
  assert.equal((await evaluate(client, pageSummaryExpression())).score, 6);

  await focusTarget(client);
  await pressKey(client, " ", "Space", 32);
  assert.equal((await evaluate(client, pageSummaryExpression())).score, 7);

  await focusTarget(client);
  await holdKeyWithRepeats(client, " ", "Space", 32);
  assert.equal((await evaluate(client, pageSummaryExpression())).score, 8);

  await tapTarget(client);
  assert.equal((await evaluate(client, pageSummaryExpression())).score, 9);

  const beforeResize = await evaluate(client, pageSummaryExpression());
  await verifyViewportMatrix(client, browserName, "playing");

  const afterResize = await evaluate(client, pageSummaryExpression());
  assert.equal(afterResize.score, beforeResize.score);
  assert.ok(afterResize.remaining <= beforeResize.remaining);

  await delay(30_500);
  const result = await evaluate(client, pageSummaryExpression());
  assert.equal(result.phase, "result");
  assert.equal(result.score, 9);
  assert.equal(result.finalScore, 9);
  assert.equal(result.bestScore, 9);
  assert.equal(result.targetCount, 0);
  assert.equal(result.remaining, 0);
  await verifyViewportMatrix(client, browserName, "result");

  await evaluate(client, "document.querySelector('#replay-button').click(); true");
  await delay(100);
  const replay = await evaluate(client, pageSummaryExpression());
  assert.equal(replay.phase, "playing");
  assert.equal(replay.score, 0);
  assert.equal(replay.bestScore, 9);
  assert.equal(replay.targetCount, 1);

  await client.send("Page.reload", { ignoreCache: true });
  await waitForPageReady(client);
  const reloaded = await evaluate(client, pageSummaryExpression());
  assert.equal(reloaded.phase, "ready");
  assert.equal(reloaded.score, 0);
  assert.equal(reloaded.bestScore, 9);
  assert.equal(reloaded.targetCount, 0);

  const blockedStorageScript = await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Access denied", "SecurityError"); }
    });`,
  });
  await client.send("Page.reload", { ignoreCache: true });
  await waitForPageReady(client);
  const blockedStorageReady = await evaluate(client, pageSummaryExpression());
  assert.equal(blockedStorageReady.phase, "ready");
  assert.equal(blockedStorageReady.bestScore, 0);
  assert.match(blockedStorageReady.readyNotice, /保存できません/);
  await evaluate(client, "document.querySelector('#start-button').click(); true");
  await delay(100);
  await clickTargetWithMouse(client);
  assert.equal((await evaluate(client, pageSummaryExpression())).score, 1);
  await client.send("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: blockedStorageScript.identifier,
  });

  console.log(JSON.stringify({
    browser: browserName,
    status: "PASS",
    assertions: [
      "READY initial state",
      "mouse hit x5 and miss",
      "Enter and Space",
      "Space hold repeat guard",
      "touch tap",
      "READY/PLAYING/RESULT at five responsive viewports",
      "rotation state preservation",
      "30 second RESULT transition",
      "replay reset",
      "best score reload",
      "localStorage property SecurityError fallback",
    ],
    scoreAtResult: result.score,
    evidenceDirectory,
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

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        resolve(message.result);
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

  const debugUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Browser launch timeout: ${stderr}`)), 15_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ url: match[1], port: Number(match[2]) });
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

  return { process: child, ...debugUrl };
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

async function waitForPageReady(cdp) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(cdp, "document.readyState === 'complete' && Boolean(document.querySelector('#start-button'))");
    if (ready) {
      return;
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
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

async function verifyViewportMatrix(cdp, currentBrowser, expectedPhase) {
  for (const viewport of viewportCases) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenOrientation: viewport.width > viewport.height
        ? { type: "landscapePrimary", angle: 90 }
        : { type: "portraitPrimary", angle: 0 },
    });
    await delay(100);
    const summary = await evaluate(cdp, pageSummaryExpression());
    const context = `${currentBrowser} ${expectedPhase} ${viewport.name}: ${JSON.stringify(summary)}`;
    assert.equal(summary.phase, expectedPhase, context);
    assert.equal(summary.horizontalOverflow, false, context);
    assert.equal(summary.majorUiVisible, true, context);
    assert.equal(summary.primaryActionUsable, true, context);

    if (expectedPhase === "playing") {
      assert.equal(summary.score, 9, context);
      assert.equal(summary.targetCount, 1, context);
      assert.ok(Math.abs(summary.target.width - 64) < 0.01, context);
      assert.ok(Math.abs(summary.target.height - 64) < 0.01, context);
      assert.equal(summary.targetInsidePlayfield, true, context);
    }

    await captureScreenshot(cdp, `${currentBrowser}-${expectedPhase}-${viewport.name}.jpg`);
  }
}

async function focusTarget(cdp) {
  await evaluate(cdp, "document.querySelector('#target-button').focus(); true");
}

async function pressKey(cdp, key, code, virtualKeyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    autoRepeat: false,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
  await delay(40);
}

async function holdKeyWithRepeats(cdp, key, code, virtualKeyCode) {
  for (const autoRepeat of [false, true, true]) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      autoRepeat,
    });
  }
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
  await delay(40);
}

async function clickTargetWithMouse(cdp) {
  const point = await evaluate(cdp, centerExpression("#target-button"));
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await delay(30);
}

async function clickPlayfieldMiss(cdp) {
  const point = await evaluate(cdp, `(() => {
    const field = document.querySelector('#playfield').getBoundingClientRect();
    const target = document.querySelector('#target-button').getBoundingClientRect();
    const candidates = [
      [field.left + 5, field.top + 5],
      [field.right - 5, field.top + 5],
      [field.left + 5, field.bottom - 5],
      [field.right - 5, field.bottom - 5]
    ];
    const outside = candidates.find(([x, y]) => x < target.left || x > target.right || y < target.top || y > target.bottom);
    return { x: outside[0], y: outside[1] };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await delay(30);
}

async function tapTarget(cdp) {
  const point = await evaluate(cdp, centerExpression("#target-button"));
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(100);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
}

async function captureScreenshot(cdp, filename) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: 70,
    fromSurface: true,
  });
  await writeFile(path.join(evidenceDirectory, filename), Buffer.from(result.data, "base64"));
}

function centerExpression(selector) {
  return `(() => { const rect = document.querySelector('${selector}').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`;
}

function pageSummaryExpression() {
  return `(() => {
    const ready = document.querySelector('#ready-screen');
    const play = document.querySelector('#play-screen');
    const result = document.querySelector('#result-screen');
    const target = document.querySelector('#target-button');
    const field = document.querySelector('#playfield');
    const targetRect = target.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const phase = !ready.hidden ? 'ready' : !play.hidden ? 'playing' : 'result';
    const requiredSelectors = phase === 'ready'
      ? ['#game-title', '#ready-best-score', '#start-button']
      : phase === 'playing'
        ? ['#score-value', '#time-value', '#playfield', '#target-button']
        : ['#result-title', '#final-score', '#result-best-score', '#replay-button'];
    const requiredRects = requiredSelectors.map((selector) => document.querySelector(selector).getBoundingClientRect());
    const rectIsUsable = (rect) => (
      rect.width > 0 && rect.height > 0 &&
      rect.left >= -0.5 && rect.top >= -0.5 &&
      rect.right <= window.innerWidth + 0.5 && rect.bottom <= window.innerHeight + 0.5
    );
    const primaryAction = document.querySelector(
      phase === 'ready' ? '#start-button' : phase === 'playing' ? '#target-button' : '#replay-button'
    ).getBoundingClientRect();
    return {
      title: document.title,
      phase,
      score: Number(document.querySelector('#score-value').textContent),
      remaining: Number(document.querySelector('#time-value').textContent),
      finalScore: Number(document.querySelector('#final-score').textContent),
      bestScore: Number((phase === 'ready' ? document.querySelector('#ready-best-score') : document.querySelector('#result-best-score')).textContent),
      readyNotice: document.querySelector('#ready-notice').textContent,
      targetCount: phase === 'playing' && targetRect.width > 0 ? 1 : 0,
      target: { width: targetRect.width, height: targetRect.height },
      targetInsidePlayfield: phase !== 'playing' || (
        targetRect.left >= fieldRect.left - 0.5 && targetRect.top >= fieldRect.top - 0.5 &&
        targetRect.right <= fieldRect.right + 0.5 && targetRect.bottom <= fieldRect.bottom + 0.5
      ),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      majorUiVisible: requiredRects.every(rectIsUsable),
      primaryActionUsable: rectIsUsable(primaryAction)
    };
  })()`;
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
