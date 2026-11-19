import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const gameUrl = process.argv[2] || process.env.GAME_URL || "http://127.0.0.1:4176";
const debuggingPort = Number(process.env.DEBUGGING_PORT || 9226);
const root = fileURLToPath(new URL("../", import.meta.url));
const screenshotPath = join(root, "evidence-mobile-emulation.png");
const pcScreenshotPath = join(root, "evidence-pc.png");
const settlingScreenshotPath = join(root, "evidence-normal-settling.png");
const pausedMissScreenshotPath = join(root, "evidence-miss-paused.png");
const profile = await mkdtemp(join(tmpdir(), "game0004-chrome-"));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

try {
  await waitForDebugger();
  const created = await fetch(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(gameUrl)}`,
    { method: "PUT" },
  ).then((response) => response.json());
  const client = createClient(created.webSocketDebuggerUrl);
  await client.opened;

  const exceptions = [];
  client.on("Runtime.exceptionThrown", (event) => exceptions.push(event.params.exceptionDetails.text));
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.navigate", { url: gameUrl });
  await client.waitFor("Page.loadEventFired");
  await delay(250);

  const initial = await evaluate(client, `({
    title: document.title,
    innerWidth,
    innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    canvasWidth: document.querySelector('#game-canvas').getBoundingClientRect().width,
    startVisible: !document.querySelector('[data-action="start"]').hidden,
  })`);
  assert(initial.title.includes("ぐらぐらタワー"), "title");
  assert(initial.innerWidth === 390, "390px emulated viewport");
  assert(initial.scrollWidth <= initial.innerWidth, "no horizontal overflow");
  assert(initial.canvasWidth <= initial.innerWidth, "canvas fits viewport");
  assert(initial.startVisible, "start button visible");

  const mobileStartStable = await touchHold(client, '[data-action="start"]', 150);
  assert(mobileStartStable, "start button remains connected during touch hold");
  await delay(80);
  const started = await evaluate(client, `({
    overlayHidden: document.querySelector('#game-overlay').hidden,
    floor: document.querySelector('#floor-value').textContent,
    score: document.querySelector('#score-value').textContent,
  })`);
  assert(started.overlayHidden, "start hides title overlay");
  assert(started.floor === "0/10", "start floor");
  assert(started.score === "0", "start score");

  await touchHold(client, "#game-canvas", 60, false);
  await delay(100);
  const settling = await evaluate(client, `({
    floor: document.querySelector('#floor-value').textContent,
    status: document.querySelector('#status-message').textContent,
  })`);
  assert(settling.floor === "1/10", "normal landing updates floor during settling");
  assert(settling.status === "着地成功", "normal settling feedback remains visible");
  const settlingScreenshot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(settlingScreenshotPath, Buffer.from(settlingScreenshot.data, "base64"));
  const pauseStable = await touchHold(client, "#pause-button", 30);
  assert(pauseStable, "pause button remains connected during touch hold");
  await delay(50);
  const paused = await evaluate(client, `({
    text: document.querySelector('#game-overlay').textContent,
    hidden: document.querySelector('#game-overlay').hidden,
  })`);
  assert(!paused.hidden && paused.text.includes("一時停止中"), "pause overlay");
  const resumeStable = await touchHold(client, '[data-action="resume"]', 150);
  assert(resumeStable, "resume button remains connected during touch hold");
  await delay(50);
  assert(await evaluate(client, `document.querySelector('#game-overlay').hidden`), "resume hides overlay");
  await delay(100);
  const landed = await evaluate(client, `({
    floor: document.querySelector('#floor-value').textContent,
    score: Number(document.querySelector('#score-value').textContent.replaceAll(',', '')),
  })`);
  assert(landed.floor === "1/10", "pointer landing advances one floor");
  assert(landed.score >= 100, "pointer landing scores");

  await touchHold(client, "#game-canvas", 60, false);
  await delay(100);
  assert(
    await evaluate(client, `document.querySelector('#status-message').textContent === 'MISS'`),
    "MISS settling feedback remains visible",
  );
  const missPauseStable = await touchHold(client, "#pause-button", 30);
  assert(missPauseStable, "MISS settling pause button remains connected during touch hold");
  await delay(50);
  const pausedMissScreenshot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(pausedMissScreenshotPath, Buffer.from(pausedMissScreenshot.data, "base64"));
  const missResumeStable = await touchHold(client, '[data-action="resume"]', 150);
  assert(missResumeStable, "MISS settling resume button remains connected during touch hold");
  await delay(100);
  assert(
    await evaluate(client, `document.querySelector('#game-overlay').textContent.includes('GAME OVER')`),
    "second immediate drop reaches GAME OVER",
  );
  const retryStable = await touchHold(client, '[data-action="retry"]', 150);
  assert(retryStable, "retry button remains connected during touch hold");
  await delay(80);
  const retried = await evaluate(client, `({
    overlayHidden: document.querySelector('#game-overlay').hidden,
    floor: document.querySelector('#floor-value').textContent,
    score: document.querySelector('#score-value').textContent,
  })`);
  assert(retried.overlayHidden && retried.floor === "0/10" && retried.score === "0", "retry starts a fresh game");

  const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Page.navigate", { url: gameUrl });
  await client.waitFor("Page.loadEventFired");
  await delay(200);
  const pcStartStable = await mouseHold(client, '[data-action="start"]', 150);
  assert(pcStartStable, "start button remains connected during mouse hold");
  await delay(80);
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await delay(550);
  const pcLanded = await evaluate(client, `({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    floor: document.querySelector('#floor-value').textContent,
    score: Number(document.querySelector('#score-value').textContent.replaceAll(',', '')),
  })`);
  assert(pcLanded.innerWidth === 1280, "PC viewport");
  assert(pcLanded.scrollWidth <= pcLanded.innerWidth, "PC no horizontal overflow");
  assert(pcLanded.floor === "1/10", "Space landing advances one floor");
  assert(pcLanded.score >= 100, "Space landing scores");

  const pcPauseStable = await mouseHold(client, "#pause-button", 150);
  assert(pcPauseStable, "pause button remains connected during mouse hold");
  await delay(50);
  assert(await focusWithTab(client, '[data-action="resume"]'), "Tab focuses resume button");
  await pressKey(client, " ", "Space", 32);
  await delay(50);
  assert(await evaluate(client, `document.querySelector('#game-overlay').hidden`), "Space resumes game");
  const pcScreenshot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(pcScreenshotPath, Buffer.from(pcScreenshot.data, "base64"));
  assert(exceptions.length === 0, `runtime exceptions: ${exceptions.join(", ")}`);

  console.log(JSON.stringify({
    result: "PASS",
    viewport: `${initial.innerWidth}x${initial.innerHeight}`,
    scrollWidth: initial.scrollWidth,
    canvasWidth: initial.canvasWidth,
    landed,
    touchButtons: {
      start: mobileStartStable,
      settlingPause: pauseStable,
      settlingResume: resumeStable,
      missPause: missPauseStable,
      missResume: missResumeStable,
      retry: retryStable,
    },
    retry: retried,
    pcSpaceLanding: pcLanded,
    mouseAndKeyboard: { start: pcStartStable, pause: pcPauseStable, tabSpaceResume: true },
    runtimeExceptions: exceptions.length,
    screenshotPath,
    pcScreenshotPath,
    settlingScreenshotPath,
    pausedMissScreenshotPath,
  }, null, 2));
  client.close();
} finally {
  chrome.kill();
}

async function touchHold(client, selector, holdMilliseconds, checkIdentity = true) {
  const point = await elementCenter(client, selector);
  if (checkIdentity) {
    await evaluate(client, `globalThis.__heldControl = document.querySelector(${JSON.stringify(selector)})`);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await delay(holdMilliseconds);
  const stable = checkIdentity
    ? await evaluate(client, `globalThis.__heldControl?.isConnected === true && globalThis.__heldControl === document.querySelector(${JSON.stringify(selector)})`)
    : true;
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return stable;
}

async function mouseHold(client, selector, holdMilliseconds) {
  const point = await elementCenter(client, selector);
  await evaluate(client, `globalThis.__heldControl = document.querySelector(${JSON.stringify(selector)})`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await delay(holdMilliseconds);
  const stable = await evaluate(client, `globalThis.__heldControl?.isConnected === true && globalThis.__heldControl === document.querySelector(${JSON.stringify(selector)})`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  return stable;
}

async function elementCenter(client, selector) {
  const rect = await evaluate(client, `(() => {
    const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  return rect;
}

async function focusWithTab(client, selector) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await pressKey(client, "Tab", "Tab", 9);
    if (await evaluate(client, `document.activeElement === document.querySelector(${JSON.stringify(selector)})`)) {
      return true;
    }
  }
  return false;
}

async function pressKey(client, key, code, virtualKeyCode) {
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
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
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

function assert(condition, label) {
  if (!condition) throw new Error(`Browser check failed: ${label}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
