import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createPreviewServer } from "../../0005_hitofude-delivery/tests/preview-server.mjs";

const [engine = "chromium", evidence] = process.argv.slice(2);
const channel = { chrome: "chrome", edge: "msedge" }[engine];
assert.ok(["chromium", "chrome", "edge", "webkit"].includes(engine), "Unknown browser");
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const executablePath = process.env.BROWSER_EXECUTABLE;
const fixture = JSON.parse(await readFile(new URL("./fixtures/06_scenario_matrix_v0.4.json", import.meta.url)));
const { scenarios, settings } = fixture;
const paths = [
  [[4, 6], [3, 3], [5, 5], [4, 3], [5, 8]],
  [[4, 6], [5, 5], [3, 3], [5, 6], [5, 7]],
  [[4, 6], [5, 8], [5, 5], [5, 8], [3, 4]],
  [[4, 6], [5, 6], [3, 3], [4, 6], [5, 7]],
  [[3, 3], [4, 5], [5, 6], [5, 6], [5, 6]],
  [[5, 6], [4, 3], [3, 3], [5, 5], [5, 6]],
];

const server = createPreviewServer(fileURLToPath(new URL("../", import.meta.url)));
let browser;
let origin;
before(async () => {
  if (evidence) await mkdir(evidence, { recursive: true });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright[engine === "webkit" ? "webkit" : "chromium"].launch({ executablePath, channel });
  console.log(`${engine} ${browser.version()} | Node ${process.version}`);
});
after(async () => {
  try { await browser?.close(); } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

function browserCase(name, expected, verify, options) {
  test(name, { timeout: 90000 }, async (t) => {
    t.diagnostic(`Expected: ${expected}`);
    const page = await browser.newPage(options);
    page.setDefaultTimeout(5000);
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (!request.url().startsWith(origin + "/")) external.push(request.url());
    });
    try {
      const actual = await verify(page);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      t.diagnostic(`Actual: ${actual}`);
    } finally {
      await page.close();
    }
  });
}

const action = (page, type) => page.locator(`[data-action="${type}"]`);
const click = (page, type) => action(page, type).click();
const key = (id, version = "rules-v3") => `daily-mini-games:0007:best-profit:${version}:${id}`;
const saved = (page, id, version) => page.evaluate((name) => localStorage.getItem(name), key(id, version));
const setSaved = (page, id, value, version) => page.evaluate(([name, value]) => localStorage.setItem(name, value), [key(id, version), value]);
const metric = (page, label) => page.locator(".metrics div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd").innerText();
const dayText = (page) => page.locator("header .week-id").innerText();
const headingFocused = (page) => page.locator("main h1").evaluate((el) => el === document.activeElement);
const clamp = (value) => Math.max(0, Math.min(12, value));

async function phase(page, value) {
  await page.locator(`main[data-phase="${value}"]`).waitFor();
}

async function load(page) {
  await page.goto(origin);
  await phase(page, "TITLE");
}

async function start(page, id = "W01") {
  await page.locator(`#week-${id}`).check();
  await phase(page, "TITLE");
  await click(page, "START");
  await phase(page, "PLAN");
}

async function choose(page, price, amount) {
  await page.locator(`#price-${price}`).check();
  await page.locator("#bake-count").selectOption(String(amount));
}

async function finish(page, route = []) {
  for (let day = 0; day < 5; day++) {
    if (route[day]) await choose(page, ...route[day]);
    await click(page, "OPEN_SHOP");
    await click(page, day === 4 ? "SHOW_FINAL" : "NEXT_DAY");
  }
  await phase(page, "FINAL");
}

async function assertDay(page, week, index) {
  const day = week.days[index];
  assert.equal(await dayText(page), `${week.id} ${week.name} · ${index + 1} / 5 日目`);
  assert.match(await page.locator(".summary").innerText(), new RegExp(`${day.weather}\\s+基礎客数 ${day.baseDemand} 人`));
  for (const price of settings.prices) {
    const adjusted = day.baseDemand - settings.weatherPricePenalties[day.weather][price];
    const label = page.locator("label.choice").filter({ has: page.locator(`#price-${price}`) });
    assert.match(await label.innerText(), new RegExp(`予報 ${clamp(adjusted - 2)}〜${clamp(adjusted + 2)} 人`));
  }
  assert.doesNotMatch(await page.locator("main").innerText(), /需要変動|実際の客数|実需要/);
  assert.match(await page.locator(".muted").innerText(), /客数を保証するものではありません/);
}

browserCase("E3-T01 title and scenario selection", "Six weekly cards and exact thresholds; selection stays on TITLE until START.", async (page) => {
  await load(page);
  assert.equal(await page.locator('input[name="week"]:checked').inputValue(), "W01");
  assert.deepEqual(await page.locator('input[name="week"]').evaluateAll((inputs) => inputs.map(({ value }) => value)), scenarios.map(({ id }) => id));
  assert.match(await page.locator(".hero").innerText(), /5営業日/);
  for (const week of scenarios) {
    const card = page.locator(".week-card").filter({ has: page.locator(`#week-${week.id}`) });
    const { star1, star2, star3 } = week.starThresholds;
    assert.match(await card.innerText(), new RegExp(`星1 ${star1}・星2 ${star2}・星3 ${star3} コイン`));
    await start(page, week.id);
    await assertDay(page, week, 0);
    assert.equal(await page.locator('input[name="week"]').count(), 0);
    await click(page, "REQUEST_ABORT");
    await click(page, "CONFIRM_ABORT");
  }
  return "All six fixtures matched, including the selected day-one weather and forecasts.";
});

browserCase("E3-T02 planning and sales", "Correct forecasts, quantities, budget, zero warning and day-one trade totals.", async (page) => {
  await load(page);
  await start(page);
  await assertDay(page, scenarios[0], 0);
  assert.deepEqual(await page.locator("#bake-count option").evaluateAll((nodes) => nodes.map((node) => Number(node.value))), Array.from({ length: 13 }, (_, n) => n));
  assert.match(await page.locator("#zero-warning").innerText(), /売上0コイン.*取り消せません/);
  await choose(page, 4, 6);
  assert.equal(await page.locator("#zero-warning").count(), 0);
  await click(page, "OPEN_SHOP");
  for (const [label, value] of Object.entries({ 実際の客数: "6 人", 販売数: "6 個", 売れ残り: "0 個", 売上: "24 コイン", 原価: "12 コイン", 当日利益: "12 コイン" })) {
    assert.equal(await metric(page, label), value);
  }
  assert.match(await page.locator(".cash").innerText(), /42 コイン/);
  await click(page, "REQUEST_ABORT");
  await click(page, "CONFIRM_ABORT");
  await start(page, "W05");
  await choose(page, 5, 12);
  await click(page, "OPEN_SHOP");
  assert.equal(await metric(page, "売れ残り"), "12 個");
  await click(page, "NEXT_DAY");
  assert.deepEqual(await page.locator("#bake-count option").evaluateAll((nodes) => nodes.map((node) => node.value)), ["0", "1", "2", "3"]);
  await click(page, "OPEN_SHOP");
  assert.equal(await metric(page, "売上"), "0 コイン");
  await click(page, "NEXT_DAY");
  assert.match(await dayText(page), /3 \/ 5/);
  return "W01 earned 12 on day one; W05 had 6 coins and offered only 0–3 loaves. Zero bake advanced.";
});

async function injectActions(page, types) {
  await page.evaluate((actions) => {
    const probe = document.createElement("button");
    probe.type = "button";
    document.body.append(probe);
    try {
      for (const type of actions) {
        probe.dataset.action = type;
        probe.click();
      }
    } finally { probe.remove(); }
  }, types);
}

browserCase("E3-T03 duplicate events", "Pointer double click, rapid touch and repeated delegated actions settle one trade and advance one day.", async (page) => {
  for (const mode of ["pointer", "touch", "synthetic"]) {
    await load(page);
    await start(page);
    await choose(page, 4, 6);
    const open = action(page, "OPEN_SHOP");
    await open.scrollIntoViewIfNeeded();
    const { x, y, width, height } = await open.boundingBox();
    if (mode === "pointer") await page.mouse.dblclick(x + width / 2, y + height / 2);
    if (mode === "touch") {
      await page.touchscreen.tap(x + width / 2, y + height / 2);
      await page.touchscreen.tap(x + width / 2, y + height / 2);
    }
    if (mode === "synthetic") await injectActions(page, ["OPEN_SHOP", "OPEN_SHOP"]);
    await phase(page, "DAY_RESULT");
    assert.match(await page.locator(".cash").innerText(), /42 コイン/);
    await injectActions(page, ["NEXT_DAY", "NEXT_DAY"]);
    assert.match(await dayText(page), /2 \/ 5/);
    for (let day = 2; day <= 5; day++) {
      await click(page, "OPEN_SHOP");
      await click(page, day === 5 ? "SHOW_FINAL" : "NEXT_DAY");
    }
    assert.deepEqual(await page.locator("tbody th").allTextContents(), ["1日目", "2日目", "3日目", "4日目", "5日目"]);
    assert.match(await page.locator(".summary").innerText(), /12 コイン/);
  }
  return "All three repeat patterns ended with five unique dates and 12 total profit.";
}, { viewport: { width: 375, height: 850 }, hasTouch: true });

for (const [index, week] of scenarios.entries()) {
  browserCase(`E3-T04 ${week.id} optimal five-day run`, `Five ordered rows, profit ${week.verifiedMaxProfit}, three stars, retry resets.`, async (page) => {
    await load(page);
    await start(page, week.id);
    let cash = 30;
    const expectedHistory = [];
    for (const [dayIndex, [price, amount]] of paths[index].entries()) {
      await assertDay(page, week, dayIndex);
      await choose(page, price, amount);
      await click(page, "OPEN_SHOP");
      const day = week.days[dayIndex];
      const demand = clamp(day.baseDemand + day.demandDelta - settings.weatherPricePenalties[day.weather][price]);
      const profit = Math.min(amount, demand) * price - amount * 2;
      cash += profit;
      assert.equal(await metric(page, "実際の客数"), `${demand} 人`);
      assert.equal(await metric(page, "当日利益"), `${profit} コイン`);
      assert.match(await page.locator(".cash").innerText(), new RegExp(`${cash} コイン`));
      expectedHistory.push([`${dayIndex + 1}日目`, day.weather, `${demand} 人`, `${profit} コイン`]);
      if (dayIndex === 4) assert.equal(await action(page, "NEXT_DAY").count(), 0);
      await click(page, dayIndex === 4 ? "SHOW_FINAL" : "NEXT_DAY");
    }
    assert.deepEqual(await page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent))), expectedHistory);
    assert.equal(cash - 30, week.verifiedMaxProfit);
    assert.match(await page.locator(".summary").innerText(), new RegExp(`${cash - 30} コイン[\\s\\S]*星 3 / 3・大繁盛`));
    await click(page, "RETRY_SAME_WEEK");
    assert.match(await dayText(page), new RegExp(`${week.id}.*1 / 5`));
    assert.match(await page.locator(".summary").innerText(), /30 コイン/);
    assert.equal(await page.locator("#price-4").isChecked(), true);
    assert.equal(await page.locator("#bake-count").inputValue(), "0");
    await finish(page);
    await click(page, "CHOOSE_WEEK");
    assert.equal(await page.locator("#week-W01").isChecked(), true);
    const other = scenarios[(index + 1) % scenarios.length].id;
    await start(page, other);
    assert.match(await dayText(page), new RegExp(other));
    return `${week.id}: ${cash - 30} coins, three stars, five rows; retry and ${other} start verified.`;
  });
}

browserCase("E3-T05 native localStorage", "Negative first score, improved best, tie/lower preserved, distinct keys, corruption repair, reload and abort.", async (page) => {
  await load(page);
  await setSaved(page, "W01", "60", "rules-v2");
  await page.reload();
  assert.match(await page.locator(".week-card").first().innerText(), /未挑戦/);
  await start(page);
  await finish(page, [[5, 12]]);
  assert.equal(await saved(page, "W01"), "-4");
  await click(page, "RETRY_SAME_WEEK");
  await finish(page, [[4, 6]]);
  assert.equal(await saved(page, "W01"), "12");
  for (const route of [[[4, 6]], []]) {
    await click(page, "RETRY_SAME_WEEK");
    await finish(page, route);
    assert.match(await page.locator(".notice").innerText(), /自己ベストを維持/);
    assert.equal(await saved(page, "W01"), "12");
  }
  await setSaved(page, "W03", "NaN");
  await click(page, "CHOOSE_WEEK");
  assert.match(await page.locator(".week-card").nth(2).innerText(), /記録破損/);
  await start(page, "W03");
  await finish(page);
  assert.equal(await saved(page, "W03"), "0");
  assert.equal(await saved(page, "W01"), "12");
  assert.equal(await saved(page, "W01", "rules-v2"), "60");
  await click(page, "RETRY_SAME_WEEK");
  await click(page, "REQUEST_ABORT");
  await click(page, "CONFIRM_ABORT");
  await start(page, "W03");
  await click(page, "OPEN_SHOP");
  await page.reload();
  await phase(page, "TITLE");
  assert.equal(await page.locator("#week-W01").isChecked(), true);
  assert.equal(await saved(page, "W03"), "0");
  return "Native storage kept W01=12, W03=0 and rules-v2 W01=60; no save on abort/reload.";
});

for (const mode of ["read", "write"]) {
  browserCase(`E3-T05 ${mode} denial injection`, "Complete play, show failure without success; stored old value protected.", async (page) => {
    await page.addInitScript(({ mode, name }) => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      set.call(localStorage, name, "-3");
      window.attempts = 0;
      window.rawBest = () => get.call(localStorage, name);
      Storage.prototype.getItem = function (id) {
        if (mode === "read" && id === name) throw new DOMException("Blocked", "SecurityError");
        return get.call(this, id);
      };
      Storage.prototype.setItem = function (id, value) {
        if (id === name) {
          window.attempts++;
          if (mode === "write") throw new DOMException("Full", "QuotaExceededError");
        }
        return set.call(this, id, value);
      };
    }, { mode, name: key("W01") });
    await load(page);
    await start(page);
    await finish(page, [[4, 6]]);
    assert.match(await page.locator(".notice").innerText(), /今回の結果は保存されていません/);
    assert.equal(await page.getByText("自己ベストを保存しました。", { exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => [window.rawBest(), window.attempts]), ["-3", mode === "read" ? 0 : 1]);
    assert.match(await page.getByText("保存済み自己ベスト").innerText(), mode === "read" ? /記録を確認できません/ : /-3 コイン/);
    return `${mode} exception displayed correctly; original -3 retained.`;
  });
}

for (const screen of ["PLAN", "DAY_RESULT"]) {
  browserCase(`E3-T06 abort in ${screen}`, "Modal focus, Escape/button cancellation preserves screen; blocked actions and confirmed reset.", async (page) => {
    await load(page);
    await start(page, "W05");
    await choose(page, 3, 3);
    await click(page, "OPEN_SHOP");
    if (screen === "PLAN") {
      await click(page, "NEXT_DAY");
      await choose(page, 5, 2);
    }
    const snapshot = await page.locator("main").innerHTML();
    for (const cancel of ["Escape", "button"]) {
      await click(page, "REQUEST_ABORT");
      assert.equal(await action(page, "CANCEL_ABORT").evaluate((el) => el === document.activeElement), true);
      await page.keyboard.press("Tab");
      assert.equal(await action(page, "CONFIRM_ABORT").evaluate((el) => el === document.activeElement), true);
      await page.keyboard.press("Shift+Tab");
      assert.equal(await action(page, "CANCEL_ABORT").evaluate((el) => el === document.activeElement), true);
      await injectActions(page, ["OPEN_SHOP", "NEXT_DAY"]);
      assert.equal(await page.locator("dialog").evaluate((el) => el.open), true);
      if (cancel === "Escape") await page.keyboard.press("Escape");
      else await click(page, "CANCEL_ABORT");
      assert.equal(await page.locator("main").innerHTML(), snapshot);
      assert.equal(await action(page, "REQUEST_ABORT").evaluate((el) => el === document.activeElement), true);
    }
    await click(page, "REQUEST_ABORT");
    await click(page, "CONFIRM_ABORT");
    assert.equal(await page.locator("#week-W01").isChecked(), true);
    assert.equal(await headingFocused(page), true);
    assert.equal(await saved(page, "W05"), null);
    return `${screen}: state and focus restored on both cancellation paths; confirm reset without saving.`;
  });
}

async function checkLayout(page) {
  const problems = await page.evaluate(() => {
    const failures = [];
    if (document.documentElement.scrollWidth > innerWidth) failures.push("page overflow");
    const controls = [...document.querySelectorAll("main button, main select, main label.choice")];
    const rects = controls.map((el) => el.getBoundingClientRect());
    for (const [index, rect] of rects.entries()) {
      if (rect.width < 44 || rect.height < 44) failures.push(`small control ${index}`);
      if (rects.slice(index + 1).some((other) => rect.left < other.right - 1 && rect.right > other.left + 1
          && rect.top < other.bottom - 1 && rect.bottom > other.top + 1)) failures.push(`overlapping control ${index}`);
    }
    for (const el of document.querySelectorAll("main h1, main p, main small, main strong, th, td, main button")) {
      // Font ink and range boxes may extend past a tight line box without clipping.
      // Only compare against the page edge and ancestors that actually clip.
      const clipping = [];
      for (let ancestor = el; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clipsX = ["hidden", "clip", "scroll", "auto"].includes(style.overflowX);
        const clipsY = ["hidden", "clip", "scroll", "auto"].includes(style.overflowY);
        if (clipsX || clipsY) clipping.push({ bounds: ancestor.getBoundingClientRect(), clipsX, clipsY });
      }
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const run of range.getClientRects()) {
        const clipped = clipping.some(({ bounds, clipsX, clipsY }) =>
          (clipsX && (run.left < bounds.left - 1 || run.right > bounds.right + 1))
          || (clipsY && (run.top < bounds.top - 1 || run.bottom > bounds.bottom + 1)));
        if (run.left < -1 || run.right > innerWidth + 1 || clipped) {
          failures.push(`clipped text ${el.textContent.trim()}`);
          break;
        }
      }
    }
    return failures;
  });
  assert.deepEqual(problems, []);
}

for (const width of [320, 375, 768, 1280]) {
  browserCase(`E3-T07 layout ${width}px`, "All screens fit, text visible, controls do not overlap and measure at least 44px.", async (page) => {
    await load(page);
    const capture = async (screen) => {
      await checkLayout(page);
      if (evidence && width === 320) await page.screenshot({ path: join(evidence, `${engine}-${screen}-320.png`), fullPage: true });
    };
    await capture("title");
    if (width < 400) await action(page, "START").tap();
    else await click(page, "START");
    assert.equal(await headingFocused(page), true);
    await capture("plan");
    assert.match(await page.locator(".summary").innerText(), /くもり/);
    assert.equal(await action(page, "OPEN_SHOP").evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
    for (let day = 1; day <= 5; day++) {
      if (width < 400) await action(page, "OPEN_SHOP").tap();
      else await click(page, "OPEN_SHOP");
      assert.equal(await headingFocused(page), true);
      if (day === 1) await capture("daily");
      const next = action(page, day === 5 ? "SHOW_FINAL" : "NEXT_DAY");
      if (width < 400) await next.tap();
      else await next.click();
    }
    await capture("final");
    assert.equal(await headingFocused(page), true);
    assert.match(await page.locator(".summary").innerText(), /星 0 \/ 3・未達/);
    return `Four screens passed at ${width}px with ${width < 400 ? "touch" : "mouse"} play and reduced motion.`;
  }, { viewport: { width, height: 800 }, hasTouch: width < 400, reducedMotion: "reduce" });
}

browserCase("E3-T07 keyboard and focus", "Finish using keyboard, arrows update radios and focus stays visible.", async (page) => {
  await load(page);
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#week-W01").evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#week-W02").isChecked(), true);
  assert.equal(await page.locator("#week-W02").evaluate((el) => el.matches(":focus-visible") && getComputedStyle(el.closest("label")).outlineStyle === "solid"), true);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.locator("#week-W02").evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await phase(page, "PLAN");
  assert.equal(await headingFocused(page), true);
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#price-5").isChecked(), true);
  for (let day = 1; day <= 5; day++) {
    if (day > 1) await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await phase(page, "DAY_RESULT");
    assert.equal(await headingFocused(page), true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
  }
  await phase(page, "FINAL");
  assert.equal(await headingFocused(page), true);
  return "W02 completed using only Tab, Shift+Tab, arrows, Enter and Space.";
});
