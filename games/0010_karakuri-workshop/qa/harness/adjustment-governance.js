import {isDeepStrictEqual} from 'node:util';
import {getGoalProtection, insideBoard, intersectCircleRectangle, intersectRectangles} from '../../src/domain/geometry.js';
import {placementShapes} from '../../src/domain/placement-validator.js';
import {BALL} from '../../src/data/physics-config.js';

export function validateInitialGeometry(stage) {
  const circle = {...stage.ball, radius: BALL.radius};
  const goal = getGoalProtection(stage.goal);
  const fixed = stage.fixed.map(placementShapes);
  if (circle.x - circle.radius < 0 || circle.x + circle.radius > 9.6
    || circle.y - circle.radius < 0 || circle.y + circle.radius > 7.2) return false;
  if (!insideBoard(goal) || intersectCircleRectangle(circle, goal)) return false;
  for (const [index, shapes] of fixed.entries()) {
    for (const shape of shapes) {
      if (!insideBoard(shape) || intersectCircleRectangle(circle, shape) || intersectRectangles(shape, goal)
        || fixed.slice(0, index).some(group => group.some(other => intersectRectangles(shape, other)))) return false;
    }
  }
  return true;
}

export function checkAdjustment(initial, next, {physicsUnchanged = true} = {}) {
  const fail = reason => ({ok: false, reason});
  if (!physicsUnchanged) return fail('COMMON_PHYSICS');
  if (initial.id === '01' && !isDeepStrictEqual(initial, next)) return fail('STAGE_01_FIXED');
  const {goal, fixed, inventory, ...immutable} = initial;
  const {goal: newGoal, fixed: newFixed, inventory: stock, ...proposedImmutable} = next;
  if (!isDeepStrictEqual(immutable, proposedImmutable)) return fail('IMMUTABLE_STAGE_FIELD');
  if (!newGoal || !newFixed || !stock || fixed.length !== newFixed.length) return fail('DEFINITION_SHAPE');
  function gridLimit(old, value, max) {
    if (![old, value].every(Number.isFinite)) return false;
    const delta = (value - old) / .24;
    return Math.abs(delta - Math.round(delta)) < 1e-9 && Math.abs(delta) <= max + 1e-9;
  }

  if (!gridLimit(goal.x, newGoal.x, 2) || !gridLimit(goal.y, newGoal.y, 2)) return fail('GOAL_DISPLACEMENT');
  for (const [i, before] of fixed.entries()) {
    const after = newFixed[i];
    if (!after || before.id !== after.id || before.type !== after.type || before.category !== after.category
      || before.angleDeg !== after.angleDeg) return fail('FIXED_PART_IDENTITY');
    if (!gridLimit(before.x, after.x, 2) || !gridLimit(before.y, after.y, 2)
      || Math.abs(after.x - .24 * after.gridX) > 1e-9 || Math.abs(after.y - .24 * (30 - after.gridY)) > 1e-9) {
      return fail('FIXED_DISPLACEMENT');
    }
    if (before.type === 'W' && (!gridLimit(before.width, after.width, 1) || !gridLimit(before.height, after.height, 1)
      || after.width <= 0 || after.height <= 0)) return fail('OBSTACLE_SIZE');
  }
  if (Object.keys(stock).length !== Object.keys(inventory).length) return fail('INVENTORY_KEYS');
  for (const [part, old] of Object.entries(inventory)) {
    if (!Number.isInteger(stock[part]) || stock[part] < 0 || Math.abs(stock[part] - old) > 1
      || old === 0 && stock[part] !== 0) return fail('INVENTORY_DELTA');
  }
  const requiredType = next.required === 'slope' ? 'R' : next.required;
  if (Object.values(stock).reduce((a, b) => a + b, 0) > 13 || requiredType && stock[requiredType] === 0) {
    return fail('INVENTORY_BOUND');
  }
  return validateInitialGeometry(next) ? {ok:true} : fail('ILLEGAL_GEOMETRY');
}
