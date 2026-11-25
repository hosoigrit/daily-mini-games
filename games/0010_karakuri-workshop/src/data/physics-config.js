export const TICK_SECONDS = 1 / 60;
export const MAX_TICKS_PER_FRAME = 5;
export const PAUSE_GAP_MS = 250;
export const BOARD_HEIGHT_METERS = 7.2;

export const PHYSICS_PROFILES = Object.freeze({
  PP01: Object.freeze({substeps: 1, velocityIterations: 8, positionIterations: 3}),
  PP02: Object.freeze({substeps: 1, velocityIterations: 12, positionIterations: 8}),
  PP03: Object.freeze({substeps: 2, velocityIterations: 8, positionIterations: 3}),
});

export const BALL = Object.freeze({
  radius: 0.2,
  mass: 0.20,
  linearDamping: 0.04,
  angularDamping: 0.05,
  maxSpeed: 12,
  maxAngularSpeed: 60,
});

export const ABNORMAL_SPEED = 30;
export const ABNORMAL_ANGULAR_SPEED = 150;
export const DEFAULT_GRAVITY = Object.freeze({x: 0, y: -9.8});

export const MATERIALS = Object.freeze(Object.fromEntries(
  Object.entries({
    ball: [0.35, 0.05],
    R: [0.30, 0.05],
    P: [0.50, 0.05],
    B: [0.30, 0],
    S: [0.40, 0.05],
    obstacle: [0.45, 0.05],
    goal: [0.70, 0],
  }).map(([name, [friction, restitution]]) => [name, Object.freeze({friction, restitution})]),
));

export function logicalToPhysical(x, y) {
  return {x: x / 100, y: BOARD_HEIGHT_METERS - y / 100};
}

export function physicalToLogical(x, y) {
  return {x: x * 100, y: (BOARD_HEIGHT_METERS - y) * 100};
}

export function physicalAngle(clockwiseDegrees) {
  return -clockwiseDegrees * Math.PI / 180;
}
