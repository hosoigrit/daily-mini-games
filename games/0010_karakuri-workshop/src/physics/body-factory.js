import {Box, Circle, RevoluteJoint, Vec2} from '../../vendor/planck/planck.mjs';
import {BALL, MATERIALS, physicalAngle} from '../data/physics-config.js';

const creationOrder = new Map([['obstacle', 0], ['goal', 0], ['fixed', 1], ['placed', 2]]);

export function canonicalizePlacements(placements) {
  return [...placements].sort((a, b) => {
    const kind = creationOrder.get(a.category) - creationOrder.get(b.category);
    if (kind) return kind;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return a.gridX - b.gridX || a.gridY - b.gridY || a.angleDeg - b.angleDeg;
  });
}

function createRectangle(world, data, dynamic) {
  const {width, height, x, y, angleDeg = 0, kind, id, density = 0, angularDamping = 0,
    material = MATERIALS[kind]} = data;
  if (![width, height, x, y, angleDeg, density, angularDamping].every(Number.isFinite)
    || width <= 0 || height <= 0 || !material || (dynamic && density <= 0)) {
    throw new RangeError('Invalid rectangle definition.');
  }
  const body = world.createBody({
    type: dynamic ? 'dynamic' : 'static',
    position: Vec2(x, y),
    angle: physicalAngle(angleDeg),
    angularDamping,
    allowSleep: false,
    userData: {kind, id, width, height},
  });
  body.createFixture(Box(width / 2, height / 2), {...material, density});
  return body;
}

export const createStaticBody = (world, definition) => createRectangle(world, definition, false);
export const createDynamicBody = (world, definition) => createRectangle(world, definition, true);

export function createBall(world, {x, y, mass = BALL.mass, linearDamping = BALL.linearDamping,
    angularDamping = BALL.angularDamping, material = MATERIALS.ball} = {}) {
  if (![x, y, mass, linearDamping, angularDamping].every(Number.isFinite)
    || mass <= 0 || linearDamping < 0 || angularDamping < 0) {
    throw new RangeError('Invalid ball definition.');
  }
  const body = world.createDynamicBody({
    position: Vec2(x, y), linearDamping, angularDamping, bullet: true,
    allowSleep: false, fixedRotation: false, userData: {kind: 'ball', id: 'ball'},
  });
  body.createFixture(Circle(BALL.radius), {...material, density: mass / (Math.PI * BALL.radius ** 2)});
  return body;
}

export function createRevoluteJoint(world, board, {x, y, angleLimitDegrees = 30}) {
  if (![x, y, angleLimitDegrees].every(Number.isFinite) || angleLimitDegrees < 0) {
    throw new RangeError('Invalid pivot definition.');
  }
  const pivot = world.createBody({position: Vec2(x, y), userData: {kind: 'pivot'}});
  const limit = angleLimitDegrees * Math.PI / 180;
  return world.createJoint(RevoluteJoint({
    enableLimit: true, lowerAngle: -limit, upperAngle: limit, enableMotor: false,
  }, pivot, board, Vec2(x, y)));
}
