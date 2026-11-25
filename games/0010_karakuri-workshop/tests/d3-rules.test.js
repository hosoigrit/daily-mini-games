'use strict';

const assert = require('node:assert/strict');
const {before, test} = require('node:test');
let rules, scores, tutorial, trajectory, engine, placement;
before(async () => {
  [rules, scores, tutorial, trajectory, engine, placement] = await Promise.all([
    import('../src/domain/result-evaluator.js'), import('../src/domain/score-service.js'),
    import('../src/domain/tutorial-evaluator.js'), import('../src/physics/trajectory-recorder.js'),
    import('../src/physics/adapter.js'), import('../src/domain/placement-validator.js'),
  ]);
});

function child(parent, index, description, check) {
  test(`${parent}-C${String(index).padStart(3, '0')} ${description}`, t => {
    t.diagnostic(JSON.stringify(check()));
  });
}

const origin = {x: 4.8, y: 2.4};
const sample = (x = 0, y = .3, speed = .10) => ({
  position: {x: origin.x + x, y: origin.y + y}, velocity: {x: speed, y: 0}, penetration: 0,
});
const runStatus = {status: 'RUNNING', code: null};
const clearStatus = {status: 'CLEARED', code: null};
const positionAt = tick => ({x: 1 + tick * .001, y: 2});
const shapeRows = [
  {x: 0, y: -.08, width: 1.52, height: .16},
  {x: -.68, y: .36, width: .16, height: .72},
  {x: .68, y: .36, width: .16, height: .72},
];
const design = (n, gx = 0) => Array.from({length: n}, (_, i) => ({
  id: `p${i}`, type: 'R', gridX: gx + i, gridY: 5, angleDeg: 0,
}));
const start = (session, id, n = 2, stageId = '01', compatibility = 'A') =>
  session.start({id, initialPosition: positionAt(0), placements: design(n), stageId, compatibility, star3Target: 3});

child('TC-D3-001', 1, 'goal rectangle dimensions', () => {
  const actual = rules.goalGeometry();
  assert.deepEqual(actual, shapeRows);
  return {expected: shapeRows, actual};
});
child('TC-D3-001', 2, 'physical goal fixture material and transforms', () => {
  const runtime = engine.createWorld();
  try {
    const bodies = rules.createGoal(runtime.world, origin);
    const actual = bodies.map(body => {
      const {x, y} = body.getPosition();
      const fixture = body.getFixtureList();
      const {m_vertices: corners} = fixture.getShape();
      const width = Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x));
      const height = Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y));
      return {x, y, width, height, fixed: body.isStatic(), restitution: fixture.getRestitution()};
    });
    const expected = shapeRows.map(box => ({...box, x: origin.x + box.x, y: origin.y + box.y, fixed: true, restitution: 0}));
    assert.deepEqual(actual, expected);
    return {input: origin, expected, actual};
  } finally {
    engine.disposeWorld(runtime);
  }
});
child('TC-D3-002', 1, 'empty goal volume and open entrance remain protected', () => {
  const stage = {ball: {x: 2, y: 6}, goal: origin, fixed: [], inventory: {P: 5}};
  const input = [[20, 18], [20, 17], [20, 16], [23, 17]].map(([gridX, gridY]) => ({type: 'P', gridX, gridY, angleDeg: 0}));
  const actual = input.map(part => placement.validatePlacement(stage, [], part));
  const expected = input.map(() => ({ok: false, reason: 'GOAL_PROTECTION'}));
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});

function inside(parent, index, x, y, expected) {
  child(parent, index, 'goal boundary', () => {
    const input = sample(x, y).position;
    const actual = rules.isInsideGoal(input, origin);
    assert.equal(actual, expected);
    return {input, expected, actual};
  });
}
inside('TC-D3-003', 1, 0, .30, true);
inside('TC-D3-004', 1, 0, .60, false);
[[.41, .30, true], [.410002, .30, false], [-.41, .30, true], [-.410002, .30, false],
  [0, .19, true], [0, .189998, false], [0, .52, true], [0, .520002, false]]
  .forEach(([x, y, expected], i) => inside('TC-D3-005', i + 1, x, y, expected));
for (const [parent, speeds, expected] of [['TC-D3-006', [0, .1, .15], true], ['TC-D3-007', [.1501, .25], false]]) {
  speeds.forEach((speed, i) => child(parent, i + 1, 'parallel speed bound', () => {
    const input = sample(0, .3, speed);
    const actual = rules.isStableGoalObservation(input, origin);
    assert.equal(actual, expected);
    return {input, expected, actual};
  }));
}

function stabilityThrough(end, originTick = 100, tracker = rules.createGoalStability(origin)) {
  let result;
  for (let tick = originTick; tick <= end; tick++) {
    result = tracker.observe(tick, [sample()]);
    if (tick < originTick + 30) assert.equal(result.achieved, false);
  }
  return result;
}
for (const [parent, tick, expected] of [['TC-D3-008', 129, false], ['TC-D3-009', 130, true]]) {
  child(parent, 1, 'rounded stability intervals', () => {
    const report = stabilityThrough(tick);
    const status = rules.evaluateTerminal({tick, position: sample().position, stable: report.achieved, requiredUse: true});
    const actual = {status: status.status, intervals: report.intervals};
    const target = {status: expected ? 'CLEARED' : 'RUNNING', intervals: tick - 100};
    assert.deepEqual(actual, target);
    return {input: {firstStableTick: 100, tick, sample: sample()}, expected: target, actual};
  });
}
for (const index of [1, 2]) {
  child('TC-D3-010', index, 'one complete interval invalid resets before next anchor', () => {
    const actual = [sample(0, .3, .1501), sample(0, .6)].map(violator => {
      const tracker = rules.createGoalStability(origin);
      const initial = stabilityThrough(129, 100, tracker);
      const bad = tracker.observe(130, [violator]);
      const next = tracker.observe(131, [sample()]);
      const final = stabilityThrough(161, 132, tracker);
      return [initial.intervals, bad.intervals, next.intervals, final.intervals];
    });
    const expected = [[29, 0, 0, 30], [29, 0, 0, 30]];
    assert.deepEqual(actual, expected);
    return {input: ['one speed excursion to .1501', 'one local y=.60 excursion'], expected, actual};
  });
}
child('TC-D3-011', 1, 'stable ends do not conceal inside-tick violation', () => {
  const tracker = rules.createGoalStability(origin);
  stabilityThrough(129, 100, tracker);
  const input = [sample(), sample(0, .3, .1501), sample()];
  const reset = tracker.observe(130, input);
  const actual = [reset.intervals, tracker.observe(131, [sample()]).intervals];
  const expected = [0, 1];
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});

const statusAt = (x, y, extra = {}) => rules.evaluateTerminal({tick: 20, position: {x, y}, stable: false, ...extra});
function edge(parent, index, coordinates, expected) {
  child(parent, index, 'outer escape boundaries', () => {
    const actual = coordinates.map(([x, y]) => statusAt(x, y));
    assert.deepEqual(actual, coordinates.map(() => expected));
    return {input: coordinates, expected, actual};
  });
}
const nearEdges = [[-.10, 3], [9.70, 3], [4, -.10], [4, 7.30]];
edge('TC-D3-013', 1, nearEdges, runStatus);
nearEdges.forEach((pair, i) => edge('TC-D3-013', i + 2, [pair], runStatus));
const pastEdges = [[-.21, 3], [9.81, 3], [4, -.21], [4, 7.41], [-.21, -.21], [9.81, 7.41]];
[['FL-001'], ['FL-002'], ['FL-003'], ['FL-004'], ['FL-003', 'FL-001'], ['FL-004', 'FL-002']]
  .forEach((directions, i) => edge('TC-D3-014', i + 1, [pastEdges[i]],
    {status: 'FAILED', code: directions[0], directions}));
const exactEdges = [[-.2, 3], [9.8, 3], [4, -.2], [4, 7.4]];
edge('TC-D3-015', 1, exactEdges, runStatus);
[[-.19, -.19], [9.79, 7.39], [-.20, -.20], [9.80, 7.40], ...exactEdges]
  .forEach((pair, i) => edge('TC-D3-015', i + 2, [pair], runStatus));
for (const [id, index, input, expected] of [
  ['TC-D3-016', 1, {tick: 1199}, runStatus],
  ['TC-D3-017', 1, {tick: 1200}, {status: 'FAILED', code: 'FL-005'}],
  ['TC-D3-018', 1, {tick: 1200, stable: true, requiredUse: true}, clearStatus],
  ['TC-D3-019', 1, {stable: true, requiredUse: true, error: true}, {status: 'ERROR', code: 'PHYSICS_ERROR'}],
  ['TC-D3-020', 1, {stable: true, requiredUse: false}, {status: 'FAILED', code: 'FL-006'}],
]) child(id, index, 'terminal evaluation', () => {
  const actual = statusAt(4, 3, input);
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});
for (const [id, error, expected] of [['TC-D3-018', false, 'CLEARED'], ['TC-D3-019', true, 'ERROR']]) {
  child(id, 2, 'terminal precedence inside result session', () => {
    const notifications = [];
    const session = rules.createResultSession({onTerminal: event => notifications.push(event)});
    start(session, 'A');
    const tracker = rules.createGoalStability(origin);
    const stable = stabilityThrough(1200, 1170, tracker);
    const input = {tick: 1200, position: sample().position, stable: stable.achieved, requiredUse: true, error};
    session.step('A', () => input);
    const actual = session.read();
    assert.equal(actual.phase, expected);
    assert.equal(actual.revision, error ? 0 : 1);
    assert.equal(notifications.length, 1);
    return {input, expected, actual, notifications};
  });
}
child('TC-D3-021', 1, 'stale abandoned run cannot update active run', () => {
  const notifications = [];
  const session = rules.createResultSession({onTerminal: event => notifications.push(event)});
  start(session, 'A');
  for (let tick = 1; tick <= 10; tick++) session.step('A', () => ({tick, position: positionAt(tick)}));
  session.abort();
  start(session, 'B');
  const before = JSON.stringify(session.read());
  const input = ['CLEARED', 'FAILED', 'STAR', 'TRAJECTORY'];
  const actual = input.map(status => session.accept('A', {status}, 10, positionAt(10)));
  assert.deepEqual(actual, [false, false, false, false]);
  assert.equal(JSON.stringify(session.read()), before);
  assert.deepEqual(notifications, []);
  return {input, expected: [false, false, false, false], actual, before, after: session.read(), notifications};
});
child('TC-D3-022', 1, 'ten duplicate terminal notifications each', () => {
  const rows = ['CLEARED', 'FAILED'].map(status => {
    const notifications = [];
    const session = rules.createResultSession({onTerminal: event => notifications.push(event)});
    start(session, 'A');
    const accepted = Array.from({length: 10}, () => session.accept('A', {status}, 15, positionAt(15)));
    assert.deepEqual(accepted, [true, ...Array(9).fill(false)]);
    assert.equal(session.read().revision, status === 'CLEARED' ? 1 : 0);
    assert.equal(notifications.length, 1);
    assert.equal(session.read().previousTrajectory.runId, 'A');
    return {status, accepted, state: session.read(), notifications};
  });
  return {input: '10 events per isolated world', expected: 'one event and one trajectory replacement per run', actual: rows};
});

const rampInput = (delta, extra = {}) => {
  const {angleDeg = 15, ...flags} = extra;
  const theta = angleDeg * Math.PI / 180;
  return {id: 'R', angleDeg, continuous: true, from: {x: 0, y: 0},
    to: {x: delta * Math.cos(theta), y: -delta * Math.sin(theta)}, ...flags};
};
function runRamp(input, slope = false) {
  let state;
  return input.map(item => (state = tutorial.rampTick(state, item, slope)));
}
child('TC-D3-023', 1, 'three signed ramp intervals at .24', () => {
  const input = [.10, .10, .04].map(delta => rampInput(delta));
  const actual = runRamp(input);
  assert.equal(actual[2].intervals, 3);
  assert.equal(actual[2].achieved, true);
  return {input, expected: [.24, true], actual};
});
child('TC-D3-024', 1, 'one millimeter below minimum', () => {
  const input = [.10, .10, .039, .001].map(delta => rampInput(delta));
  const actual = runRamp(input);
  assert.equal(actual[2].achieved, false);
  assert.equal(actual[3].achieved, true);
  return {input, expected: [false, true], actual};
});
child('TC-D3-025', 1, 'three oppositely signed pairs', () => {
  const input = [.1, -.1, .1, -.1, .1, -.1].map(delta => rampInput(delta));
  const actual = runRamp(input);
  assert.equal(actual[5].displacement, 0);
  assert.equal(actual[5].achieved, false);
  return {input, expected: {displacement: 0, achieved: false}, actual};
});
child('TC-D3-026', 1, 'horizontal ramp is insufficient when slope is required', () => {
  const input = [0, 15, -15].map(angleDeg => [.10, .10, .04]
    .map(delta => rampInput(angleDeg < 0 ? -delta : delta, {angleDeg})));
  const actual = input.map(records => Boolean(runRamp(records, true).at(-1)?.achieved));
  const expected = [false, true, true];
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});
[.15, .20, .25, .30].forEach((ballMass, i) => child('TC-D3-027', i + 1, 'upper platform impulse per given mass', () => {
  const input = {upper: true, ballMass, approachSpeed: .20, impulseY: [.015, .020, .025, .030][i]};
  const actual = tutorial.qualifiesPlatformUse(input);
  assert.equal(actual, true);
  return {input, expected: true, actual};
}));
[{upper: false, approachSpeed: .20, impulseY: .02}, {upper: true, approachSpeed: .19, impulseY: .02},
  {upper: true, approachSpeed: .20, impulseY: .0198}].forEach((data, i) =>
  child('TC-D3-028', i + 1, 'isolated unqualified platform event', () => {
    const input = {...data, ballMass: .20};
    const actual = tutorial.qualifiesPlatformUse(input);
    assert.equal(actual, false);
    return {input, expected: false, actual};
  }));
child('TC-D3-029', 1, 'only the selected live current spring event counts', () => {
  const evaluator = tutorial.createTutorialEvaluator('cur', [{id: 'B1', type: 'B'}], 'B');
  const input = [
    {type: 'SPRING_CANDIDATE', runId: 'cur', springId: 'B1'},
    {type: 'SPRING_ACTIVATED', runId: 'old', springId: 'B1'},
    {type: 'SPRING_ACTIVATED', runId: 'cur', springId: 'B1'},
  ];
  const actual = input.map(event => {
    evaluator.observeSpring(event);
    return evaluator.snapshot().achieved;
  });
  const expected = [false, false, true];
  assert.deepEqual(actual, expected);
  assert.equal(evaluator.snapshot().achieved, true);
  return {input, expected, actual};
});
child('TC-D3-030', 1, 'side, underside, and losing candidates remain unused', () => {
  const input = [
    {type: 'SPRING_REJECTED', reason: 'side', springId: 'B2', runId: 'cur'},
    {type: 'SPRING_REJECTED', reason: 'underside', springId: 'B2', runId: 'cur'},
    {type: 'SPRING_CANDIDATE', springId: 'B2', runId: 'cur'},
    {type: 'SPRING_ACTIVATED', springId: 'B1', runId: 'cur'},
  ];
  const actual = [true, false].map(fixed => {
    const evaluator = tutorial.createTutorialEvaluator('cur', [{id: 'B1', type: 'B', fixed}, {id: 'B2', type: 'B'}], 'B');
    input.forEach(event => evaluator.observeSpring(event));
    return evaluator.snapshot();
  });
  const expected = [{usedIds: [], achieved: false}, {usedIds: ['B1'], achieved: true}];
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});

const makeLoad = overrides => ({
  id: 'S', runId: 'QA-LOAD-A', episode: 'A', upper: true, offset: .12, point: {x: -.12, y: .08},
  pivot: {x: 0, y: 0}, impulse: {x: 0, y: -2e-6}, omegaBefore: 0, omegaAfter: 2e-6,
  angleBefore: 0, angle: Math.PI / 36, ...overrides,
});
function loadVariant(name, overrides = {}, expected = false) {
  const {fixed, endFirst, ...input} = overrides;
  const event = makeLoad(input);
  const evaluator = tutorial.createTutorialEvaluator('QA-LOAD-A', [{id: 'S', type: 'S', fixed}], 'S');
  if (endFirst) {
    evaluator.observeSeesaw(makeLoad({angle: 0}));
    evaluator.observeSeesaw(makeLoad({ended: true, angle: 0}));
  }
  evaluator.observeSeesaw(event);
  const actual = evaluator.snapshot();
  assert.equal(actual.achieved, expected, name);
  assert.deepEqual(actual.usedIds, expected ? ['S'] : [], name);
  return {name, event, expected, actual};
}
const positives = [
  ['baseline', {}],
  ['mirror', {offset: -.12, point: {x: .12, y: .08}, omegaAfter: -2e-6, angle: -Math.PI / 36}],
  ['alreadyMovingAccelerated', {omegaBefore: 1, omegaAfter: 1.000002}],
];
const negatives = [
  ['offsetBelow', {offset: .119}],
  ['zeroImpulse', {impulse: {x: 0, y: 0}}],
  ['impulseAtBoundary', {impulse: {x: 0, y: -1e-6}}],
  ['zeroTorque', {point: {x: 0, y: .08}}],
  ['reverseDeltaOmega', {omegaAfter: -2e-6}],
  ['deltaOmegaAtBoundary', {omegaAfter: 1e-6}],
  ['angleBelow', {angle: 4.99 * Math.PI / 180}],
  ['angleWrongDirection', {angle: -Math.PI / 36}],
  ['otherEpisode', {episode: 'B', endFirst: true, omegaAfter: 0}],
  ['alreadyMovingNoAcceleration', {omegaBefore: 1, omegaAfter: 1}],
  ['alreadyMovingReverseLoad', {omegaBefore: 1, omegaAfter: .999998}],
  ['fixed', {fixed: true}],
  ['stale', {runId: 'QA-LOAD-OLD'}],
  ['center', {offset: 0}],
  ['noContact', {upper: false}],
  ['afterRelease', {endFirst: true, upper: false, omegaBefore: 1, omegaAfter: 1.000002}],
];
child('TC-D3-031', 1, 'causal seesaw threshold table', () =>
  [...positives.map(([name, input]) => loadVariant(name, input, true)),
    ...negatives.map(([name, input]) => loadVariant(name, input))]);
child('TC-D3-032', 1, 'isolated fixed, stale, central, airborne and wrong loads', () =>
  [loadVariant('positive control', {}, true), ...negatives.map(([name, input]) => loadVariant(name, input))]);

for (const [parent, groups, expected] of [
  ['TC-D3-033', [[2, 3], [0], [2], [3]], 3],
  ['TC-D3-034', [[4], [4]], 2],
  ['TC-D3-035', [[5, 6], [5], [6]], 1],
]) groups.forEach((counts, i) => child(parent, i + 1, 'star count uses run starting placements', () => {
  const input = {status: 'CLEARED', counts, target: 3};
  const actual = counts.map(n => scores.starsForResult('CLEARED', n, 3));
  assert.deepEqual(actual, counts.map(() => expected));
  return {input, expected, actual};
}));
const score = (progress, n, overrides = {}) => scores.commitScore(progress, {
  stageId: '01', status: 'CLEARED', compatibility: 'A', star3Target: 3, placements: design(n), ...overrides,
});
child('TC-D3-036', 1, 'failure, hints and undo do not contribute to stars', () => {
  const input = [{failures: 0, undo: 0, hint: null}, {failures: 3}, {undo: 2}, {hint: 1}, {hint: 2}, {hint: 3}];
  const session = rules.createResultSession();
  const actual = input.map((history, i) => {
    session.start({id: String(i), stageId: '01', compatibility: 'A', initialPosition: positionAt(0), placements: design(3),
      star3Target: 3, ...history});
    session.accept(String(i), clearStatus, 1, positionAt(1));
    return session.read().result.stars;
  });
  const expected = [3, 3, 3, 3, 3, 3];
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});
['FAILED', 'ABORTED', 'ERROR'].forEach((status, i) => child('TC-D3-036', i + 2, 'nonclear does not alter saved best', () => {
  const old = score(scores.initialProgress(), 4).progress;
  const actual = score(old, 2, {status});
  assert.equal(actual.progress, old);
  assert.equal(actual.stars, 0);
  return {input: {status, old}, expected: {stars: 0, unchanged: true}, actual};
}));
child('TC-D3-037', 1, 'only a strictly smaller legal design replaces the best', () => {
  const input = [5, 4, 4, 6];
  let progress = scores.initialProgress();
  const actual = input.map((n, i) => {
    const run = score(progress, n, {placements: design(n, i)});
    progress = run.progress;
    const {placedCount, stars, placements} = progress.stages['01'].best;
    return [placedCount, stars, placements[0].gridX];
  });
  const expected = [[5, 1, 0], [4, 2, 1], [4, 2, 1], [4, 2, 1]];
  assert.deepEqual(actual, expected);
  return {input, expected, actual};
});
child('TC-D3-037', 2, 'start captures part objects and the array', () => {
  const session = rules.createResultSession();
  const draft = design(4);
  const expected = structuredClone(draft);
  assert(session.start({id: 'A', stageId: '01', compatibility: 'A', placements: draft, star3Target: 3, initialPosition: positionAt(0)}));
  draft[0].angleDeg = 60;
  draft.splice(1);
  session.accept('A', clearStatus, 1, positionAt(1));
  const actual = session.read().progress.stages['01'].best;
  assert.deepEqual(actual.placements, expected);
  assert.equal(actual.stars, 2);
  return {input: {draft}, expected, actual};
});
child('TC-D3-038', 1, 'new version is compared to no current best', () => {
  const old = score(scores.initialProgress(), 3).progress;
  const actual = score(old, 4, {compatibility: 'B'}).progress.stages['01'];
  const expected = {cleared: true, historicalStars: 3,
    best: {placedCount: 4, stars: 2, compatibility: 'B', placements: design(4)}, previousBest: old.stages['01'].best};
  assert.deepEqual(actual, expected);
  return {input: old.stages['01'], expected, actual};
});
child('TC-D3-039', 1, 'unlock survives a later failure', () => {
  const initial = scores.initialProgress();
  const cleared = score(initial, 3).progress;
  const failed = score(cleared, 2, {status: 'FAILED'}).progress;
  const actual = [initial, cleared, failed].map(progress => scores.unlockedStages(progress));
  const expected = [['01'], ['01', '02'], ['01', '02']];
  assert.deepEqual(actual, expected);
  assert.deepEqual(scores.unlockedStages({stages: {'03': {cleared: true}}}), ['01', '02', '03', '04']);
  return {input: ['initial', 'clear', 'fail'], expected, actual};
});
child('TC-D3-040', 1, 'achievement transitions issue one notification each across a reload', () => {
  let progress = scores.initialProgress();
  const accum = {notifications: [], stars: []};
  function next(id, n) {
    const {progress: successor, achievements} = score(progress, n, {stageId: id});
    progress = successor;
    accum.notifications.push(...achievements);
    accum.stars.push(Object.values(progress.stages).reduce((sum, s) => sum + s.historicalStars, 0));
  }
  for (let index = 1; index < 10; index++) next(`0${index}`, 3);
  assert.deepEqual(accum.notifications, []);
  next('10', 4);
  progress = JSON.parse(JSON.stringify(progress));
  next('10', 3);
  next('10', 3);
  const actual = {notifications: accum.notifications, finalPoints: accum.stars.slice(8)};
  const expected = {notifications: ['ALL_CLEARED', 'ALL_STARS'], finalPoints: [27, 29, 30, 30]};
  assert.deepEqual(actual, expected);
  return {input: '9 perfect stages, stage 10 with 2 then 3 stars', expected, actual};
});

function sampled(end) {
  const rec = trajectory.createTrajectoryRecorder('A', positionAt(0));
  for (let i = 1; i <= end; i++) rec.sample(i, positionAt(i));
  const actual = rec.finish(end, positionAt(end), 'CLEARED');
  const expected = [];
  for (let i = 0; i < end; i += 6) expected.push({tick: i, position: positionAt(i)});
  expected.push({tick: end, position: positionAt(end)});
  assert.deepEqual(actual.points, expected);
  assert.equal(actual.elapsedSeconds, end / 60);
  assert(actual.points.length <= 201);
  return {input: {end}, expected, actual};
}
child('TC-D3-041', 1, 'sample every sixth tick', () => sampled(60));
child('TC-D3-042', 1, 'add non-grid terminal tick once', () => sampled(15));
child('TC-D3-043', 1, 'both long termination trajectories', () => [sampled(1197), sampled(1200)]);
child('TC-D3-043', 2, '1197 tick endpoint', () => sampled(1197));
child('TC-D3-043', 3, '1200 tick endpoint', () => sampled(1200));
child('TC-D3-044', 1, 'clear and normal failed results alone replace trajectory', () => {
  const previous = {runId: 'A', result: 'CLEARED'};
  const session = rules.createResultSession({previousTrajectory: previous});
  const actual = [session.read().previousTrajectory.runId];
  for (const [id, status] of [['B', 'CLEARED'], ['C', 'FAILED'], ['D', 'ABORTED'], ['E', 'ERROR']]) {
    assert(start(session, id));
    assert(session.accept(id, {status}, 15, positionAt(15)));
    actual.push(session.read().previousTrajectory.runId);
  }
  const expected = ['A', 'B', 'C', 'C', 'C'];
  assert.deepEqual(actual, expected);
  return {input: ['CLEARED', 'FAILED', 'ABORTED', 'ERROR'], expected, actual};
});

function gapRows(input, count, used) {
  const actual = runRamp(input);
  assert.equal(actual.at(-1)?.intervals, count);
  assert.equal(actual.at(-1)?.achieved, used);
  return {input, expected: {count, used}, actual};
}
const gap = (distance, displacement = .08) => rampInput(displacement, {continuous: false, distance});
const oneGap = [.004, .005].map(distance => [rampInput(.10), gap(distance), rampInput(.10), rampInput(.04)]);
const largeGap = [rampInput(.10), gap(.005001), rampInput(.10), rampInput(.04)];
const twinGap = [rampInput(.10), gap(.004), gap(.004), rampInput(.14)];
const changeRamp = [rampInput(.12), rampInput(.12, {id: 'another ramp'})];
child('TC-D7-004', 1, 'gap preserves but contributes no distance or contact duration', () =>
  [...oneGap.map(input => gapRows(input, 3, true)), gapRows(largeGap, 2, false), gapRows(twinGap, 1, false),
    gapRows(changeRamp, 1, false)]);
child('TC-D7-004', 3, 'exact .005 bridge', () => gapRows(oneGap[1], 3, true));
child('TC-D7-004', 4, 'excess distance breaks interval', () => gapRows(largeGap, 2, false));
child('TC-D7-004', 5, 'two short gaps break interval', () => gapRows(twinGap, 1, false));
child('TC-D7-004', 6, 'signed backtracking', () => gapRows([.10, .10, -.10, .10].map(delta => rampInput(delta)), 4, false));
child('TC-D7-004', 7, 'different ramps never merge', () => gapRows(changeRamp, 1, false));

child('TC-D7-006', 1, 'stop, abort and resumed terminal delivery have one winner', () => {
  const notifications = [];
  const session = rules.createResultSession({onTerminal: event => notifications.push(event)});
  assert(start(session, 'paused'));
  let attempts = 0;
  const landmark = () => {
    attempts++;
    return {tick: 1200, position: positionAt(1200), stable: true, requiredUse: true};
  };
  session.pause();
  assert.equal(session.step('paused', landmark), false);
  assert.equal(attempts, 0);
  session.resume();
  session.abort();
  assert.equal(session.step('paused', landmark), false);
  assert(start(session, 'new'));
  assert.equal(session.step('paused', landmark), false);
  assert.equal(session.step('new', landmark), true);
  session.abort();
  assert.equal(session.step('new', landmark), false);
  const actual = {attempts, notifications: notifications.length, phase: session.read().phase, revision: session.read().revision};
  const expected = {attempts: 1, notifications: 1, phase: 'CLEARED', revision: 1};
  assert.deepEqual(actual, expected);
  return {expected, actual};
});

test('TC-D3-045-C001 previous trajectory survives design and display controls only', async t => {
  const {applyEditCommand, createDesignEditor} = await import('../src/domain/design-editor.js');
  const previous = {runId: 'A', result: 'CLEARED', points: [{tick: 0, position: positionAt(0)}]};
  const stage = {fixed: [], ball: {x: 2, y: 6}, goal: origin, inventory: {R: 3}};
  const best = [{id: 'best', type: 'R', angleDeg: 0, gridX: 25, gridY: 8}];
  let editor = createDesignEditor({trajectory: previous, best});
  function edit(command) {
    const transition = applyEditCommand(editor, stage, command);
    assert.equal(transition.ok, true, JSON.stringify(transition));
    editor = transition.editor;
    return editor.trajectory;
  }
  const session = rules.createResultSession({previousTrajectory: previous, stageId: '01'});
  const actual = [
    edit({type: 'add', id: 'draft', partType: 'R', gridX: 27, gridY: 10, angleDeg: 0}),
    edit({type: 'undo'}),
  ];
  edit({type: 'request-load-best'});
  actual.push(edit({type: 'confirm'}), trajectory.visibleTrajectory(previous, 'DESIGN', false),
    trajectory.visibleTrajectory(previous, 'DESIGN', true), trajectory.visibleTrajectory(previous, 'RUNNING', true),
    trajectory.visibleTrajectory(previous, 'PAUSED', true));
  edit({type: 'request-reset'});
  actual.push(edit({type: 'confirm'}));
  assert(session.switchStage('02'));
  actual.push(session.read().previousTrajectory, rules.createResultSession().read().previousTrajectory);
  const expected = [previous, previous, previous, null, previous, null, null, null, null, null];
  assert.deepEqual(actual, expected);
  t.diagnostic(JSON.stringify({expected, actual}));
});
