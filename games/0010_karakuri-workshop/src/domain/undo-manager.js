export const UNDO_LIMIT = 50;

export function pushUndoSnapshot(history, placements) {
  return [...history.slice(-(UNDO_LIMIT - 1)), placements];
}

export function restoreUndoSnapshot(history) {
  if (history.length === 0) return null;
  return {history: history.slice(0, -1), placements: history.at(-1)};
}
