export const RECORD_LIMIT = 16;
export const RULE_VERSION = 1;
export const directions = Object.freeze({
  U: Object.freeze([0, -1]),
  D: Object.freeze([0, 1]),
  L: Object.freeze([-1, 0]),
  R: Object.freeze([1, 0]),
  '.': Object.freeze([0, 0])
});
export const activePhase = phase => ['RECORDING', 'REPLAYING', 'SOLO_CONTINUE'].includes(phase);
const same = (a, b) => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
const point = (x, y) => Object.freeze([x, y]);
const parsePoint = (rows, p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)
  ? rows[p[1]]?.[p[0]] : undefined;
const fail = code => { throw new Error(code); };

export function defineStage({ id, name, mapRows, doorRules, goldThreshold, silverThreshold, tutorialId }) {
  if (!Array.isArray(mapRows) || !mapRows.length || typeof mapRows[0] !== 'string' || !mapRows[0].length ||
      !mapRows.every(row => typeof row === 'string' && row.length === mapRows[0].length) ||
      !doorRules || typeof doorRules !== 'object' || Array.isArray(doorRules) ||
      !Number.isInteger(goldThreshold) || !Number.isInteger(silverThreshold) ||
      goldThreshold < 0 || silverThreshold < goldThreshold) fail('ERR_STAGE_INVALID');

  const switches = new Map();
  const doors = new Map();
  let start, goal;
  for (const [y, row] of mapRows.entries()) {
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (tile === '#' || tile === '.') continue;
      const position = point(x, y);
      if (tile === 'S') {
        if (start) fail('ERR_STAGE_INVALID');
        start = position;
      } else if (tile === 'G') {
        if (goal) fail('ERR_STAGE_INVALID');
        goal = position;
      } else if (/^[a-z]$/.test(tile) && !switches.has(tile)) {
        switches.set(tile, Object.freeze({ id: tile, position }));
      } else if (/^[A-Z]$/.test(tile) && Object.hasOwn(doorRules, tile) && !doors.has(tile)) {
        const rule = doorRules[tile];
        const switchCount = { PRESSURE: 1, LATCH: 2 }[rule?.type];
        const refs = rule?.requiredSwitchIds;
        if (!switchCount || !Array.isArray(refs) || refs.length !== switchCount ||
            new Set(refs).size !== switchCount || (rule.position && !same(position, rule.position))) fail('ERR_STAGE_INVALID');
        doors.set(tile, Object.freeze({ id: tile, position, type: rule.type, requiredSwitchIds: Object.freeze([...refs]) }));
      } else {
        fail('ERR_STAGE_INVALID');
      }
    }
  }

  if (!start || !goal || doors.size !== Object.keys(doorRules).length ||
      [...doors.values()].some(door => door.requiredSwitchIds.some(ref => !switches.has(ref)))) fail('ERR_STAGE_INVALID');
  return Object.freeze({
    id, name, tutorialId, start, goal, width: mapRows[0].length, height: mapRows.length,
    mapRows: Object.freeze([...mapRows]), goldThreshold, silverThreshold,
    switches: Object.freeze([...switches.keys()].sort().map(key => switches.get(key))),
    doors: Object.freeze([...doors.keys()].sort().map(key => doors.get(key)))
  });
}

export function validateRecord(stage, record) {
  const { positions, recordCompletedTicks, recordedMoveCount, recordingRuleVersion } = record ?? {};
  if (!Array.isArray(positions) || positions.length !== RECORD_LIMIT + 1 ||
      !Number.isInteger(recordCompletedTicks) || recordCompletedTicks < 0 || recordCompletedTicks > RECORD_LIMIT ||
      !Number.isInteger(recordedMoveCount) || recordedMoveCount < 0 ||
      recordingRuleVersion !== RULE_VERSION || !same(stage.start, positions[0])) fail('ERR_RECORD_INVALID');
  let moves = 0;
  for (const [tick, position] of positions.entries()) {
    const tile = parsePoint(stage.mapRows, position);
    if (!tile || tile === '#') fail('ERR_RECORD_INVALID');
    if (tick === 0) continue;
    const last = positions[tick - 1];
    const distance = Math.abs(last[0] - position[0]) + Math.abs(last[1] - position[1]);
    if (distance > 1 || (tick > recordCompletedTicks && distance !== 0)) fail('ERR_RECORD_INVALID');
    moves += distance;
  }
  if (moves !== recordedMoveCount) fail('ERR_RECORD_INVALID');
}

const entries = (items, value) => Object.freeze(Object.fromEntries(items.map(x => [x.id, value])));

export function initialState(stage, phase = 'READY', ghostRecord = null) {
  return Object.freeze({
    stageId: stage.id, phase, playerPosition: stage.start,
    ghostPosition: phase === 'REPLAYING' ? stage.start : null,
    recordTick: ghostRecord?.recordCompletedTicks ?? 0,
    replayTick: 0, positions: Object.freeze(phase === 'RECORDING' ? [stage.start] : []),
    ghostRecord, recordMoves: ghostRecord?.recordedMoveCount ?? 0, replayMoves: 0, clearResult: null,
    switchStates: entries(stage.switches, false), unlockFlags: entries(stage.doors.filter(x => x.type === 'LATCH'), false),
    doorStates: entries(stage.doors, 'CLOSED')
  });
}

export function move(stage, playerPosition, doorStates, action) {
  const delta = Object.hasOwn(directions, action) ? directions[action] : fail('ERR_ACTION_INVALID');
  if (action === '.') return { position: playerPosition, blocked: false, moved: false };
  const next = point(playerPosition[0] + delta[0], playerPosition[1] + delta[1]);
  const tile = parsePoint(stage.mapRows, next);
  if (!tile || tile === '#' || (Object.hasOwn(doorStates, tile) && doorStates[tile] !== 'OPEN')) {
    return { position: playerPosition, blocked: true, moved: false };
  }
  return { position: next, blocked: false, moved: true };
}

export function mechanisms(stage, previous, player, ghost) {
  const events = [];
  const switchStates = Object.fromEntries(stage.switches.map(s => {
    const on = same(s.position, player) || same(s.position, ghost);
    if (on !== previous.switchStates[s.id]) events.push('SW_' + s.id + (on ? '_ON' : '_OFF'));
    return [s.id, on];
  }));
  const unlockFlags = Object.fromEntries(stage.doors.filter(d => d.type === 'LATCH').map(d => {
    const open = previous.unlockFlags[d.id] || d.requiredSwitchIds.every(id => switchStates[id]);
    if (open && !previous.unlockFlags[d.id]) events.push('LATCH_' + d.id + '_UNLOCK');
    return [d.id, open];
  }));
  const doorStates = Object.fromEntries(stage.doors.map(d => {
    const enabled = d.type === 'LATCH' ? unlockFlags[d.id] : d.requiredSwitchIds.every(id => switchStates[id]);
    const state = enabled ? 'OPEN' : d.type === 'PRESSURE' && same(d.position, player) ? 'HELD_OPEN' : 'CLOSED';
    if (state !== previous.doorStates[d.id]) events.push('DOOR_' + d.id + '_' + state);
    return [d.id, state];
  }));
  return { switchStates: Object.freeze(switchStates), unlockFlags: Object.freeze(unlockFlags), doorStates: Object.freeze(doorStates), events };
}

function finish(stage, state) {
  const positions = [...state.positions];
  const last = positions.at(-1);
  while (positions.length <= RECORD_LIMIT) positions.push(last);
  const record = Object.freeze({
    positions: Object.freeze(positions), recordCompletedTicks: state.recordTick,
    recordedMoveCount: state.recordMoves, recordingRuleVersion: RULE_VERSION
  });
  return initialState(stage, 'RECORDED', record);
}

export function score(stage, recordMoves, replayMoves) {
  const totalMoves = recordMoves + replayMoves;
  const stars = totalMoves <= stage.goldThreshold ? 3 : totalMoves <= stage.silverThreshold ? 2 : 1;
  return Object.freeze({ recordMoves, replayMoves, totalMoves, stars });
}

const result = (state, events = [], checkpoint = state, audit = null) =>
  Object.freeze({ state: Object.freeze(state), checkpoint: Object.freeze(checkpoint), events: Object.freeze(events), audit: audit && Object.freeze(audit) });

export function transition(stage, previous, command, expectedTick) {
  const { phase, ghostRecord } = previous;
  if (command === 'START_RECORD' && phase === 'READY') return result(initialState(stage, 'RECORDING'));
  if (command === 'FINISH_RECORD' && phase === 'RECORDING') return result(finish(stage, previous));
  if (command === 'START_REPLAY' && phase === 'RECORDED' && ghostRecord) {
    validateRecord(stage, ghostRecord);
    return result(initialState(stage, 'REPLAYING', ghostRecord));
  }
  if (command === 'RETRY' && ['REPLAYING', 'SOLO_CONTINUE'].includes(phase)) {
    return result(initialState(stage, 'RECORDED', ghostRecord));
  }
  if (command === 'RERECORD' && ['RECORDED', 'REPLAYING', 'SOLO_CONTINUE'].includes(phase)) {
    return result(initialState(stage, 'RECORDING'));
  }
  if (!activePhase(phase) || !Object.hasOwn(directions, command)) fail('ERR_PHASE_INVALID');

  const recording = phase === 'RECORDING';
  if (expectedTick !== (recording ? previous.recordTick : previous.replayTick) + 1) fail('ERR_TICK_INVALID');
  const movement = move(stage, previous.playerPosition, previous.doorStates, command);
  const playerPosition = movement.position;
  const ghostPosition = phase === 'REPLAYING' ? ghostRecord.positions[expectedTick] : null;
  const { events, ...machinery } = mechanisms(stage, previous, playerPosition, ghostPosition);
  const next = { ...previous, ...machinery, playerPosition, ghostPosition };
  const audit = { ghostBeforeDisappearance: null, playerBeforeDisappearance: null, blocked: movement.blocked, action: command };
  if (movement.blocked) events.unshift('MOVE_BLOCKED');

  if (recording) {
    next.recordTick = expectedTick;
    next.recordMoves += Number(movement.moved);
    next.positions = Object.freeze([...previous.positions, playerPosition]);
    return result(expectedTick === RECORD_LIMIT ? finish(stage, next) : next, events, next, audit);
  }

  next.replayTick = expectedTick;
  next.replayMoves += Number(movement.moved);
  if (same(playerPosition, stage.goal)) {
    next.phase = 'CLEARED';
    next.clearResult = score(stage, next.recordMoves, next.replayMoves);
    events.push('CLEARED');
  } else if (phase === 'REPLAYING' && expectedTick === RECORD_LIMIT) {
    audit.ghostBeforeDisappearance = ghostPosition;
    audit.playerBeforeDisappearance = playerPosition;
    next.ghostPosition = null;
    next.phase = 'SOLO_CONTINUE';
    const { events: disappearance, ...rest } = mechanisms(stage, next, playerPosition, null);
    Object.assign(next, rest);
    events.push('GHOST_DISAPPEARED', ...disappearance);
  }
  return result(next, events, next, audit);
}
