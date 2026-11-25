import {getPartDefinition, PART_TYPES} from './part-definitions.js';
import {BALL} from './physics-config.js';
import {applyEditCommand, canonicalDesign, createDesignEditor} from '../domain/design-editor.js';
import {createGoal, createRuleSimulation, evaluateTerminal} from '../domain/result-evaluator.js';
import {starsForResult} from '../domain/score-service.js';
import {createWorld, disposeWorld} from '../physics/adapter.js';
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

export function createStageExperiment(stage, placements, {runId, observe} = {}) {
  const design = buildStageDesign(stage, placements);
  if (!design.ok) throw new RangeError(`Illegal stage design: ${design.reason}`);
  const runtime = createWorld({runId, observe});
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
        ? createDynamicBody(world, {...bodyData, density: 2.5 * BALL.mass / (definition.width * definition.height),
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
        const state = rules.advanceTick();
        terminal = evaluateTerminal(state);
        return {...state, ...terminal,
          stars: starsForResult(terminal.status, design.placements.length, stage.star3Target)};
      },
      dispose() { disposeWorld(runtime); },
    };
  } catch (error) {
    disposeWorld(runtime);
    throw error;
  }
}
