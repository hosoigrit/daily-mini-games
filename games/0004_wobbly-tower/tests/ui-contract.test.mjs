import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("TC-041 automated contract: viewport・論理Canvas・レスポンシブCSSを備える", async () => {
  const [html, css] = await Promise.all([read("index.html"), read("styles.css")]);
  assert.match(html, /width=device-width/);
  assert.match(html, /canvas[^>]+width="360"[^>]+height="560"/s);
  assert.match(css, /aspect-ratio:\s*360\s*\/\s*560/);
  assert.match(css, /@media \(max-width: 340px\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
});
test("TC-043: PERFECT・通常・CLEAR・MISSを文字でも表示する", async () => {
  const [main, renderer] = await Promise.all([read("src/main.mjs"), read("src/renderer.mjs")]);
  for (const label of ["PERFECT", "着地成功", "CLEAR", "MISS", "GAME OVER"]) {
    assert.ok(main.includes(label) || renderer.includes(label), `${label} is present`);
  }
});
test("TC-045 automated contract: reduced-motionと狭幅・低高CSSを備える", async () => {
  const css = await read("styles.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /max-height:\s*650px/);
  assert.match(css, /max-width:\s*340px/);
});
test("入力領域はPointer Events向けtouch-action noneを使う", async () => {
  const [main, css] = await Promise.all([read("src/main.mjs"), read("styles.css")]);
  assert.match(main, /addEventListener\("pointerdown"/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(main, /event\.repeat/);
});
