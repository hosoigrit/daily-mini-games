import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateBattle } from '../src/battle-core.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { stages } = json('../data/game0009_stage_manifest_v0.9.json');
const stageById = new Map(stages.map(stage => [stage.stageId, stage]));
const { cases } = json('./fixtures/game0009_full_960_expected_v0.9.json');
const { namedVectors } = json('./fixtures/game0009_golden_tests_v0.9.json');

function compareCases(cases) {
  const failures = [];
  for (const { id, stageId, plan, expected } of cases) {
    const { log, ...result } = simulateBattle(stageById.get(stageId), plan);
    try {
      assert.deepEqual(result, expected);
    } catch (error) {
      failures.push(`${id ?? stageId}: ${plan.join(', ')}\n${error.message}`);
    }
  }
  assert.equal(failures.length, 0, failures.join('\n\n'));
}

test('all 960 frozen ordered plans match every result field', () => {
  assert.equal(cases.length, 960);
  compareCases(cases);
});

test('all 64 frozen golden vectors match every result field', () => {
  assert.equal(namedVectors.length, 64);
  compareCases(namedVectors);
});

test('rejects invalid plans and stage data before resolving any turn', () => {
  const stage = stageById.get('main-01');
  const plan = ['slash', 'magic', 'guard'];
  for (const invalidPlan of [
    ['slash', 'magic', 'unknown'],
    ['slash', 'slash', 'guard'],
    ['slash', 'magic'],
    ['slash', 'magic', 'guard', 'heal'],
    ['slash', 'magic', 'counter'],
    ['slash', , 'guard'],
  ]) {
    assert.throws(() => simulateBattle(stage, invalidPlan), TypeError);
  }
  for (const invalidStage of [
    undefined,
    { ...stage, stageId: '' },
    { ...stage, hand: ['slash', 'magic', 'guard', 'focus', 'focus'] },
    { ...stage, enemyActions: stage.enemyActions.slice(0, 2) },
    { ...stage, enemyActions: [{ type: 'unknown' }, ...stage.enemyActions.slice(1)] },
    { ...stage, enemyActions: [{ type: 'attack', power: -1 }, ...stage.enemyActions.slice(1)] },
    { ...stage, passives: ['unknown'] },
    { ...stage, rating: { ...stage.rating, star3: { minHp: 7, objective: { type: 'unknown' } } } },
  ]) {
    assert.throws(() => simulateBattle(invalidStage, plan), TypeError);
  }
  for (const hp of [0, -1, 1.5, Infinity, NaN, '9', null]) {
    assert.throws(() => simulateBattle({ ...stage, heroMaxHp: hp }, plan), RangeError);
    assert.throws(() => simulateBattle({ ...stage, enemyMaxHp: hp }, plan), RangeError);
    assert.throws(() => simulateBattle(stage, plan, { heroStartHp: hp }), RangeError);
  }
  assert.throws(() => simulateBattle(stage, plan, { heroStartHp: stage.heroMaxHp + 1 }), RangeError);
});

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('all 960 battles are deterministic and leave frozen inputs intact', () => {
  for (const { stageId, plan } of cases) {
    const stage = deepFreeze(structuredClone(stageById.get(stageId)));
    const inputPlan = Object.freeze([...plan]);
    const first = simulateBattle(stage, inputPlan);
    assert.deepEqual(simulateBattle(stage, inputPlan), first, stageId);
    assert.deepEqual(stage, stageById.get(stageId));
    assert.deepEqual(inputPlan, plan);
    assert.deepEqual(first.log.map(turn => turn.card), first.executed);
    assert.equal(first.log.length, first.turns);
    assert.equal(first.log.at(-1).after.heroHp, first.heroHp);
    assert.equal(first.log.at(-1).after.enemyHp, first.enemyHp);
  }
});

test('star objectives use the executed sequence on early victory', () => {
  const stage = stageById.get('main-01');
  const plan = ['slash', 'magic', 'guard'];
  const withObjective = type => ({
    ...stage,
    rating: { star2MinHp: 6, star3: { minHp: 7, objective: { type, cardId: 'guard' } } },
  });
  const required = simulateBattle(withObjective('cardExecuted'), plan);
  assert.deepEqual(required.executed, ['slash', 'magic']);
  assert.equal(required.turns, 2);
  assert.equal(required.stars, 2);
  assert.equal(simulateBattle(withObjective('cardNotExecuted'), plan).stars, 3);
});
