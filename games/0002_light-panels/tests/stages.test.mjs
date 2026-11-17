import test from "node:test";
import assert from "node:assert/strict";

import { isSolved, toggleCross, validateBoard } from "../game-logic.mjs";
import {
  createStageCollection,
  getInitialBoard,
  getStage,
  STAGES,
  STAGES_VALID,
  validateStageCollection,
} from "../stages.mjs";

const expectedRows = [
  ["010", "111", "010"],
  ["110", "101", "011"],
  ["011", "101", "111"],
  ["0111", "1101", "0011", "0010"],
  ["1111", "1001", "1001", "1111"],
  ["1011", "0011", "1100", "1101"],
];

const knownSolutions = [
  [[1, 1]],
  [[0, 0], [2, 2]],
  [[0, 1], [1, 0], [2, 2]],
  [[1, 1], [2, 2], [0, 3]],
  [[0, 0], [0, 3], [3, 0], [3, 3]],
  [[0, 1], [1, 3], [2, 0], [3, 2], [1, 1], [2, 2]],
];

test("TC-001: 固定6面のサイズ・値・盤面は基本設計と一致する", () => {
  assert.equal(STAGES_VALID, true);
  assert.equal(STAGES.length, 6);
  STAGES.forEach((stage, index) => {
    const expectedSize = index < 3 ? 3 : 4;
    assert.equal(stage.id, index + 1);
    assert.equal(stage.size, expectedSize);
    assert.equal(validateBoard(stage.board, expectedSize), true);
    assert.deepEqual(stage.board.map((row) => row.join("")), expectedRows[index]);
  });
});

test("TC-001補足: 不正な静的ステージデータを例外なしで検出できる", () => {
  const invalidStages = STAGES.map((stage) => ({
    ...stage,
    board: stage.board.map((row) => [...row]),
  }));
  invalidStages[0].board[0][0] = 2;

  assert.equal(validateStageCollection(invalidStages), false);
  assert.equal(validateStageCollection(null), false);
});

test("ERR-01〜04: 欠落・不正形状の定義を例外なしで不正と判定する", () => {
  const cases = createInvalidDefinitionCases();

  for (const [id, definitions] of Object.entries(cases)) {
    let stages;
    assert.doesNotThrow(() => {
      stages = createStageCollection(definitions);
    }, id);
    assert.equal(validateStageCollection(stages), false, id);
  }
});

test("ERR-05: 承認済み6ステージは安全な構築後も通常データとして有効", () => {
  const stages = createStageCollection(createApprovedDefinitions());

  assert.equal(validateStageCollection(stages), true);
  assert.deepEqual(
    stages.map((stage) => stage.board.map((row) => row.join(""))),
    expectedRows,
  );
});

test("TC-002: 全ステージの初期盤面は未クリアである", () => {
  for (const stage of STAGES) {
    assert.equal(isSolved(stage.board), false, stage.label);
  }
});

test("TC-003: 基本設計の検証用操作列で全ステージが解ける", () => {
  STAGES.forEach((stage, index) => {
    let board = getInitialBoard(stage.id);
    for (const [row, column] of knownSolutions[index]) {
      board = toggleCross(board, row, column);
    }
    assert.equal(isSolved(board), true, stage.label);
  });
});

test("TC-012: 開始盤面の取得・変更を繰り返しても固定データは変化しない", () => {
  const first = getInitialBoard(3);
  const original = structuredClone(first);
  first[0][0] = 1 - first[0][0];
  const second = getInitialBoard(3);
  assert.deepEqual(second, original);
  assert.deepEqual(getStage(3).board, original);
  assert.notStrictEqual(first, second);
  first.forEach((row, index) => assert.notStrictEqual(row, second[index]));
});

test("範囲外ステージは取得できない", () => {
  assert.equal(getStage(0), null);
  assert.equal(getStage(7), null);
  assert.throws(() => getInitialBoard(7), RangeError);
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
