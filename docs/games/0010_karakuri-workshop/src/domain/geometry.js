import {getPartDefinition} from '../data/part-definitions.js';
import {physicalAngle} from '../data/physics-config.js';

export const GEOMETRY_TOLERANCE = 1e-6;
const BOARD_WIDTH = 9.6;
const BOARD_HEIGHT = 7.2;
const SWEEP_ANGLES = Object.freeze([-32, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 32]);

export function snapToGrid(logicalCoordinate) {
  return 24 * Math.floor(logicalCoordinate / 24 + .5);
}

export function validateAngle(type, degrees) {
  return getPartDefinition(type)?.angles.includes(degrees) ?? false;
}

export function getOrientedRectangle({x, y, width, height, angle = 0}) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const extentX = Math.abs(c) * halfWidth + Math.abs(s) * halfHeight;
  const extentY = Math.abs(s) * halfWidth + Math.abs(c) * halfHeight;
  return {
    x, y, halfWidth, halfHeight, xAxis: {x: c, y: s}, yAxis: {x: -s, y: c},
    left: x - extentX, right: x + extentX, bottom: y - extentY, top: y + extentY,
  };
}

export function insideBoard(rectangle) {
  const e = GEOMETRY_TOLERANCE;
  return rectangle.left >= -e && rectangle.right <= BOARD_WIDTH + e
    && rectangle.bottom >= -e && rectangle.top <= BOARD_HEIGHT + e;
}

const dot = (a, b) => a.x * b.x + a.y * b.y;
const projection = (rectangle, axis) => rectangle.halfWidth * Math.abs(dot(axis, rectangle.xAxis))
  + rectangle.halfHeight * Math.abs(dot(axis, rectangle.yAxis));

export function intersectRectangles(a, b) {
  const e = GEOMETRY_TOLERANCE;
  if (a.right - b.left <= e || b.right - a.left <= e || a.top - b.bottom <= e || b.top - a.bottom <= e) {
    return false;
  }
  const offset = {x: b.x - a.x, y: b.y - a.y};
  return [a.xAxis, a.yAxis, b.xAxis, b.yAxis].every(axis =>
    projection(a, axis) + projection(b, axis) - Math.abs(dot(offset, axis)) > e);
}

export function intersectCircleRectangle(circle, rectangle) {
  const offset = {x: circle.x - rectangle.x, y: circle.y - rectangle.y};
  const dx = Math.max(0, Math.abs(dot(offset, rectangle.xAxis)) - rectangle.halfWidth);
  const dy = Math.max(0, Math.abs(dot(offset, rectangle.yAxis)) - rectangle.halfHeight);
  return circle.radius - Math.hypot(dx, dy) > GEOMETRY_TOLERANCE;
}

export function getSweptEnvelope({x, y}) {
  const {width, height} = getPartDefinition('S');
  return SWEEP_ANGLES.map(degrees => getOrientedRectangle({
    x, y, width: width + .13, height: height + .13, angle: physicalAngle(degrees),
  }));
}

export function getGoalProtection({x, y}) {
  return getOrientedRectangle({x, y: y + .32, width: 1.52, height: .96});
}
