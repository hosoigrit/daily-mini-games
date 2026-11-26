import {getPartDefinition} from '../data/part-definitions.js';
import {BALL} from '../data/physics-config.js';
import {createDynamicBody, createRevoluteJoint} from './body-factory.js';

const SELECTED_MASS_RATIO = 2.5;

export function createSeesawAssembly(world, {id, x, y, ballMass = BALL.mass}) {
  const {width, height, joint: configuration} = getPartDefinition('S');
  const density = SELECTED_MASS_RATIO * ballMass / (width * height);
  const board = createDynamicBody(world, {
    id, kind: 'S', x, y, width, height, density, angularDamping: configuration.angularDamping,
  });
  const joint = createRevoluteJoint(world, board, {x, y, angleLimitDegrees: configuration.limitDegrees});
  return {board, joint};
}

export function evaluateSeesawState({board, joint}) {
  const fixed = joint.getAnchorA();
  const moving = joint.getAnchorB();
  return {
    angle: board.getAngle(),
    angularVelocity: board.getAngularVelocity(),
    pivot: {x: fixed.x, y: fixed.y},
    pivotError: Math.hypot(moving.x - fixed.x, moving.y - fixed.y),
    motorEnabled: joint.isMotorEnabled(),
  };
}
