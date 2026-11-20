import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("RG-01: CSS・JS参照がサブパス対応の相対パスで成立する", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/src\/main\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.equal(root.endsWith("0005_hitofude-delivery\\") || root.endsWith("0005_hitofude-delivery/"), true);
});

