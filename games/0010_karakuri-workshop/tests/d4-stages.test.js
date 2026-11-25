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

test('TC-D4-001-C001 only the ten stage IDs are legal', () => {
  const originals = stages.getInitialStages();
  assert(stages.validateStageSet(originals));
  assert(!stages.validateStageSet(originals.slice(1)));
  assert(!stages.validateStageSet([...originals.slice(1), originals[1]]));
  assert(!stages.validateStageSet([...originals, {...originals[0], id:'11'}]));
});

test('TC-D4-003-C001 fixed structures and goal protection fit the board', () => {
  for (const stage of stages.getInitialStages()) assert(governance.validateInitialGeometry(stage), stage.id);
});

test('TC-D4-005-C001 approved inventory and star boundaries', () => {
  const initial = stages.getInitialStages();
  const counts = initial.map(s => [s.star3Target, Object.values(s.inventory).reduce((a,b) => a+b,0)]);
  assert.deepEqual(counts, [[1,1],[1,2],[2,4],[2,4],[3,7],[3,5],[4,7],[5,9],[6,11],[7,13]]);
  const [first, second, , fourth, , , , , , last] = initial;
  assert.equal(governance.checkAdjustment(first, {...first,inventory:{...first.inventory,R:2}}).ok, false);
  assert.equal(governance.checkAdjustment(second, {...second,inventory:{...second.inventory,R:3}}).ok, true);
  assert.equal(governance.checkAdjustment(second, {...second,inventory:{...second.inventory,B:1}}).ok, false);
  assert.equal(governance.checkAdjustment(fourth, {...fourth,inventory:{...fourth.inventory,B:0}}).ok, false);
  assert.equal(governance.checkAdjustment(last, {...last,inventory:{...last.inventory,B:4}}).ok, false);
});

test('TC-D4-019-C001 generate every independently enumerated one-step legal layout', () => {
  const stage = stages.getInitialStages()[2];
  const base = search.fromSeed(seeds['03'].A);
  const expected = new Set();
  for (const [i,p] of base.entries()) {
    for (const [dx,dy,a] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,-15],[0,0,15]]) {
      if (p.type === 'P' && a) continue;
      const changed=base.map((part,j) => j===i?{
        ...part,gridX:part.gridX+dx,gridY:part.gridY+dy,angleDeg:part.angleDeg+a,
      }:part);
      if(stages.buildStageDesign(stage,changed).ok)expected.add(search.placementKey(changed));
    }
  }
  const actual = search.generateNeighbors(stage,base).legal.map(search.placementKey);
  assert.deepEqual(new Set(actual),expected);
  assert.equal(actual.length,expected.size);
  assert(!actual.includes(search.placementKey(base)));
});

test('TC-D4-020-C001 illegal moves do not enter the legal denominator', () => {
  const stage = stages.getInitialStages()[0];
  const edge = [{type:'R',gridX:4,gridY:28,angleDeg:0}];
  const {legal,rejected}=search.generateNeighbors(stage,edge);
  assert(rejected.some(row=>row.reason==='BOARD_BOUNDS'));
  assert(!legal.some(row=>search.placementKey(row)===search.placementKey(edge)));
  assert.equal(stages.buildStageDesign(stage,[...edge,{type:'R',gridX:33,gridY:24,angleDeg:0}]).reason,'INVENTORY');
});

test('TC-D4-025-C001 authorized cumulative geometry and size ranges', () => {
  const initial=stages.getInitialStages()[7];
  const moved=structuredClone(initial);
  moved.goal.x+= .48;
  moved.goal.y-= .48;
  moved.fixed[0].x-= .48;
  moved.fixed[0].gridX-=2;
  moved.fixed[0].width+=.24;
  assert.deepEqual(governance.checkAdjustment(initial,moved),{ok:true});
  moved.fixed[0].width+=.24;
  assert.deepEqual(governance.checkAdjustment(initial,moved),{ok:false,reason:'OBSTACLE_SIZE'});
});

test('TC-D4-028-C001 reserve at the last legal unit and reject at either search ceiling', () => {
  const {permitsStageSearchSimulations}=require('../qa/harness/budget.js');
  const {budgets}=require('../../../handoffs/game-0010/15_execution_policy.json');
  assert.equal(permitsStageSearchSimulations({stageUsed:1999,totalUsed:19999,request:1},budgets),true);
  assert.equal(permitsStageSearchSimulations({stageUsed:2000,totalUsed:19999,request:1},budgets),false);
  assert.equal(permitsStageSearchSimulations({stageUsed:1999,totalUsed:20000,request:1},budgets),false);
});

test('TC-D4-030-C001 real geometry identity matches the frozen vector and order is canonical', async () => {
  const initial=stages.getInitialStages();
  const first=await stages.getStageIdentity(initial[0]);
  assert.equal(first.geometryId,'c43f9098db281443248095daf4836acfaddf6750c896df3859e61e1ad5013f36');
  const original=await stages.getStageIdentity(initial[9]);
  const reversed=await stages.getStageIdentity({...initial[9],fixed:[...initial[9].fixed].reverse()});
  assert.deepEqual(original,reversed);
  const revised=await stages.getStageIdentity(stages.getStages()[9]);
  assert.notEqual(original.geometryId,revised.geometryId);
  assert.notEqual(original.compatibilityId,revised.compatibilityId);
  assert.equal(original.physicsRulesVersion,revised.physicsRulesVersion);
});
