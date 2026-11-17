import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveInitialScreen, SCREEN } from "../game-logic.mjs";
import {
  createStageCollection,
  STAGES,
  validateStageCollection,
} from "../stages.mjs";

const gameDirectory = path.dirname(fileURLToPath(new URL("../index.html", import.meta.url)));
const productionFiles = Object.freeze([
  "index.html",
  "styles.css",
  "game.js",
  "game-logic.mjs",
  "stages.mjs",
  "progress-store.mjs",
]);

test("ERR-01〜04: 異常ステージはERROR画面状態となる", () => {
  for (const [id, definitions] of Object.entries(createInvalidDefinitionCases())) {
    const stages = createStageCollection(definitions);
    const screen = resolveInitialScreen(validateStageCollection(stages));

    assert.equal(screen, SCREEN.ERROR, id);
  }
});

test("ERR-05/R2-001: 承認済み6面はTITLEとなり公開用6ファイルだけを参照する", async () => {
  assert.equal(resolveInitialScreen(validateStageCollection(STAGES)), SCREEN.TITLE);

  const sources = new Map();
  for (const fileName of productionFiles) {
    sources.set(fileName, await readFile(path.join(gameDirectory, fileName), "utf8"));
  }

  const references = [];
  for (const [fileName, source] of sources) {
    const patterns = fileName === "index.html"
      ? [/(?:src|href)="\.\/([^"#?]+)"/g]
      : [/from\s+["']\.\/([^"']+)["']/g];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        references.push({ from: fileName, to: match[1] });
      }
    }
  }

  assert.equal(references.some(({ to }) => to === "startup.mjs"), false);
  for (const reference of references) {
    assert.equal(
      productionFiles.includes(reference.to),
      true,
      `${reference.from} references non-distribution file ${reference.to}`,
    );
  }
});

function createApprovedDefinitions() {
  return STAGES.map((stage) => ({
    id: stage.id,
    size: stage.size,
    rows: stage.board.map((row) => row.join("")),
  }));
}

function createInvalidDefinitionCases() {
  const invalidCell = createApprovedDefinitions();
  invalidCell[0].rows[0] = "210";

  const missingRows = createApprovedDefinitions();
  delete missingRows[0].rows;

  const invalidShape = createApprovedDefinitions();
  invalidShape[0].rows = ["010", "111"];

  return {
    "ERR-01": invalidCell,
    "ERR-02": missingRows,
    "ERR-03": invalidShape,
    "ERR-04": createApprovedDefinitions().slice(0, 5),
  };
}
