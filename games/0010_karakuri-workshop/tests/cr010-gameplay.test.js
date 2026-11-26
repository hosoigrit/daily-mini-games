import {deepStrictEqual, equal, notEqual, throws} from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {getLegacyStages, getStages, getStageIdentity} from '../src/data/stage-definitions.js';
import {evaluateTerminal} from '../src/domain/result-evaluator.js';
import {normalizeUsageRequirement} from '../src/domain/usage-requirements.js';
import {createTutorialEvaluator} from '../src/domain/tutorial-evaluator.js';
import {starsForResult} from '../src/domain/score-service.js';

const proposal = JSON.parse(readFileSync(new URL('../qa/fixtures/cr010-stage-candidates.json', import.meta.url)));
const mandatory = [{P: 1}, {B: 1}, {B: 1, P: 1}, {S: 1}, {P: 1, S: 1}, {B: 2}, {P: 1, B: 1, S: 1}, {R: 1, P: 1, B: 1, S: 1}];

// Fixed identities from the accepted pre-CR010 stage evidence.
const legacyIdentities = [
  ['c43f9098db281443248095daf4836acfaddf6750c896df3859e61e1ad5013f36',
    '81ac485f061876b5683cf00033a67be4d68afabf792a9af80064c85af6756804'],
  ['3f5cf58d40e42e9aea0f0c092bec56c5025c8686886b4124bf2ba5683caa3390',
    '0c5729d32100654d427e82d956669c2e318b44481d566a9cb3bfae32dfeff8de'],
];
const legacyPhysics = '8e69e82e660d20121e8878dc98e91f86a3ed8759e34d7d071f63a8507fb845bd';

test('CR010-USE-09/10/11/12/13/14 counts distinct eligible IDs in the current run by type', () => {
  const parts = [
    {id: 'springA', type: 'B'}, {id: 'springB', type: 'B'}, {id: 'fixedSpring', type: 'B', fixed: true},
    {id: 'platformA', type: 'P'}, {id: 'fixedPlatform', type: 'P', fixed: true},
  ];
  const evaluator = createTutorialEvaluator('now', parts, {version: 2, counts: {B: 2, P: 1}});
  const spring = (springId, runId = 'now', type = 'SPRING_ACTIVATED') => evaluator.observeSpring({springId, runId, type});
  const platform = (id, runId = 'now') => evaluator.observePlatform({
    id, runId, upper: true, approachSpeed: .21, impulseY: .11, ballMass: 1,
  });
  spring('springA');
  spring('springA');
  spring('springB', 'old');
  spring('springB', 'now', 'SPRING_BLOCKED');
  spring('fixedSpring');
  spring('platformA');
  spring('forged');
  platform('fixedPlatform');
  platform('springB');
  platform('platformA', 'old');
  deepStrictEqual(evaluator.snapshot(), {
    usedIds: ['springA'], achieved: false, counts: {R: 0, P: 0, B: 1, S: 0}, missing: {P: 1, B: 1},
  });
  spring('springB');
  equal(evaluator.snapshot().achieved, false);
  platform('platformA');
  platform('platformA');
  deepStrictEqual(evaluator.snapshot(), {
    usedIds: ['springA', 'springB', 'platformA'], achieved: true, counts: {R: 0, P: 1, B: 2, S: 0}, missing: {},
  });
});

test('CR010-USE-15 rejects unknown, empty, unversioned and out-of-stock requirements', () => {
  const inventory = {R: 2, P: 1, B: 3, S: 0};
  for (const requirement of [
    {version: 1, counts: {P: 1}}, {version: 2, counts: {}}, {version: 2, counts: {W: 1}},
    {version: 2, counts: {B: 0}}, {version: 2, counts: {B: 1.1}}, {version: 2, counts: {B: '2'}},
    {version: 2, counts: {P: 2}}, {version: 2, counts: {P: 1}, extra: true}, ['R', 'P'],
    Object.assign(Object.create({version: 2}), {counts: {P: 1}, extra: true}),
  ]) throws(() => normalizeUsageRequirement(requirement, inventory));
  deepStrictEqual(normalizeUsageRequirement({version: 2, counts: {B: 2, P: 1}}, inventory),
    {version: 2, counts: {P: 1, B: 2}});
});

test('CR010-USE-16 preserves terminal priority and gives zero stars for stable goal without required use', () => {
  const sample = {tick: 1200, position: {x: 5, y: 3}, stable: true};
  deepStrictEqual(evaluateTerminal({...sample, requiredUse: true}), {status: 'CLEARED', code: null});
  const incomplete = evaluateTerminal({...sample, requiredUse: false});
  deepStrictEqual(incomplete, {status: 'FAILED', code: 'FL-006'});
  equal(starsForResult(incomplete.status, 0, 2), 0);
  deepStrictEqual(evaluateTerminal({...sample, requiredUse: true, error: true}),
    {status: 'ERROR', code: 'PHYSICS_ERROR'});
});

test('CR010 candidate board coordinates match the fixed proposal and keep 01/02 legacy stages', async () => {
  const stages = getStages();
  const previous = getLegacyStages();
  const toM = ([x, y]) => ({x: .24 * x, y: .24 * (30 - y)});
  deepStrictEqual(stages.slice(0, 2), previous.slice(0, 2));
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index];
    const board = proposal.stages[index];
    deepStrictEqual(stage.ball, toM(board.ball));
    const goal = board.id === '10' ? [board.goal[0],board.goal[1]-1] : board.goal;
    deepStrictEqual(stage.goal, toM(goal));
    equal(stage.star3Target, board.star3);
    deepStrictEqual(Object.values(stage.inventory), board.inventory);
    const legacy = await getStageIdentity(previous[index]);
    const current = await getStageIdentity(stage);
    equal(current.physicsRulesVersion, legacy.physicsRulesVersion);
    const fixed = stage.fixed.filter(part => part.type !== 'W')
      .map(part => [part.type, part.gridX, part.gridY, part.angleDeg]);
    deepStrictEqual(fixed, board.fixed);
    if (index < 2) {
      const [geometryId, compatibilityId] = legacyIdentities[index];
      deepStrictEqual(current, {geometryId, compatibilityId, physicsRulesVersion: legacyPhysics});
      deepStrictEqual(current, legacy);
      continue;
    }
    deepStrictEqual(stage.required, {version: 2, counts: mandatory[index - 2]});
    notEqual(current.compatibilityId, legacy.compatibilityId);
    const permuted = Object.fromEntries(Object.entries(stage.required.counts).reverse());
    deepStrictEqual(await getStageIdentity({...stage, required: {version: 2, counts: permuted}}), current);
    const walls = stage.fixed.filter(part => part.type === 'W')
      .map(part => [part.gridX, part.gridY, Math.round(part.width / .24), Math.round(part.height / .24)]);
    deepStrictEqual(walls, board.walls);
  }
});
