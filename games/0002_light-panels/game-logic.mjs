export const SCREEN = Object.freeze({
  TITLE: "TITLE",
  SELECT: "SELECT",
  PLAYING: "PLAYING",
  CLEARED: "CLEARED",
  ALL_CLEARED: "ALL_CLEARED",
  ERROR: "ERROR",
});

export function resolveInitialScreen(stagesValid) {
  if (typeof stagesValid !== "boolean") {
    throw new TypeError("stagesValid must be a boolean");
  }
  return stagesValid ? SCREEN.TITLE : SCREEN.ERROR;
}

export function validateBoard(board, expectedSize = board?.length) {
  if (!Number.isInteger(expectedSize) || expectedSize <= 0) {
    return false;
  }

  return Array.isArray(board)
    && board.length === expectedSize
    && board.every((row) => (
      Array.isArray(row)
      && row.length === expectedSize
      && row.every((value) => value === 0 || value === 1)
    ));
}

export function cloneBoard(board) {
  assertValidBoard(board);
  return board.map((row) => [...row]);
}

export function toggleCross(board, row, column) {
  assertValidBoard(board);
  assertValidCoordinate(board, row, column);

  const nextBoard = cloneBoard(board);
  const offsets = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [rowOffset, columnOffset] of offsets) {
    const targetRow = row + rowOffset;
    const targetColumn = column + columnOffset;
    if (isInsideBoard(board, targetRow, targetColumn)) {
      nextBoard[targetRow][targetColumn] = 1 - nextBoard[targetRow][targetColumn];
    }
  }

  return nextBoard;
}

export function isSolved(board) {
  assertValidBoard(board);
  return board.every((row) => row.every((value) => value === 0));
}

export function createPlayState(stageId, initialBoard) {
  if (!Number.isInteger(stageId) || stageId <= 0) {
    throw new RangeError("stageId must be a positive integer");
  }
  assertValidBoard(initialBoard);

  return {
    screen: SCREEN.PLAYING,
    activeStageId: stageId,
    board: cloneBoard(initialBoard),
    moveCount: 0,
  };
}

export function applyPanelMove(playState, row, column, finalStageId = 6) {
  if (!playState || typeof playState !== "object") {
    throw new TypeError("playState must be an object");
  }

  if (playState.screen !== SCREEN.PLAYING) {
    return { state: playState, moved: false, solved: false };
  }

  if (!Number.isInteger(playState.activeStageId) || playState.activeStageId <= 0) {
    throw new RangeError("activeStageId must be a positive integer");
  }
  if (!Number.isSafeInteger(playState.moveCount) || playState.moveCount < 0) {
    throw new RangeError("moveCount must be a non-negative safe integer");
  }
  if (!Number.isInteger(finalStageId) || finalStageId < playState.activeStageId) {
    throw new RangeError("finalStageId is invalid");
  }

  const nextBoard = toggleCross(playState.board, row, column);
  const solved = isSolved(nextBoard);
  const nextScreen = solved
    ? playState.activeStageId === finalStageId
      ? SCREEN.ALL_CLEARED
      : SCREEN.CLEARED
    : SCREEN.PLAYING;

  return {
    state: {
      ...playState,
      screen: nextScreen,
      board: nextBoard,
      moveCount: playState.moveCount + 1,
    },
    moved: true,
    solved,
  };
}

function assertValidBoard(board) {
  if (!validateBoard(board)) {
    throw new TypeError("board must be a non-empty square matrix containing only 0 and 1");
  }
}

function assertValidCoordinate(board, row, column) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || !isInsideBoard(board, row, column)) {
    throw new RangeError("row and column must point to a cell inside the board");
  }
}

function isInsideBoard(board, row, column) {
  return row >= 0 && row < board.length && column >= 0 && column < board.length;
}
