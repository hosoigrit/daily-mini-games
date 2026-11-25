'use strict';

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const {reserveBudget, startReservation} = require('../qa/harness/budget.js');

const {budgets} = JSON.parse(readFileSync(
  join(__dirname, '../../../handoffs/game-0010/15_execution_policy.json'), 'utf8',
));

test('TC-D7-024-C001: stage, global and major root cause ceilings', () => {
  const proposal = {
    runId: 'fix-and-revalidate',
    remediation: {stages: ['E0'], majorRootCause: 'cp-integrity'},
    reserve: {automatedSeconds: 120},
  };
  const below = {
    remediationByStage: {E0: 4},
    remediationTotal: 29,
    remediationByRootCause: {'cp-integrity': 1},
  };
  const reservation = reserveBudget({usage: below, reservations: []}, proposal, budgets);
  const started = startReservation(reservation, proposal.runId);
  assert.equal(started.reservations[0].state, 'STARTED');
  assert.deepEqual(below, {
    remediationByStage: {E0: 4},
    remediationTotal: 29,
    remediationByRootCause: {'cp-integrity': 1},
  });
  for (const full of [
    {...below, remediationByStage: {E0: 5}},
    {...below, remediationTotal: 30},
    {...below, remediationByRootCause: {'cp-integrity': 2}},
  ]) {
    assert.throws(
      () => reserveBudget({usage: full, reservations: []}, proposal, budgets),
      {code: 'BUDGET_EXCEEDED'},
    );
  }
});

test('TC-D7-004-C002 CR007-C product integration of classified ramp observations', async t => {
  const {createRampContactTracker, createTutorialEvaluator} = await import('../src/domain/tutorial-evaluator.js');
  const ramps = [{id: 'A', type: 'R', angleDeg: 0}, {id: 'B', type: 'R', angleDeg: 0}];
  const face = (id, shape = {}) => ({
    id, localPoint: {x: 0, y: .08}, halfWidth: .84, halfHeight: .08, normalAlignment: 1, ...shape,
  });
  const valid = (id, motion) => ({id, motion, gap: 0, face: face(id)});
  const gap = (distance, shape = {localPoint: {x: .841, y: .08}}) =>
    ({id: 'A', motion: .08, gap: distance, face: face('A', shape)});
  const state = (id, intervals, displacement, gapTicks, achieved = false) =>
    ({ramp: {id, intervals, displacement, gap: gapTicks}, achieved, used: achieved ? [id] : []});
  const unset = {ramp: null, achieved: false, used: []};
  const cases = [
    {name: 'nominal .004 retained while the native side manifold persists',
      sequence: [valid('A', .10), gap(.004), valid('A', .10), valid('A', .04)],
      expected: [state('A', 1, .10, 0), state('A', 1, .10, 1), state('A', 2, .20, 0), state('A', 3, .24, 0, true)]},
    {name: 'exact .005 with an invalid native normal',
      sequence: [valid('A', .10), gap(.005, {normalAlignment: .865}), valid('A', .10), valid('A', .04)],
      expected: [state('A', 1, .10, 0), state('A', 1, .10, 1), state('A', 2, .20, 0), state('A', 3, .24, 0, true)]},
    {name: 'excess .005001 restarts even though the same ramp returns',
      sequence: [valid('A', .10), gap(.005001), valid('A', .10), valid('A', .04)],
      expected: [state('A', 1, .10, 0), unset, state('A', 1, .10, 0), state('A', 2, .14, 0)]},
    {name: 'two complete lost intervals reset',
      sequence: [valid('A', .10), gap(.004), gap(.004), valid('A', .14)],
      expected: [state('A', 1, .10, 0), state('A', 1, .10, 1), unset, state('A', 1, .14, 0)]},
    {name: 'a different full ramp starts an independent sequence',
      sequence: [valid('A', .10), valid('B', .10), valid('B', .04)],
      expected: [state('A', 1, .10, 0), state('B', 1, .10, 0), state('B', 2, .14, 0)]},
    {name: 'other ramp detected only inside a native substep breaks the gap',
      sequence: [valid('A', .10), {...gap(.004), other: face('B')}, valid('A', .14)],
      expected: [state('A', 1, .10, 0), unset, state('A', 1, .14, 0)]},
    {name: 'exact count alone without .24m fails',
      sequence: [valid('A', .10), valid('A', .10), valid('A', .039), valid('A', .001)],
      expected: [state('A', 1, .10, 0), state('A', 2, .20, 0), state('A', 3, .239, 0), state('A', 4, .24, 0, true)]},
  ];
  for (const {name, sequence, expected} of cases) {
    const evaluator = createTutorialEvaluator('integration', ramps, 'R');
    const tracker = createRampContactTracker('integration', ramps, evaluator);
    let x = 0;
    const input = [];
    const actual = sequence.map(({id, motion, gap: distance, face: contact, other}) => {
      const phases = ['before-step', 'after-step-before-limit', 'before-step', 'after-step-before-limit'];
      const frames = phases.map((phase, i) => ({
        phase, substep: Math.floor(i / 2), position: {x: x + motion * i / 3, y: 0},
        contacts: [{...contact, nativeTouching: true}],
        rampDistances: ramps.map(ramp => ({id: ramp.id, gap: ramp.id === id ? distance : .4})),
      }));
      const events = [{...contact, event: 'pre-solve', substep: 0, nativeTouching: true}];
      if (other) events.push({...other, event: 'pre-solve', substep: 1, nativeTouching: true});
      x += motion;
      input.push({frames, events});
      const measured = tracker.completeTick(frames, events);
      const {achieved, usedIds} = evaluator.snapshot();
      const ramp = measured ? {id: measured.id, intervals: measured.intervals,
        displacement: Number(measured.displacement.toFixed(12)), gap: measured.gap} : null;
      return {ramp, achieved, used: usedIds};
    });
    assert.deepEqual(actual, expected, name);
    t.diagnostic(JSON.stringify({mode: 'injected observation integration, no native-physics claim', name, input, expected, actual}));
  }
});
