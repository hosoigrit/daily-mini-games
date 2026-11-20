import { sameCoord } from "./game-core.js";

export function cellsAlongAxis(from, to) {
  if (!from || !to || sameCoord(from, to)) return [];
  if (from[0] !== to[0] && from[1] !== to[1]) return [to];
  const rowStep = Math.sign(to[0] - from[0]);
  const colStep = Math.sign(to[1] - from[1]);
  const cells = [];
  let row = from[0];
  let col = from[1];
  while (row !== to[0] || col !== to[1]) {
    row += rowStep;
    col += colStep;
    cells.push([row, col]);
  }
  return cells;
}

export class PointerInputAdapter {
  constructor(onCell) {
    this.onCell = onCell;
    this.activePointerId = null;
    this.lastCell = null;
  }

  pointerDown(pointerId, cell) {
    if (this.activePointerId !== null) return false;
    this.activePointerId = pointerId;
    this.lastCell = cell ? [...cell] : null;
    if (cell) this.onCell([...cell]);
    return true;
  }

  pointerMove(pointerId, cell) {
    if (pointerId !== this.activePointerId || !cell || !this.lastCell) return false;
    const cells = cellsAlongAxis(this.lastCell, cell);
    if (cells.length === 0) return false;
    for (const next of cells) this.onCell([...next]);
    this.lastCell = [...cell];
    return true;
  }

  pointerUp(pointerId) {
    if (pointerId !== this.activePointerId) return false;
    this.activePointerId = null;
    this.lastCell = null;
    return true;
  }

  pointerCancel(pointerId) {
    return this.pointerUp(pointerId);
  }
}

