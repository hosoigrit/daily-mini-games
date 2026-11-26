import {createHash} from 'node:crypto';
import {canonicalDesign} from '../../src/domain/design-editor.js';
import {createStageExperiment} from '../../src/data/stage-definitions.js';

const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function certificationEligible(result) {
  return result.end === 'CLEARED' && result.required && !result.tunneling
    && [result.lastPosition.x, result.lastPosition.y, result.minimumGoalDistanceUm].every(Number.isFinite);
}

export function isDistinctSolution(base, alternative, ablations = []) {
  if (!certificationEligible(base) || !certificationEligible(alternative)
    || base.stageFingerprint !== alternative.stageFingerprint) return false;
  const orders = result => result.actions.map(({event, part}) => [event, part?.split(':')[0]]);
  const key = ({type, gridX, gridY, angleDeg}) => `${type}:${gridX}:${gridY}:${angleDeg}`;
  const baseline = new Set(base.placed.map(key));
  const changedActions = new Set(alternative.placed.map(key).filter(id => !baseline.has(id)
    && alternative.actions.some(action => action.part === id)));
  return changedActions.size > 0 && JSON.stringify(orders(base)) !== JSON.stringify(orders(alternative))
    && [...changedActions].every(id => ablations.some(a => a.removed === id
      && (a.result === 'FAILED' || a.result === 'CLEARED' && a.sameResidualSequence === false)));
}

export function runStageSimulation(stage, design, {trace = false, runId, beforeTick} = {}) {
  const experiment = createStageExperiment(stage, design, {runId});
  const trajectory = [{tick: 0, ...stage.ball}];
  const records = [];
  const actions = [];
  const paths = [];
  const contactKeys = new Set();
  const ongoing = new Set();
  const used = new Set();
  const identities = new Map([...stage.fixed, ...experiment.placements].map(p =>
    [p.id, `${p.type}:${p.gridX}:${p.gridY}:${p.angleDeg}`]));
  let previous = stage.ball;
  let minimumDistance = Math.hypot(previous.x - stage.goal.x, previous.y - stage.goal.y);
  let row;
  function addAction(event, id, substep) {
    actions.push({event, id, part: identities.get(id), tick: row.tick, substep});
  }
  function enterUpper(id, substep) {
    if (ongoing.has(id)) return;
    ongoing.add(id);
    addAction('upper', id, substep);
  }
  function frameEvidence(frame) {
    const supported = new Set(frame.qualified.map(p => p.id));
    for (const id of ongoing) if (!supported.has(id)) ongoing.delete(id);
    for (const id of supported) enterUpper(id, frame.substep);
    minimumDistance = Math.min(minimumDistance, Math.hypot(frame.position.x - stage.goal.x, frame.position.y - stage.goal.y));
    if (frame.phase === 'after-step-before-limit') crossing(frame.position, row.tick, frame.substep);
  }
  function crossing(position, tick, substep) {
    for (const obstacle of stage.fixed.filter(p => p.type === 'W')) {
      for (const axis of ['x', 'y']) {
        const side0 = previous[axis] - obstacle[axis];
        const side1 = position[axis] - obstacle[axis];
        if (!(side0 < 0 && side1 >= 0) && !(side0 > 0 && side1 <= 0)) continue;
        const other = axis === 'x' ? 'y' : 'x';
        const extent = (axis === 'x' ? obstacle.height : obstacle.width) / 2;
        const low = Math.min(previous[other], position[other]);
        const high = Math.max(previous[other], position[other]);
        const edge = obstacle[other];
        const side = low - .2 >= edge + extent ? (axis === 'x' ? 'above' : 'right')
          : high + .2 <= edge - extent ? (axis === 'x' ? 'below' : 'left') : null;
        if (side) paths.push({id: obstacle.id, axis, direction: Math.sign(side1 - side0), side, tick, substep,
          bracket: [previous, position]});
      }
    }
    previous = position;
  }

  try {
    while (experiment.result.status === 'RUNNING') {
      beforeTick?.();
      row = experiment.step();
      if (row.tick % 6 === 0 || row.status !== 'RUNNING') {
        trajectory.push({tick: row.tick, x: row.position.x, y: row.position.y});
      }
      if (trace) records.push(row);
      minimumDistance = Math.min(minimumDistance, Math.hypot(row.position.x - stage.goal.x, row.position.y - stage.goal.y));
      if (!row.error) {
        for (const frame of row.usage.frames) {
          frameEvidence(frame);
          if (frame.phase !== 'before-step') continue;
          for (const contact of row.usage.raw) {
            if (contact.substep !== frame.substep || !identities.has(contact.id)) continue;
            contactKeys.add(identities.get(contact.id));
            if (contact.event === 'end-contact' || contact.event === 'pre-solve' && !contact.upper) ongoing.delete(contact.id);
            if (contact.event === 'pre-solve' && contact.upper) enterUpper(contact.id, contact.substep);
          }
        }
        if (row.usage.activation) addAction('spring', row.usage.activation.springId, 2);
        for (const id of row.usage.state.usedIds) {
          if (!used.has(id) && identities.get(id)?.startsWith('S:')) addAction('load-tilt', id, 2);
          used.add(id);
        }
        if (row.status !== 'RUNNING') break;
      } else {
        break;
      }
    }
    const placed = canonicalDesign(design);
    const usedIds = row.usage?.state.usedIds ?? [];
    const practice = {
      runId: experiment.runId, stageId: stage.id, end: row.status, code: row.code, ticks: row.tick,
      required: Boolean(row.requiredUse), stars: row.stars, placed, usedIds,
      minimumGoalDistanceUm: Number.isFinite(minimumDistance) ? Math.round(minimumDistance * 1e6) : null,
      stageFingerprint: sha256(stage),
      actions, paths, contactParts: [...contactKeys], lastPosition: row.position,
      fingerprint: sha256({trajectory, actions, paths, end: row.status, usedIds}),
    };
    return trace ? {...practice, trajectory, raw: records} : practice;
  } finally {
    experiment.dispose();
  }
}
