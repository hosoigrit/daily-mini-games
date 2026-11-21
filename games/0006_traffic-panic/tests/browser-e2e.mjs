import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createPreviewServer, PREFIX } from "./preview-server.mjs";
import { createPagesPreviewServer, PAGES_PREFIX } from "./pages-preview-server.mjs";

if (!process.argv[2]) throw new Error("Usage: node tests/browser-e2e.mjs <evidence-directory> [--pages]");
const pages = process.argv[3] === "--pages";
const evidence = resolve(process.argv[2]);
await mkdir(evidence, { recursive: true });
const temp = await realpath(tmpdir());
const profile = await mkdtemp(join(temp, "tp6-e3-chrome-"));
const chromePath = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "google-chrome");
const server = pages ? createPagesPreviewServer() : createPreviewServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const route = (pages ? PAGES_PREFIX.slice(0, -1) : "") + PREFIX;
const url = origin + route;
const chrome = spawn(chromePath, [
  "--headless=new", "--no-first-run", "--disable-background-networking",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
let startupError;
chrome.on("error", (error) => { startupError = error; });
let stderr = "";
chrome.stderr.on("data", (data) => { stderr = (stderr + data).slice(-3000); });
let socket;
const log = [];
const images = [];
const exceptions = [];
const responses = [];

function pass(id, message) {
  const line = `PASS ${id} ${message}`;
  log.push(line);
  console.log(line);
}

async function until(check, label, timeout = 8000) {
  const expires = Date.now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await sleep(35);
  } while (Date.now() < expires);
  throw new Error(`Timeout: ${label}`);
}

try {
  const endpoint = await until(async () => {
    if (startupError || chrome.exitCode !== null) throw startupError ?? new Error(stderr);
    const contents = await readFile(join(profile, "DevToolsActivePort"), "utf8").catch((error) => {
      if (!["ENOENT", "EBUSY"].includes(error.code)) throw error;
      return "";
    });
    const port = contents.split(/\r?\n/)[0];
    return /^\d+$/.test(port) && `http://127.0.0.1:${port}`;
  }, "Chrome DevToolsActivePort");
  const version = await fetch(`${endpoint}/json/version`).then((r) => r.json());
  log.push(`Browser: ${version.Browser}`, `Node: ${process.version}`, `Path: ${route}`);
  console.log(log[0]);
  const [page] = await fetch(`${endpoint}/json/list`).then((r) => r.json());
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await Promise.race([
    once(socket, "open"),
    sleep(5000, null, { ref: false }).then(() => { throw new Error("CDP connection timed out"); }),
  ]);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (pending.has(message.id)) pending.get(message.id)(message);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    if (message.method === "Network.responseReceived") responses.push(message.params.response);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 6000);
      pending.set(id, (message) => {
        pending.delete(id);
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const value = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  }
  async function load(url, selector = "#road-signals > g") {
    // Wait for a fresh document: the previous page can also be in READY state.
    await evaluate("globalThis.e3BeforeNavigation = true");
    const nav = await send("Page.navigate", { url });
    assert.equal(nav.errorText, undefined);
    await waitForDocument(selector);
  }
  async function waitForDocument(selector) {
    await until(async () => {
      try {
        return await evaluate("!globalThis.e3BeforeNavigation && document.readyState === 'complete' && !!document.querySelector(" + JSON.stringify(selector) + ")");
      } catch (error) {
        if (!/context|navigation/i.test(error.message)) throw error;
        return false;
      }
    }, "document loaded: " + selector);
  }
  const status = () => evaluate("document.querySelector('#game').dataset.status");
  const label = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
  const isDisabled = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).disabled`);
  const tick = (n = 1) => evaluate(`window.e3Test.advance(${n})`);
  async function point(id) {
    return evaluate(`(() => {
      const node = document.getElementById(${JSON.stringify(id)});
      node.scrollIntoView({ block: "nearest" });
      const r = node.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
  }
  async function click(id) {
    const p = await point(id);
    await send("Input.dispatchMouseEvent", { ...p, type: "mousePressed", button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { ...p, type: "mouseReleased", button: "left", clickCount: 1 });
  }
  async function key(key, code, windowsVirtualKeyCode) {
    const options = { key, code, windowsVirtualKeyCode };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...options });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...options });
  }
  async function touch(id) {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await point(id)] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async function viewport(width, height, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  }
  async function shot(name) {
    const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const file = `${name}.png`;
    await writeFile(join(evidence, file), Buffer.from(data, "base64"));
    images.push(file);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await viewport(1280, 850);
  if (pages) {
    await load(origin + PAGES_PREFIX, ".game-list");
    const links = await evaluate("Array.from(document.querySelectorAll('.game-list .game-link'), a => [a.getAttribute('href'), a.href, a.textContent.trim()])");
    assert.deepEqual(links.map(([href]) => href), [
      "./games/0001_target-tap/", "./games/0002_light-panels/", "./games/0003_30sec-survival/",
      "./games/0004_wobbly-tower/", "./games/0005_hitofude-delivery/", "./games/0006_traffic-panic/",
    ]);
    assert.equal(links.at(-1)[2], "Game 0006：交差点パニック");
    for (const [, target] of links.slice(0, -1)) assert.equal((await fetch(target)).status, 200);
    await shot("12-pages-index-1280");
    await evaluate("document.querySelector('.game-list li:last-child a').id = 'tested-game-link'; globalThis.e3BeforeNavigation = true");
    await click("tested-game-link");
    await waitForDocument("#road-signals > g");
    assert.equal(await evaluate("location.href"), url);
    pass("E5-E2E-01", "Pages index lists all six games, legacy links respond, actual click opens #0006 under /daily-mini-games/");
  } else {
    await load(url);
  }
  assert.equal(await status(), "READY");
  await shot("01-ready-1280");
  await click("traffic-guide-summary");
  assert.equal(await evaluate("document.getElementById('traffic-guide').open"), true);
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#traffic-guide-rows tr'), tr => Array.from(tr.cells, cell => cell.textContent))"), [
    ["0.0〜20.0秒", "1.3秒ごと", "50% / 50%"],
    ["20.0〜40.0秒", "1.0秒ごと", "30% / 70%"],
    ["40.0〜60.0秒", "0.7秒ごと", "70% / 30%"],
  ]);
  await shot("10-traffic-guide-1280");
  await evaluate("document.getElementById('traffic-guide-summary').focus()");
  await key("Enter", "Enter", 13);
  assert.equal(await status(), "READY", "Enter on summary must not start the game");
  pass("E3-E2E-13", "Traffic guide shows HARD-A Config values and summary Enter does not start");
  await click("start");
  assert.equal(await status(), "RUNNING");
  await until(async () => Number(await label("remaining")) < 60, "ordinary browser RAF");
  await click("pause");
  assert.equal(await status(), "PAUSED");
  log.push("Production page smoke: original Crypto, native RAF, mouse START and PAUSE.");

  // Deterministic browser-only setup injected before scripts; no hook exists in app assets.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    let seed = 0;
    let repeatedSeed = location.search === "?seed-repeat";
    crypto.getRandomValues = (array) => { array[0] = repeatedSeed ? 0 : seed++; return array; };
    const callbacks = new Map();
    let next = 0, now = -100;
    window.requestAnimationFrame = (fn) => { callbacks.set(++next, fn); return next; };
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
    window.e3Test = {
      restoreEntropy() { repeatedSeed = false; },
      advance(count) {
        for (let i = 0; i < count; i++) {
          now += 100;
          const nextFrame = Array.from(callbacks.values());
          callbacks.clear();
          nextFrame.forEach(fn => fn(now));
        }
      },
      setHidden(hidden) {
        Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
        document.dispatchEvent(new Event("visibilitychange"));
      }
    };
    if (location.search === "?storage-blocked") {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("", "SecurityError"); } });
    }
  })()` });
  await load(url);
  await key("Enter", "Enter", 13);
  assert.equal(await status(), "RUNNING");
  assert.equal(await label("remaining"), "60.0");
  assert.equal(await label("signal-label"), "東西 青");
  assert.equal(await evaluate("document.activeElement.id"), "north-south");
  pass("E3-E2E-01", "Title / keyboard START / tick 0 EW green");
  await tick(55);
  await shot("02-running-1280");

  await key("2", "Digit2", 50);
  await tick();
  assert.equal(await label("signal-label"), "東西 黄");
  assert.equal(await label("transition-time"), "切替まで 1.0 秒");
  assert.equal(await isDisabled("east-west"), true);
  assert.equal(await isDisabled("north-south"), true);
  await shot("03-yellow-1280");
  await tick(10);
  assert.match(await label("signal-label"), /^全赤/);
  assert.equal(await label("transition-time"), "切替まで 0.5 秒");
  await shot("04-all-red-1280");
  await key("1", "Digit1", 49);
  await tick(5);
  assert.equal(await label("signal-label"), "南北 青");
  await tick();
  assert.equal(await label("signal-label"), "南北 青");
  pass("E3-E2E-02", "Yellow 10 ticks then all red 5 ticks, no carry-over input");

  const frozen = () => evaluate(`["remaining", "score", "signal-label"].map(id => document.getElementById(id).textContent)
    .concat(Array.from(document.querySelectorAll(".queue strong"), node => node.textContent))`);
  const before = await frozen();
  await key("p", "KeyP", 80);
  assert.equal(await status(), "PAUSED");
  assert.equal(await evaluate("document.activeElement.id"), "resume");
  await shot("05-paused-1280");
  await tick(50);
  assert.deepEqual(await frozen(), before);
  await click("resume");
  await tick();
  assert.deepEqual(await frozen(), before);
  await tick();
  assert.notEqual((await frozen())[0], before[0]);
  pass("E3-E2E-03", "Paused values, modal focus and fresh resume baseline");

  const beforeHidden = await frozen();
  // Headless Chromium tab activation varies by platform; drive the visibility contract explicitly.
  await evaluate("e3Test.setHidden(true)");
  assert.equal(await status(), "PAUSED");
  assert.match(await label("pause-reason"), /非表示/);
  await tick(55);
  await evaluate("e3Test.setHidden(false)");
  assert.equal(await status(), "PAUSED");
  assert.deepEqual(await frozen(), beforeHidden);
  pass("E3-E2E-04", "Injected document.hidden / visibilitychange; stays paused on visible");

  await load(url);
  await click("start");
  await tick(449);
  assert.equal(await status(), "RUNNING");
  assert.equal(await evaluate("document.querySelector('[data-direction=N] strong').textContent"), "8");
  await tick();
  assert.equal(await status(), "FINISHED");
  assert.equal(await label("result-heading"), "GRIDLOCK");
  assert.match(await label("result-reason"), /北から9台目/);
  assert.equal(await label("final-score"), "280");
  assert.equal(await label("final-time"), "44.9 秒");
  assert.equal(await label("final-best-clear"), "—");
  assert.equal(await label("final-best-attempt"), "280");
  await shot("06-gridlock-1280");
  await click("retry");
  assert.equal(await status(), "READY");
  assert.equal(await label("best-attempt"), "280");
  pass("E3-E2E-05", "Seed 2001: ninth northern arrival at tick 449; retry returns to title");

  await load(url);
  await click("start");
  // Recorded input sequence for browser seed 2001, kept outside the shipped app.
  await tick(415);
  await key("2", "Digit2", 50);
  await tick(148);
  await key("1", "Digit1", 49);
  await tick(34);
  await key("2", "Digit2", 50);
  await tick(4);
  assert.equal(await label("result-heading"), "CLEAR");
  assert.equal(await label("final-time"), "60.0 秒");
  assert.equal(await label("final-score"), "490");
  assert.equal(await label("final-best-clear"), "490");
  assert.equal(await label("final-switches"), "3 回");
  await shot("07-clear-1280");
  await load(url);
  assert.equal(await label("best-clear"), "490");
  assert.equal(await label("best-attempt"), "490");
  pass("E3-E2E-06", "Seed 2001: input at 415 / 563 / 597, CLEAR at 600 in yellow; records reload");

  await load(`${url}?storage-blocked`);
  assert.match(await label("storage-warning"), /読み込めません/);
  await click("start");
  await tick(450);
  assert.equal(await label("result-heading"), "GRIDLOCK");
  assert.match(await label("result-storage-warning"), /保存できません/);
  assert.equal(await label("final-best-attempt"), "280");
  pass("E3-E2E-07", "Injected localStorage SecurityError; play, result and in-memory data work");

  for (const [width, height] of [[320, 650], [375, 812], [768, 900], [1280, 850], [667, 375]]) {
    await viewport(width, height, width <= 667);
    await load(url);
    const layout = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll(".queue, #start")];
      return nodes.every(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth;
      }) && document.documentElement.scrollWidth === innerWidth;
    })()`);
    assert.equal(layout, true, `title layout at ${width}×${height}`);
    if (width === 375) {
      await shot("08-ready-375");
      await touch("traffic-guide-summary");
      assert.equal(await evaluate("document.getElementById('traffic-guide').open"), true);
      assert.equal(await evaluate("document.documentElement.scrollWidth === innerWidth"), true);
      await shot("11-traffic-guide-375");
      await touch("traffic-guide-summary");
    }
    if (width <= 667) await touch("start");
    else await click("start");
    assert.equal(await status(), "RUNNING");
    const playLayout = await evaluate(`Array.from(document.querySelectorAll(".hud > div,.queue,.direction,#pause")).every(node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= innerWidth
        && (node.tagName !== "BUTTON" || r.height >= 44);
    })`);
    assert.equal(playLayout, true, `play layout at ${width}×${height}`);
    if (width === 375) {
      await tick(55);
      await shot("09-running-375");
      await touch("north-south");
      await tick();
      assert.equal(await label("signal-label"), "東西 黄");
    }
  }
  pass("E3-E2E-08", "CDP real mouse and key events, emulated touch, native dialog focus");
  pass("E3-E2E-09", "320 / 375 / 768 / 1280 widths and 667×375 landscape; no horizontal clipping");
  assert.ok(responses.some(({ url: loaded }) => loaded.endsWith("/ui/app.mjs")));
  assert.deepEqual(responses.filter(({ status }) => status >= 400).map(({ url }) => url), []);
  assert.ok(responses.every(({ url: loaded }) => loaded.startsWith(new URL(url).origin)));
  pass("E3-E2E-10", "Static subpath, no 4xx/5xx, same-origin assets");

  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await load(url);
  await touch("start");
  await tick(145);
  assert.ok(Number(await label("score")) > 0);
  assert.equal(await evaluate("document.getElementById('passing').children.length"), 0);
  pass("E3-E2E-11", "Reduced motion omits passing animation while scoring normally");
  assert.equal(images.length, pages ? 12 : 11);
  pass("E3-E2E-12", images.join(", "));

  await viewport(1280, 850);
  await load(url + "?seed-repeat");
  await click("start");
  await click("pause");
  await click("pause-retry");
  assert.equal(await status(), "ERROR");
  assert.match(await label("result-heading"), /技術的問題による停止/);
  assert.equal(JSON.parse(await label("fault-code")).code, "PLAY_SEED_UNAVAILABLE");
  await shot("13-seed-retry-fallback-1280");
  await evaluate("e3Test.restoreEntropy()");
  await click("retry");
  assert.equal(await status(), "READY");
  await click("start");
  assert.equal(await status(), "RUNNING");
  pass("E5-E2E-02", "E3-L02 constant RNG shows recoverable technical error; restored source permits a new game");

  if (pages) {
    const runtimePaths = new Set(responses.map(({ url }) => new URL(url).pathname));
    assert.ok(runtimePaths.has(route + "ui/play-config.mjs"));
    assert.equal(Array.from(runtimePaths).filter((path) => /\/(simulation|holdout|tests)\//.test(path)).length, 0);
    assert.deepEqual(responses.filter(({ status }) => status >= 400).map(({ url }) => url), []);
    assert.ok(responses.every(({ url }) => new URL(url).origin === origin));
    pass("E5-E2E-03", "Pages copy resolves the HARD-A browser module with same-origin requests and no 4xx/5xx or experiment imports");
  }
  assert.deepEqual(exceptions, []);
} catch (error) {
  log.push(`FAIL ${error.stack}`);
  throw error;
} finally {
  socket?.close();
  server.close();
  if (chrome.pid && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([once(chrome, "exit"), sleep(3000)]);
  }
  const exact = await realpath(profile);
  assert.equal(dirname(exact), temp);
  assert.match(basename(exact), /^tp6-e3-chrome-/);
  await rm(exact, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
  await writeFile(join(evidence, "browser-e2e.log"), log.join("\n") + "\n");
}
