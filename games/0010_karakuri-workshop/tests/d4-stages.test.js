'use strict';

const assert = require('node:assert/strict');
const {before, test} = require('node:test');
const seeds = require('../qa/fixtures/solutions.json').seeds;
let stages, search, governance;

before(async () => {
  [stages, search, governance] = await Promise.all([
    import('../src/data/stage-definitions.js'),
    import('../qa/harness/stage-search.js'),
    import('../qa/harness/adjustment-governance.js'),
  ]);
});

test('TC-D4-002-C001 translate the frozen lower-left coordinates', () => {
  assert.deepEqual(search.fromSeed([['R', 10, 20, 30], ['R', 3, 28.5, 0]]),
    [{type:'R', gridX:10, gridY:10, angleDeg:30}, {type:'R', gridX:3, gridY:1.5, angleDeg:0}]);
  assert.deepEqual(stages.getInitialStages()[0].ball, {x:.72, y:6.84});
});

test('TC-D4-004-C001 all frozen initial ball, goal and fixed geometry are compatible', t => {
  const results = stages.getInitialStages().map(stage => ({id:stage.id, legal:governance.validateInitialGeometry(stage)}));
  assert(results.every(stage => stage.legal));
  t.diagnostic(JSON.stringify(results));
});

for (const id of ['TC-D4-006-C001','TC-D4-006-C002']) test(`${id} the 17 initial layouts are legal through normal commands`, t => {
  const results = stages.getInitialStages().flatMap(stage =>
    Object.entries(seeds[stage.id]).map(([id, parts]) => ({id, stage:stage.id,
      placements:stages.buildStageDesign(stage, search.fromSeed(parts))})));
  assert.equal(results.length, 17);
  assert(results.every(row => row.placements.ok));
  t.diagnostic(JSON.stringify(results));
});

for (const [i, stage, legal, success, expected] of [
  [1,'01',6,3,true], [2,'04',10,2,true], [3,'04',11,2,false], [4,'01',4,1,false],
]) test(`TC-D4-021-C00${i} frozen robustness boundary`, () => {
  const actual = search.evaluateRobustness({id:stage}, Array.from({length:legal}, (_, i) =>
    ({end:i<success?'CLEARED':'FAILED'})));
  assert.equal(actual.pass, expected);
});

test('TC-D4-022-C001 reject empty and insubstantial legal neighborhoods', () => {
  for (const [id, n] of [['01',0],['01',3],['10',9]]) {
    assert.equal(search.evaluateRobustness({id}, Array(n).fill({end:'CLEARED'})).pass, false);
  }
});

test('TC-D4-026-C001 adjustments remain relative to frozen initial baseline', () => {
  const initial=stages.getInitialStages()[1];
  const shifted=x => ({...initial, goal:{...initial.goal, x:initial.goal.x+x}});
  assert.deepEqual(governance.checkAdjustment(initial, shifted(.48)), {ok:true});
  assert.deepEqual(governance.checkAdjustment(initial, shifted(.72)), {ok:false,reason:'GOAL_DISPLACEMENT'});
});

test('TC-D4-027-C001 immutable gameplay and common physics stay fixed', () => {
  const initial=stages.getInitialStages()[3];
  for (const changed of [{star3Target:3},{required:'R'},{ball:{...initial.ball,x:initial.ball.x+.24}}]) {
    assert.deepEqual(governance.checkAdjustment(initial,{...initial,...changed}),
      {ok:false,reason:'IMMUTABLE_STAGE_FIELD'});
  }
  assert.deepEqual(governance.checkAdjustment(initial,initial,{physicsUnchanged:false}), {ok:false,reason:'COMMON_PHYSICS'});
});

test('TC-D4-029-C001 order and operation IDs do not affect the canonical key', () => {
  const base=search.fromSeed(seeds['03'].A);
  const modified=[...base].reverse().map((p,i)=>({...p,id:`new-${i}`}));
  assert.equal(search.placementKey(base),search.placementKey(modified));
});
