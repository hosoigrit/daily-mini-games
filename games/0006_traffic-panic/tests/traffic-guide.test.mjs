import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { EXPERIMENT_CONFIGS } from "../simulation/experiment-configs.mjs";
import { shortcutFor } from "../ui/browser-controller.mjs";
import { trafficGuideModel, renderTrafficGuide } from "../ui/traffic-guide.mjs";

const HARD_A = EXPERIMENT_CONFIGS["HARD-A"];

test("E3-M01: HARD-A traffic guide derives all three intervals and axis ratios from Config", () => {
  const guide = trafficGuideModel(HARD_A);
  assert.deepEqual(guide.rows, [
    { window: "0.0〜20.0秒", cadence: "1.3秒ごと", ratio: "50% / 50%" },
    { window: "20.0〜40.0秒", cadence: "1.0秒ごと", ratio: "30% / 70%" },
    { window: "40.0〜60.0秒", cadence: "0.7秒ごと", ratio: "70% / 30%" },
  ]);
  assert.match(guide.switchText, /黄 1\.0秒 → 全赤 0\.5秒/);
  assert.match(guide.lossText, /8台まで.*9台目/);
});

test("E3-M01: changed Config updates the guide, without HTML-duplicated values", () => {
  const config = structuredClone(HARD_A);
  config.phases[2].interval = 9;
  config.phases[2].firstTick = 409;
  config.phases[2].weights = { N: 2000, S: 2000, E: 3000, W: 3000 };
  config.allRedTicks = 8;
  const guide = trafficGuideModel(config);
  assert.deepEqual(guide.rows[2], { window: "40.0〜60.0秒", cadence: "0.9秒ごと", ratio: "40% / 60%" });
  assert.match(guide.switchText, /全赤 0\.8秒/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<details[^>]*id="traffic-guide"/);
  assert.match(html, /id="traffic-guide-summary"/);
  assert.match(html, /id="traffic-guide-rows"/);
  assert.doesNotMatch(html, /0\.7秒|30% \/ 70%|70% \/ 30%/);
});

test("E3-M01: keyboard Enter on the disclosure summary never starts the game", () => {
  const summary = { closest: (selector) => selector.includes("summary") ? summary : null };
  assert.equal(shortcutFor({ target: summary, key: "Enter" }, "READY"), null);
  assert.equal(shortcutFor({ target: null, key: "Enter" }, "READY"), "START");
});

test("E3-M01: DOM rendering uses textContent derived from Config", () => {
  const nodes = Object.fromEntries(["traffic-guide-rows", "traffic-guide-switch", "traffic-guide-loss"].map(id => [id, { textContent: "", children: [], replaceChildren(...children) { this.children = children; } }]));
  const doc = {
    getElementById(id) { assert.ok(nodes[id], id); return nodes[id]; },
    createElement(tag) { return { tag, textContent: "", children: [], append(child) { this.children.push(child); } }; },
  };
  renderTrafficGuide(doc, HARD_A);
  assert.deepEqual(nodes["traffic-guide-rows"].children.map(tr => tr.children.map(td => td.textContent)), [
    ["0.0〜20.0秒", "1.3秒ごと", "50% / 50%"],
    ["20.0〜40.0秒", "1.0秒ごと", "30% / 70%"],
    ["40.0〜60.0秒", "0.7秒ごと", "70% / 30%"],
  ]);
  assert.match(nodes["traffic-guide-switch"].textContent, /黄 1\.0秒/);
  assert.match(nodes["traffic-guide-loss"].textContent, /9台目/);
});
