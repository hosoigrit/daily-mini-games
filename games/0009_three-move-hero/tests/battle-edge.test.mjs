import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateBattle } from '../src/battle-core.js';

const { cases } = JSON.parse(readFileSync(
  new URL('./fixtures/game0009_edge_expected_v0.9.json', import.meta.url), 'utf8',
));
const cardIds = ['slash', 'magic', 'guard', 'focus', 'heal', 'counter'];

// These two frozen vectors specify intermediate HP only. The remaining
// zero-power enemy attacks leave HP unchanged; the enemy survives turn three.
const finalResults = {
  'EDGE-13_heal_partial_cap': {
    outcome: 'loss', reason: 'lose_timeout', heroHp: 5, enemyHp: 3,
    executed: ['heal', 'slash', 'magic'],
  },
  'EDGE-14_thorn_after_reduced_slash': {
    outcome: 'loss', reason: 'lose_timeout', heroHp: 1, enemyHp: 6,
    executed: ['slash', 'guard', 'magic'],
  },
};

const eventTypesAtAssertion = {
  'EDGE-06_thorn_killing_slash': ['heroAttack'],
  'EDGE-07_thorn_kills_hero': ['heroAttack', 'thornArmor'],
  'EDGE-08_dead_counter_no_reflect': ['enemyAttack'],
  'EDGE-09_zero_damage_counter': ['enemyAttack', 'counter'],
  'EDGE-10_counter_vs_stance': [],
  'EDGE-11_counter_not_thorn': ['enemyAttack', 'counter'],
  'EDGE-14_thorn_after_reduced_slash': ['heroAttack', 'thornArmor'],
};

assert.equal(cases.length, 14);
for (const vector of cases) {
  test(vector.testId, () => {
    const { scenario, assertAfterCard, expectedAtAssertion } = vector;
    const { heroMaxHp, heroStartHp, enemyStartHp, enemyActions, passives, plan } = scenario;
    const hand = [...new Set([...plan, ...cardIds])].slice(0, 5);
    const stage = {
      stageId: vector.testId,
      heroMaxHp,
      enemyMaxHp: enemyStartHp,
      enemyActions,
      passives,
      hand,
      rating: { star2MinHp: 1, star3: { minHp: 1, objective: { type: 'finishWithinTurns', maxTurns: 3 } } },
    };

    const { log, stars, turns, ...final } = simulateBattle(stage, plan, { heroStartHp });
    const assertionTurn = log.find(turn => turn.card === assertAfterCard);
    assert.ok(assertionTurn, 'assertion card must have executed');
    const expectedEvents = eventTypesAtAssertion[vector.testId];
    if (expectedEvents) {
      assert.deepEqual(assertionTurn.events.map(event => event.type), expectedEvents);
    }
    if (vector.testId === 'EDGE-03_focus_through_magic') {
      assert.deepEqual(log.map(turn => turn.after.focused), [true, true, false]);
    }
    const { heroHp, enemyHp } = assertionTurn.after;
    assert.deepEqual({ heroHp, enemyHp, state: assertionTurn.state }, expectedAtAssertion);
    const expectedFinal = vector.fullExpected ?? finalResults[vector.testId];
    assert.deepEqual(final, expectedFinal);
    assert.equal(turns, expectedFinal.executed.length);
    assert.equal(stars, expectedFinal.outcome === 'win' ? 3 : 0);
  });
}
