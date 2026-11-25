import {getPartDefinition, PART_TYPES} from './part-definitions.js';
import {ABNORMAL_ANGULAR_SPEED, ABNORMAL_SPEED, BALL, DEFAULT_GRAVITY, MATERIALS,
  PHYSICS_PROFILES, SELECTED_PHYSICS_PROFILE} from './physics-config.js';
import {applyEditCommand, canonicalDesign, createDesignEditor} from '../domain/design-editor.js';
import {createGoal, createRuleSimulation, evaluateTerminal} from '../domain/result-evaluator.js';
import {starsForResult} from '../domain/score-service.js';
import {collectContactEvidence, createWorld, disposeWorld} from '../physics/adapter.js';
import {canonicalizePlacements, createBall, createDynamicBody, createRevoluteJoint, createStaticBody} from '../physics/body-factory.js';

const stages = [
  ['はじめての発明', [3, 28.5], [19, 12], [['R', 5, 26, 15]], [1, 0, 0, 0], 1, 'R'],
  ['傾きのひみつ', [36, 28.5], [21, 11], [['R', 34, 26, -15], ['W', 35, 17, 4, 2]], [2, 0, 0, 0], 1, 'slope'],
  ['落とさないで！', [4, 28.5], [25, 10], [['R', 6, 26, 15]], [2, 2, 0, 0], 2, 'P'],
  ['大きな谷を越えて', [6, 11], [21, 16], [['W', 13, 7, 2, 14]], [2, 1, 1, 0], 2, 'B'],
  ['空まで届け', [8, 10], [32, 14], [['W', 19, 7, 2, 14]], [3, 2, 2, 0], 3, null],
  ['てこの原理', [13, 26], [25, 9], [['W', 5, 11, 4, 2]], [2, 2, 0, 1], 3, 'S'],
  ['ぐるっと回り道', [6, 27], [34, 9], [['W', 20, 6, 2, 12]], [3, 2, 1, 1], 4, null],
  ['ジャンプ・リレー', [5, 8], [16, 21], [['W', 18, 5, 2, 10]], [3, 2, 3, 1], 5, null],
  ['からくり連鎖', [13, 27], [32, 17], [['W', 22, 5, 2, 10]], [4, 3, 2, 2], 6, null],
  ['最後の大発明', [6, 26], [32, 17], [['W', 17, 25, 2, 10], ['W', 24, 6, 2, 12]], [4, 4, 3, 2], 7, null],
];

const grid = .24;
const stageId = index => String(index + 1).padStart(2, '0');
const point = ([u, v]) => ({x: u * grid, y: v * grid});
const copyPoint = ({x, y}) => ({x, y});

function fixedPart(input, index) {
  const [type, u, v, a, b] = input;
  const coords = {id: `fixed-${index + 1}`, gridX: u, gridY: 30 - v, ...point([u, v])};
  return type === 'W'
    ? {...coords, type: 'W', category: 'obstacle', angleDeg: 0, width: a * grid, height: b * grid}
    : {...coords, type, category: 'fixed', angleDeg: a ?? 0};
}

export function getInitialStages() {
  return stages.map(([name, ball, goal, fixed, inventory, star3Target, required], index) => ({
    id: stageId(index), name, ball: point(ball), goal: point(goal), fixed: fixed.map(fixedPart),
    inventory: Object.fromEntries(PART_TYPES.map((type, i) => [type, inventory[i]])), star3Target, required,
  }));
}

export function getStages() {
  const result = getInitialStages();
  result[7].goal.x += grid;
  const final = result[9];
  final.goal.x -= 2 * grid;
  final.goal.y -= 2 * grid;
  final.fixed[0].gridX -= 1;
  final.fixed[0].x = final.fixed[0].gridX * grid;
  return result;
}

export function validateStageSet(entries) {
  if (!Array.isArray(entries) || entries.length !== stages.length) return false;
  const ids = new Set(entries.map(stage => stage?.id));
  return stages.every((_, index) => ids.has(stageId(index)));
}

export function resolveStageHint(identity, hints, level, confirmPlacement = false) {
  if (level === 3 && !confirmPlacement) return null;
  const value = hints.find(item => item.level === level && item.compatibilityId === identity.compatibilityId);
  return value ? structuredClone(value) : null;
}

const partName = {P: 'platform', R: 'ramp', S: 'seesaw', B: 'spring'};
const engineSha = '70d3eed1eb7714823f93718fd90b671a41b9c7920b568f06dde695172eda16f1';
const approvedSeesawMassRatio = 2.5;
const decimal = value => Number(value.toFixed(6));

export function canonicalPayload(value) {
  if (Array.isArray(value)) return value.map(canonicalPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalPayload(value[key])]));
  }
  if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Non-canonical stage value');
  }
  return value;
}

async function payloadSha256(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalPayload(payload)));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function geometryPayload(stage) {
  const obstacleOrder = (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height;
  const fixedPartOrder = (a, b) => partName[a.type] < partName[b.type] ? -1 : partName[a.type] > partName[b.type] ? 1
    : a.x - b.x || a.y - b.y || a.angleDeg - b.angleDeg;
  const fixedParts = stage.fixed.filter(p => p.type !== 'W').sort(fixedPartOrder)
    .map(p => ({type: partName[p.type], xM: decimal(p.x), yM: decimal(p.y), angleDeg: p.angleDeg}));
  const obstacles = stage.fixed.filter(p => p.type === 'W').sort(obstacleOrder)
    .map(p => ({xM: decimal(p.x), yM: decimal(p.y), widthM: decimal(p.width), heightM: decimal(p.height)}));
  const partShapes = Object.entries(partName).map(([type, name]) => {
    const {width, height, angles} = getPartDefinition(type);
    return {type: name, widthM: width, heightM: height, allowedAnglesDeg: angles, anchor: 'center'};
  });
  return {
    domain: 'game-0010/geometry/v1', stageId: stage.id, world: {widthM: 9.6, heightM: 7.2},
    grid: {logicalWidth: 960, logicalHeight: 720, logicalStep: 24, unitsPerM: 100,
      origin: 'top-left', angleConvention: 'clockwise', snapRule: 'floor-half-up'},
    ballRadius: BALL.radius, ballInitial: {xM: decimal(stage.ball.x), yM: decimal(stage.ball.y)},
    partShapes, fixedParts, obstacles,
    goalProtection: {originXM: decimal(stage.goal.x), originYM: decimal(stage.goal.y),
      minXM: -.76, maxXM: .76, minYM: -.16, maxYM: .80},
    inventory: Object.fromEntries(Object.entries(partName).map(([type, name]) => [name, stage.inventory[type]])),
    sweepEnvelope: {anglesDeg: [-32, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 32], expandM: .065},
    validatorRulesVersion: 'v1',
  };
}

export function physicsPayload() {
  const {radius, mass, linearDamping, angularDamping, maxSpeed, maxAngularSpeed} = BALL;
  const {limitDegrees, angularDamping: boardDamping, motor} = getPartDefinition('S').joint;
  const materials = Object.fromEntries(Object.entries(MATERIALS).map(([key, value]) => [partName[key] ?? key, value]));
  return {
    domain: 'game-0010/physics/v1', engineSha, profile: SELECTED_PHYSICS_PROFILE.replace('PP', 'PP-'),
    gravity: DEFAULT_GRAVITY, ball: {radiusM: radius, massKg: mass, linearDamping, angularDamping, bullet: true, rotationEnabled: true},
    materials, speedLimits: {ballLinearCap: maxSpeed, ballAngularCap: maxAngularSpeed,
      abnormalBallLinear: ABNORMAL_SPEED, abnormalBallAngular: ABNORMAL_ANGULAR_SPEED,
      abnormalBoardLinear: ABNORMAL_SPEED, abnormalBoardAngular: ABNORMAL_ANGULAR_SPEED},
    solver: {gameHz: 60, ...PHYSICS_PROFILES[SELECTED_PHYSICS_PROFILE], allowSleep: false},
    collisionRulesVersion: 'v1',
    spring: {launchSpeed: 9.5, approachMin: .4, normalAngleMax: 30, faceDistanceMax: .025, endGapMax: .25,
      blockDotMax: -.5, releaseGapMin: .04, releaseTicks: 2, algorithmVersion: 'v1'},
    seesaw: {limitDeg: limitDegrees, massRatio: approvedSeesawMassRatio, angularDamping: boardDamping, motorEnabled: motor, algorithmVersion: 'v1'},
    physicsRulesVersionTag: 'v1',
  };
}

export async function getStageIdentity(stage) {
  const geometryId = await payloadSha256(geometryPayload(stage));
  const physicsRulesVersion = await payloadSha256(physicsPayload());
  const type = stage.required === 'slope' ? 'rotated-ramp' : partName[stage.required] ?? 'none';
  const compatibilityId = await payloadSha256({
    domain: 'game-0010/compatibility/v1', stageId: stage.id, geometryId, physicsRulesVersion,
    requiredUsage: {type, ruleVersion: 'v1'},
    goalRule: {innerMinX: -.61, innerMaxX: .61, innerMinY: -.01, innerMaxY: .72,
      speedMax: .15, stableTicks: 30, comparisonEpsilonM: 1e-6, ruleVersion: 'v1'},
    boundaryRule: {mode: 'edge-lines', ruleVersion: 'v1'},
    timeLimit: {maxTicks: 1200, gameHz: 60},
    terminalPriority: ['ERROR', 'CLEAR', 'REQUIRED_MISSING', 'OUT_OF_BOUNDS', 'TIMEOUT', 'CONTINUE'],
    star3Target: stage.star3Target, evaluationRulesVersion: 'v1',
  });
  return {geometryId, physicsRulesVersion, compatibilityId};
}

export function buildStageDesign(stage, parts) {
  let editor = createDesignEditor();
  for (const [i, p] of canonicalDesign(parts).entries()) {
    const applied = applyEditCommand(editor, stage, {type: 'add', id: `part-${i + 1}`,
      partType: p.type, gridX: p.gridX, gridY: p.gridY, angleDeg: p.angleDeg});
    if (!applied.ok) return {ok: false, reason: applied.reason, part: p};
    editor = applied.state;
  }
  return {ok: true, placements: editor.placements};
}

export function createStageExperiment(stage, placements, {runId, observe, observePresentation = false} = {}) {
  const design = buildStageDesign(stage, placements);
  if (!design.ok) throw new RangeError(`Illegal stage design: ${design.reason}`);
  let bodyObservations=[];
  const observer=observePresentation?row=>{
    bodyObservations.push(row);
    observe?.(row);
  }:observe;
  const runtime = createWorld({runId, observe:observer});
  const {world} = runtime;
  try {
    const ordered = canonicalizePlacements([
      ...stage.fixed,
      ...design.placements.map(p => ({...p, category: 'placed'})),
    ]);
    const obstacles = ordered.filter(p => p.type === 'W')
      .map(p => createStaticBody(world, {...p, kind: 'obstacle'}));
    const goalBodies = createGoal(world, stage.goal);
    const parts = ordered.filter(p => p.type !== 'W').map(p => {
      const definition = getPartDefinition(p.type);
      const center = p.category === 'fixed' ? copyPoint(p) : {x: p.gridX * grid, y: (30 - p.gridY) * grid};
      const bodyData = {...definition, ...center, id: p.id, kind: p.type, angleDeg: p.angleDeg};
      // E4's approved board ratio is frozen in EG-05. Joints follow all rectangles in the native creation order.
      const body = p.type === 'S'
        ? createDynamicBody(world, {...bodyData, density: approvedSeesawMassRatio * BALL.mass / (definition.width * definition.height),
          angularDamping: definition.joint.angularDamping})
        : createStaticBody(world, bodyData);
      return {...p, center, body, fixed: p.category !== 'placed'};
    });
    for (const part of parts) {
      if (part.type === 'S') part.joint = createRevoluteJoint(world, part.body, {
        ...part.center, angleLimitDegrees: getPartDefinition('S').joint.limitDegrees,
      });
    }
    const ball = createBall(world, stage.ball);
    const solidBodies = [...obstacles, ...goalBodies, ...parts.map(p => p.body)];
    const rules = createRuleSimulation(runtime, {ball, goal: stage.goal, solidBodies, parts, requirement: stage.required});
    let terminal = {status: 'RUNNING', code: null};
    return {
      runId: runtime.runId,
      placements: design.placements,
      get result() { return terminal; },
      step() {
        if (terminal.status !== 'RUNNING') return null;
        bodyObservations=[];
        const state = rules.advanceTick();
        terminal = evaluateTerminal(state);
        return {...state, ...terminal,
          ...(observePresentation?{presentation:{bodyObservations,contacts:collectContactEvidence(runtime)}}:{}),
          stars: starsForResult(terminal.status, design.placements.length, stage.star3Target)};
      },
      dispose() { disposeWorld(runtime); },
    };
  } catch (error) {
    disposeWorld(runtime);
    throw error;
  }
}
