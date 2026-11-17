import { cloneBoard, validateBoard } from "./game-logic.mjs";

const stageDefinitions = [
  { id: 1, size: 3, rows: ["010", "111", "010"] },
  { id: 2, size: 3, rows: ["110", "101", "011"] },
  { id: 3, size: 3, rows: ["011", "101", "111"] },
  { id: 4, size: 4, rows: ["0111", "1101", "0011", "0010"] },
  { id: 5, size: 4, rows: ["1111", "1001", "1001", "1111"] },
  { id: 6, size: 4, rows: ["1011", "0011", "1100", "1101"] },
];

export const STAGES = createStageCollection(stageDefinitions);

export const FINAL_STAGE_ID = 6;

export function createStageCollection(definitions) {
  if (!Array.isArray(definitions)) {
    return Object.freeze([]);
  }

  return Object.freeze(definitions.map((definition) => {
    const safeDefinition = definition !== null && typeof definition === "object"
      ? definition
      : {};
    const board = createBoard(safeDefinition.rows);
    const id = safeDefinition.id;

    return Object.freeze({
      id,
      label: Number.isInteger(id) ? `S${String(id).padStart(2, "0")}` : "",
      size: safeDefinition.size,
      board,
    });
  }));
}

export function validateStageCollection(stages) {
  if (!Array.isArray(stages) || stages.length !== FINAL_STAGE_ID) {
    return false;
  }

  return stages.every((stage, index) => {
    const expectedId = index + 1;
    const expectedSize = index < 3 ? 3 : 4;
    return stage !== null
      && typeof stage === "object"
      && stage.id === expectedId
      && stage.label === `S${String(expectedId).padStart(2, "0")}`
      && stage.size === expectedSize
      && validateBoard(stage.board, expectedSize);
  });
}

export const STAGES_VALID = validateStageCollection(STAGES);

export function getStage(stageId) {
  if (!Number.isInteger(stageId)) {
    return null;
  }
  return STAGES.find((stage) => stage.id === stageId) ?? null;
}

export function getInitialBoard(stageId) {
  const stage = getStage(stageId);
  if (!stage) {
    throw new RangeError(`Unknown stage: ${stageId}`);
  }
  if (!validateBoard(stage.board, stage.size)) {
    throw new TypeError(`Invalid stage data: ${stage.label}`);
  }
  return cloneBoard(stage.board);
}

function createBoard(rows) {
  if (!Array.isArray(rows)) {
    return null;
  }

  return Object.freeze(rows.map((row) => {
    if (typeof row !== "string" && !Array.isArray(row)) {
      return null;
    }

    return Object.freeze([...row].map((value) => {
      if (value === 0 || value === "0") {
        return 0;
      }
      if (value === 1 || value === "1") {
        return 1;
      }
      return Number.NaN;
    }));
  }));
}
