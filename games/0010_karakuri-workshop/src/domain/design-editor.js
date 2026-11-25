import {getPartDefinition} from '../data/part-definitions.js';
import {canonicalizePlacements} from '../physics/body-factory.js';
import {validateAngle} from './geometry.js';
import {calculateInventory, validatePlacement} from './placement-validator.js';
import {pushUndoSnapshot, restoreUndoSnapshot} from './undo-manager.js';

const idle = Object.freeze({state: 'IDLE'});
const selected = id => ({state: 'SELECTED', id});
const ok = state => ({ok: true, state});
const reject = (state, reason) => ({ok: false, state, reason});

export function createDesignEditor({placements = [], best = null, history = [], progress = null,
  trajectory = null} = {}) {
  return {mode: 'DESIGN', selection: idle, placements: structuredClone(placements),
    history: structuredClone(history), best: structuredClone(best), progress, trajectory, revision: 0};
}

export function canonicalDesign(placements) {
  const sorted = canonicalizePlacements(placements.map(part => ({...part, category: 'placed'})));
  return sorted.map(({type, gridX, gridY, angleDeg}) => ({type, gridX, gridY, angleDeg}));
}

export function cancelPendingEdit(editor) {
  const {selection} = editor;
  if (selection.state === 'DRAGGING' && selection.id) {
    return {...editor, selection: selected(selection.id)};
  }
  if (selection.state === 'CONFIRMING') {
    return {...editor, selection: selection.previous};
  }
  if (selection.state === 'NEW_PART' || selection.state === 'DRAGGING') {
    return {...editor, selection: idle};
  }
  return editor;
}

function commit(editor, placements, selection = idle) {
  return ok({...editor, selection, placements, history: pushUndoSnapshot(editor.history, editor.placements),
    revision: editor.revision + 1});
}

function validateEdit(stage, editor, candidate, previous) {
  const result = validatePlacement(stage, editor.placements, candidate, previous?.id ?? null);
  if (!result.ok) return reject(editor, result.reason);
  if (previous && previous.gridX === candidate.gridX
    && previous.gridY === candidate.gridY && previous.angleDeg === candidate.angleDeg) {
    return reject(editor, 'NO_CHANGE');
  }
  const placements = previous ? editor.placements.map(part => part.id === previous.id ? candidate : part)
    : [...editor.placements, candidate];
  return commit(editor, placements, selected(candidate.id));
}

function editExisting(editor, stage, command) {
  const {id} = command;
  if (stage.fixed.some(part => part.id === id)) return reject(editor, 'FIXED_PART');
  const part = editor.placements.find(entry => entry.id === id);
  if (!part) return reject(editor, 'UNKNOWN_PART');
  switch (command.type) {
    case 'select':
      return ok({...editor, selection: selected(id)});
    case 'drag':
      return ok({...editor, selection: {state: 'DRAGGING', id, draft: {...part}}});
    case 'delete':
      return commit(editor, editor.placements.filter(entry => entry.id !== id));
    case 'move':
      return validateEdit(stage, editor, {...part, gridX: command.gridX, gridY: command.gridY}, part);
    case 'rotate':
      return validateEdit(stage, editor, {...part, angleDeg: command.angleDeg}, part);
    default:
      return reject(editor, 'UNKNOWN_COMMAND');
  }
}

function addPart(editor, stage, command) {
  const {id, partType, gridX, gridY, angleDeg = 0} = command;
  if (typeof id !== 'string' || !id || editor.placements.some(item => item.id === id)
    || stage.fixed.some(item => item.id === id)) {
    return reject(editor, 'PART_ID');
  }
  return validateEdit(stage, editor, {id, type: partType, gridX, gridY, angleDeg});
}

function updateDraft(editor, command) {
  const {selection} = editor;
  const {draft} = selection;
  if (!draft) return reject(editor, 'NO_DRAFT');
  if (command.type === 'rotate-draft' && !validateAngle(draft.type, command.angleDeg)) return reject(editor, 'ANGLE');
  const change = command.type === 'rotate-draft' ? {angleDeg: command.angleDeg}
    : {gridX: command.gridX, gridY: command.gridY};
  return ok({...editor, selection: {...selection, draft: {...draft, ...change}}});
}

function confirm(editor, stage) {
  if (editor.selection.state !== 'CONFIRMING') return reject(editor, 'NO_CONFIRMATION');
  const operation = editor.selection.operation;
  if (operation === 'reset') {
    return ok({...editor, selection: idle, placements: [], history: [], trajectory: null, revision: editor.revision + 1});
  }
  const parts = [];
  for (const {id, type, gridX, gridY, angleDeg} of editor.best ?? []) {
    const item = {id, type, gridX, gridY, angleDeg};
    const result = validatePlacement(stage, parts, item);
    if (!result.ok) return reject(cancelPendingEdit(editor), result.reason);
    if (typeof id !== 'string' || !id || parts.some(part => part.id === id) || stage.fixed.some(fixed => fixed.id === id)) {
      return reject(cancelPendingEdit(editor), 'PART_ID');
    }
    parts.push(item);
  }
  return commit(editor, parts);
}

export function applyEditCommand(editor, stage, command) {
  if (command.type === 'cancel' || command.type === 'orientation-change') return ok(cancelPendingEdit(editor));
  if (editor.mode !== 'DESIGN') return reject(editor, 'NOT_DESIGN');
  const {selection} = editor;
  if (selection.state === 'CONFIRMING' && command.type !== 'confirm') return reject(editor, 'CONFIRMATION_PENDING');

  switch (command.type) {
    case 'new-part': {
      const type = command.partType;
      if (!getPartDefinition(type)) return reject(editor, 'PART_TYPE');
      if (calculateInventory(stage, editor.placements)[type] <= 0) return reject(editor, 'INVENTORY');
      return ok({...editor, selection: {state: 'NEW_PART', draft: {type, angleDeg: 0}}});
    }
    case 'preview':
    case 'rotate-draft':
      return updateDraft(editor, command);
    case 'commit-draft': {
      const {draft} = selection;
      if (!draft) return reject(editor, 'NO_DRAFT');
      const gridX = command.gridX ?? draft.gridX;
      const gridY = command.gridY ?? draft.gridY;
      const settled = cancelPendingEdit(editor);
      if (!selection.id) return addPart(settled, stage, {id: command.id, partType: draft.type,
        angleDeg: draft.angleDeg, gridX, gridY});
      const current = editor.placements.find(item => item.id === selection.id);
      if (!current) return reject(settled, 'UNKNOWN_PART');
      return validateEdit(stage, settled, {...current, gridX, gridY, angleDeg: draft.angleDeg}, current);
    }
    case 'add':
      return addPart(editor, stage, command);
    case 'select':
    case 'drag':
    case 'move':
    case 'rotate':
    case 'delete':
      return editExisting(editor, stage, command);
    case 'undo': {
      const snapshot = restoreUndoSnapshot(editor.history);
      if (!snapshot) return reject(editor, 'EMPTY_UNDO');
      return ok({...editor, ...snapshot, selection: idle, revision: editor.revision + 1});
    }
    case 'request-reset':
    case 'request-load-best':
      if (command.type === 'request-load-best' && !editor.best) return reject(editor, 'NO_BEST');
      return ok({...editor, selection: {state: 'CONFIRMING',
        operation: command.type === 'request-reset' ? 'reset' : 'load-best', previous: selection}});
    case 'confirm':
      return confirm(editor, stage);
    default:
      return reject(editor, 'UNKNOWN_COMMAND');
  }
}
