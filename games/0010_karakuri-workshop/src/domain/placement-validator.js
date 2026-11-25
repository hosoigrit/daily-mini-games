import {BALL, physicalAngle} from '../data/physics-config.js';
import {getPartDefinition, PART_TYPES} from '../data/part-definitions.js';
import {getGoalProtection, getOrientedRectangle, getSweptEnvelope, insideBoard,
  intersectCircleRectangle, intersectRectangles, validateAngle} from './geometry.js';

const legal = Object.freeze({ok: true});
const reject = reason => ({ok: false, reason});

export function calculateInventory(stage, placements) {
  const left = Object.fromEntries(PART_TYPES.map(type => [type, stage.inventory[type] ?? 0]));
  for (const {type} of placements) left[type]--;
  return left;
}

export function placementShapes(item) {
  const definition = getPartDefinition(item.type);
  const x = item.x ?? .24 * item.gridX;
  const y = item.y ?? 7.2 - .24 * item.gridY;
  if (item.type === 'S') return getSweptEnvelope({x, y});
  return [getOrientedRectangle({
    x, y, width: definition?.width ?? item.width, height: definition?.height ?? item.height,
    angle: physicalAngle(item.angleDeg ?? 0),
  })];
}

const overlaps = (a, b) => a.some(shape => b.some(other => intersectRectangles(shape, other)));

export function validatePlacement(stage, placements, candidate, replacingId = null) {
  if (!getPartDefinition(candidate.type)) return reject('PART_TYPE');
  if (!Number.isInteger(candidate.gridX) || !Number.isInteger(candidate.gridY)) return reject('GRID');
  if (!validateAngle(candidate.type, candidate.angleDeg)) return reject('ANGLE');

  const {type, gridX, gridY, angleDeg} = candidate;
  const shapes = placementShapes({type, gridX, gridY, angleDeg});
  if (!shapes.every(insideBoard)) return reject('BOARD_BOUNDS');

  const ball = {...stage.ball, radius: BALL.radius};
  if (shapes.some(shape => intersectCircleRectangle(ball, shape))) return reject('INITIAL_BALL');
  if (overlaps(shapes, [getGoalProtection(stage.goal)])) return reject('GOAL_PROTECTION');
  if (stage.fixed.some(item => overlaps(shapes, placementShapes(item)))) return reject('FIXED_OVERLAP');
  const others = placements.filter(item => item.id !== replacingId);
  if (others.some(item => overlaps(shapes, placementShapes(item)))) return reject('PLACEMENT_OVERLAP');
  if (calculateInventory(stage, others)[candidate.type] <= 0) return reject('INVENTORY');
  return legal;
}
