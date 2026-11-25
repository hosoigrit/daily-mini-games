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
