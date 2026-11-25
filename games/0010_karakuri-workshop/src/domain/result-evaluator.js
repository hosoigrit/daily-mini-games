import {createStaticBody} from '../physics/body-factory.js';
import {createTrajectoryRecorder} from '../physics/trajectory-recorder.js';
import {captureRunDesign, commitScore, initialProgress} from './score-service.js';

const TOLERANCE = 1e-6;
const GOAL_SPEED = .15;
const GOAL_TICKS = 30;
const VOID_LIMIT = 1200;
const GOAL_RECTANGLES = Object.freeze([
  Object.freeze({x: 0, y: -.08, width: 1.52, height: .16}),
  Object.freeze({x: -.68, y: .36, width: .16, height: .72}),
  Object.freeze({x: .68, y: .36, width: .16, height: .72}),
]);

export function goalGeometry() {
  return GOAL_RECTANGLES.map(box => ({...box}));
}

export function createGoal(world, origin) {
  return goalGeometry().map((box, i) => createStaticBody(world, {
    ...box, x: origin.x + box.x, y: origin.y + box.y, kind: 'goal', id: `goal-${i}`,
  }));
}

export function isInsideGoal(position, goal) {
  const x = position.x - goal.x;
  const y = position.y - goal.y;
  return Math.abs(x) <= .41 + TOLERANCE && y >= .19 - TOLERANCE && y <= .52 + TOLERANCE;
}

export function isStableGoalObservation({position, velocity, penetration = 0}, goal) {
  return isInsideGoal(position, goal) && Math.hypot(velocity.x, velocity.y) <= GOAL_SPEED + Number.EPSILON
    && penetration <= .01 + Number.EPSILON;
}

export function createGoalStability(goal) {
  let lastStable = null;
  let intervals = 0;
  return {
    observe(tick, observations) {
      const stable = observations.length > 0 && observations.every(sample => isStableGoalObservation(sample, goal));
      if (!stable) {
        const boundary = observations.at(-1);
        lastStable = boundary && isStableGoalObservation(boundary, goal) ? tick : null;
        intervals = 0;
      } else {
        intervals = lastStable === tick - 1 ? intervals + 1 : 0;
        lastStable = tick;
      }
      return {intervals, achieved: intervals >= GOAL_TICKS};
    },
  };
}

export function evaluateTerminal({tick, position, stable, requiredUse, error}) {
  if (error || ![position.x, position.y].every(Number.isFinite)) return {status: 'ERROR', code: 'PHYSICS_ERROR'};
  if (stable) return requiredUse ? {status: 'CLEARED', code: null} : {status: 'FAILED', code: 'FL-006'};
  if (position.y < -.20) return {status: 'FAILED', code: 'FL-001'};
  if (position.y > 7.40) return {status: 'FAILED', code: 'FL-002'};
  if (position.x < -.20) return {status: 'FAILED', code: 'FL-003'};
  if (position.x > 9.80) return {status: 'FAILED', code: 'FL-004'};
  if (tick >= VOID_LIMIT) return {status: 'FAILED', code: 'FL-005'};
  return {status: 'RUNNING', code: null};
}

export function createResultSession({progress = initialProgress(), previousTrajectory = null, onTerminal = () => {}} = {}) {
  let current = null;
  let revision = 0;
  const read = () => ({runId: current?.id ?? null, phase: current?.phase ?? 'READY',
    result: current?.result ?? null, progress, previousTrajectory, revision});
  function settle(runId, terminal, tick, position) {
    if (current?.id !== runId || current.phase !== 'RUNNING' || terminal.status === 'RUNNING') return false;
    const {status, code} = terminal;
    if (!['CLEARED', 'FAILED', 'ERROR', 'ABORTED'].includes(status)) return false;
    const {stageId, compatibility, placements, star3Target} = current;
    const scored = commitScore(progress, {stageId, status, compatibility, placements, star3Target});
    const recorded = current.trajectory.finish(tick, position, status);
    if (recorded) previousTrajectory = recorded;
    if (scored.progress !== progress) {
      progress = scored.progress;
      revision++;
    }
    current.phase = status;
    current.result = {runId, status, code, tick, stars: scored.stars, achievements: scored.achievements};
    onTerminal(current.result);
    return true;
  }
  return {
    read,
    start({id, initialPosition, placements, ...rules}) {
      if (current?.phase === 'RUNNING' || current?.phase === 'PAUSED') return false;
      const trajectory = createTrajectoryRecorder(id, initialPosition);
      current = {id, ...rules, placements: captureRunDesign(placements), phase: 'RUNNING', trajectory, result: null};
      return true;
    },
    pause() {
      if (current?.phase === 'RUNNING') current.phase = 'PAUSED';
    },
    resume() {
      if (current?.phase === 'PAUSED') current.phase = 'RUNNING';
    },
    abort() {
      if (current?.phase === 'RUNNING' || current?.phase === 'PAUSED') current.phase = 'ABORTED';
    },
    accept: settle,
    step(runId, advance) {
      if (current?.id !== runId || current.phase !== 'RUNNING') return false;
      const tick = advance();
      if (!tick) return false;
      if (!tick.error) current.trajectory.sample(tick.tick, tick.position);
      settle(runId, evaluateTerminal(tick), tick.tick, tick.position);
      return true;
    },
  };
}
