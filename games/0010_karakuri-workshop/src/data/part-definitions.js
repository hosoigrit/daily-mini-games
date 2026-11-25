import {MATERIALS} from './physics-config.js';

export const PART_TYPES = Object.freeze(['R', 'P', 'B', 'S']);

function part(type, width, height, angles, bodyType, joint = null) {
  return Object.freeze({
    type, width, height, angles: Object.freeze(angles), bodyType, material: MATERIALS[type], joint,
  });
}

const parts = Object.freeze({
  R: part('R', 1.68, .16, [-60, -45, -30, -15, 0, 15, 30, 45, 60], 'static'),
  P: part('P', 1.20, .16, [0], 'static'),
  B: part('B', .72, .24, [-45, -30, -15, 0, 15, 30, 45], 'static'),
  S: part('S', 1.92, .16, [0], 'dynamic', Object.freeze({
    type: 'revolute', limitDegrees: 30, motor: false, massRatio: 1.5, angularDamping: 1.2,
  })),
});

export function getPartDefinition(type) {
  return Object.hasOwn(parts, type) ? parts[type] : null;
}
