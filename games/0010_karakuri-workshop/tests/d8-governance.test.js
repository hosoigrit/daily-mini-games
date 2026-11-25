'use strict';

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const {
  permitsStageSearchSimulations, reserveBudget, settleBudgetUsage, startReservation,
} = require('../qa/harness/budget.js');

const {budgets} = JSON.parse(readFileSync(
  join(__dirname, '../../../handoffs/game-0010/15_execution_policy.json'), 'utf8',
));
const empty = {usage: {}, reservations: []};
const proposal = {runId: 'st04-search', targetStage: '04', reserve: {
  searchSimulations: 1, searchTicks: 1200, searchSeconds: 1, automatedSeconds: 1,
}};

test('TC-D8-011-C001: simultaneous ST04 and global simulation ceilings', () => {
  // Frozen rc7AssertPlan: isolated counters independently exercise each ceiling.
  const frozenVectors = [
    {stageUsed: 1999, totalUsed: 19999, request: 1, allow: true},
    {stageUsed: 2000, totalUsed: 19999, request: 1, allow: false},
    {stageUsed: 1000, totalUsed: 20000, request: 1, allow: false},
  ];
  for (const {allow, ...input} of frozenVectors) {
    assert.equal(permitsStageSearchSimulations(input, budgets), allow, JSON.stringify(input));
  }
  // Live reservation derives the total from valid per-stage data.
  const below = {searchSimulationsByStage: {'04': 1999, '01': 2000, '02': 2000, '03': 2000,
    '05': 2000, '06': 2000, '07': 2000, '08': 2000, '09': 2000, '10': 2000}};
  const state = reserveBudget({usage: below, reservations: []}, proposal, budgets);
  assert.equal(state.reservations.length, 1);
  assert.throws(() => reserveBudget(state, {...proposal, runId: 'competing'}, budgets),
    {code: 'BUDGET_EXCEEDED'});
  for (const full of [
    {...below, searchSimulationsByStage: {'04': 2000}},
    {...below, searchSimulationsByStage: {...below.searchSimulationsByStage, '04': 2000}},
  ]) {
    assert.throws(() => reserveBudget({usage: full, reservations: []}, proposal, budgets),
      {code: 'BUDGET_EXCEEDED'});
  }
});

test('TC-D8-013-C001: correction cannot start without sufficient revalidation reserve', () => {
  const current = {usage: {automatedSeconds: 21599}, reservations: []};
  const correction = {runId: 'repair', remediation: {stages: ['E0']},
    reserve: {automatedSeconds: 2}};
  assert.throws(() => reserveBudget(current, correction, budgets), {code: 'BUDGET_EXCEEDED'});
  assert.deepEqual(current, {usage: {automatedSeconds: 21599}, reservations: []});
  assert.throws(() => startReservation(current, correction.runId), {code: 'UNKNOWN_RESERVATION'});
});

test('TC-D8-013-C002–C005 and C009: formal pools cannot borrow or be used for search', () => {
  for (const pool of ['E6', 'INTERIM']) {
    const current = {usage: {formalSimulationsByPool: {[pool]: 3000}}, reservations: []};
    assert.throws(() => reserveBudget(current, {runId: pool, pool,
      engineeringStage: pool === 'E6' ? 'E6' : 'E7',
      reserve: {formalSimulations: 1, automatedSeconds: 1}}, budgets), {code: 'BUDGET_EXCEEDED'});
  }
  assert.throws(() => reserveBudget(empty, {...proposal, pool: 'E8'}, budgets),
    {code: 'INVALID_RESERVATION'});
  const human = reserveBudget(empty, {runId: 'post-human', pool: 'POST_HUMAN', humanQaApproved: true,
    reserve: {formalSimulations: 3000, automatedSeconds: 120}}, budgets);
  assert.equal(human.reservations[0].state, 'RESERVED');
});

test('TC-D8-013-C006–C008: remediation consumes once across affected stages', () => {
  const usage = {remediationTotal: 28, remediationByStage: {E2: 4, E3: 4}};
  const multi = {runId: 'multi', remediation: {stages: ['E2', 'E3'], majorRootCause: 'x'},
    reserve: {automatedSeconds: 120}};
  const started = startReservation(reserveBudget({usage, reservations: []}, multi, budgets), 'multi');
  const settled = settleBudgetUsage(started, 'multi', {automatedSeconds: 1});
  assert.deepEqual(settled.usage, {
    remediationTotal: 29, remediationByStage: {E2: 5, E3: 5}, remediationByRootCause: {x: 1},
    automatedSeconds: 1,
  });
  const one = {runId: 'one', remediation: {stages: ['E0'], majorRootCause: 'x'},
    reserve: {automatedSeconds: 120}};
  const last = {usage: {remediationTotal: 29, remediationByStage: {E0: 4},
    remediationByRootCause: {x: 1}}, reservations: []};
  const lastStarted = startReservation(reserveBudget(last, one, budgets), 'one');
  assert.deepEqual(settleBudgetUsage(lastStarted, 'one', {automatedSeconds: 1}).usage, {
    remediationTotal: 30, remediationByStage: {E0: 5}, remediationByRootCause: {x: 2},
    automatedSeconds: 1,
  });
  assert.throws(() => reserveBudget({usage: {remediationTotal: 5, remediationByStage: {E0: 5}},
    reservations: []}, one, budgets), {code: 'BUDGET_EXCEEDED'});
});

test('TC-D8-013-C010–C011: run reuse cannot debit twice or run another candidate', () => {
  const state = reserveBudget(empty, proposal, budgets);
  assert.throws(() => reserveBudget(state, {...proposal, targetStage: '05'}, budgets),
    {code: 'DUPLICATE_RUN_ID'});
  const started = startReservation(state, proposal.runId);
  const settled = settleBudgetUsage(started, proposal.runId, proposal.reserve);
  assert.equal(settled.usage.searchSimulationsByStage['04'], 1);
  assert.throws(() => settleBudgetUsage(settled, proposal.runId, proposal.reserve),
    {code: 'INVALID_TRANSITION'});
});

test('TC-D8-014-C001: unknown consumption charges the reserved maximum', () => {
  const started = startReservation(reserveBudget(empty, proposal, budgets), proposal.runId);
  const settled = settleBudgetUsage(started, proposal.runId, null);
  assert.equal(settled.usage.searchTicksByStage['04'], 1200);
  assert.equal(settled.usage.automatedSeconds, 1);
  assert.equal(settled.reservations[0].state, 'SETTLED');
  assert.deepEqual(settled.reservations[0].charged, proposal.reserve);
  assert.equal(settled.reservations[0].consumptionKnown, false);
});

test('budget review: missing time, mixed purposes and unauthorized pools are refused', () => {
  const missingTime = {runId: 'repair-without-time', remediation: {stages: ['E0']}};
  const mixed = {...proposal, reserve: {...proposal.reserve, physicsValidationSimulations: 1}};
  const unauthorized = {runId: 'human', pool: 'POST_HUMAN',
    reserve: {formalSimulations: 1, automatedSeconds: 1}};
  for (const attempt of [missingTime, mixed, unauthorized]) {
    assert.throws(() => reserveBudget(empty, attempt, budgets), {code: 'INVALID_RESERVATION'});
  }
  const started = startReservation(reserveBudget(empty, proposal, budgets), proposal.runId);
  assert.throws(() => settleBudgetUsage(started, proposal.runId, {automatedSeconds: 0, searchSeconds: 1}),
    {code: 'INVALID_RESERVATION'});
  assert.equal(started.reservations[0].state, 'STARTED');
});

test('TC-D8-013-C010/C011: two tests can reference one identical settled execution', () => {
  const {referenceRun} = require('../qa/harness/budget.js');
  const fingerprint = 'a'.repeat(64);
  const reserved = reserveBudget(empty, {...proposal, fingerprint}, budgets);
  const done = settleBudgetUsage(startReservation(reserved, proposal.runId), proposal.runId, proposal.reserve);
  const proof = referenceRun(done, proposal.runId, fingerprint);
  assert.deepEqual(referenceRun(done, proposal.runId, fingerprint), proof);
  assert.equal(done.usage.searchSimulationsByStage['04'], 1);
  assert.throws(() => referenceRun(done, proposal.runId, 'b'.repeat(64)), {code: 'LS-16'});
});

test('TC-D8-014-C001: snapshotted interruption, max charge once and proven unstarted release', () => {
  const {replayBudgetHistory, restoreCheckpoint} = require('../qa/harness/checkpoint.js');
  const rows = events => events.map(event => JSON.stringify(event) + '\n').join('');
  const raw = rows([
    {sequence: 1, type: 'RESERVED', proposal: {...proposal, fingerprint: 'a'.repeat(64)}},
    {sequence: 2, type: 'STARTED', runId: proposal.runId},
    {sequence: 3, type: 'RESERVED', proposal: {...proposal, runId: 'unstarted', fingerprint: 'b'.repeat(64)}},
  ]);
  const snapshot = replayBudgetHistory(raw, budgets);
  assert.throws(() => restoreCheckpoint({...snapshot, generation: 1}, raw, budgets), {code: 'LS-13'});
  assert.throws(() => restoreCheckpoint(snapshot, raw.slice(0, -1), budgets), {code: 'LS-13'});
  const recovery = restoreCheckpoint(snapshot, raw, budgets).recoveryEvents;
  assert.deepEqual(recovery, [{sequence: 4, type: 'SETTLED', runId: proposal.runId, actual: null}]);
  const recovered = raw + rows(recovery);
  const badRelease = {sequence: 5, type: 'RELEASED', runId: 'unstarted', confirmedNotStarted: false};
  assert.throws(() => replayBudgetHistory(recovered + rows([badRelease]), budgets), {code: 'LS-13'});
  const complete = recovered + rows([{...badRelease, confirmedNotStarted: true}]);
  const latest = replayBudgetHistory(complete, budgets);
  assert.equal(latest.ledger.usage.searchTicksByStage['04'], 1200);
  assert.equal(latest.ledger.usage.automatedSeconds, 1);
  assert.deepEqual(restoreCheckpoint(latest, complete, budgets).recoveryEvents, []);
});

test('TC-D8-013-C010/C011: distinct cases retain references to the same candidate proof', () => {
  const {digest} = require('../qa/harness/policy.js');
  const {collectRunReferences} = require('../qa/harness/budget.js');
  const proof = {candidateSha: 'a'.repeat(40), target: 'ST04', input: 42, observation: 1, result: 'PASS'};
  const fingerprint = digest(JSON.stringify(proof));
  const reserved = reserveBudget(empty, {...proposal, fingerprint}, budgets);
  const done = settleBudgetUsage(startReservation(reserved, proposal.runId), proposal.runId, proposal.reserve);
  const refs = ['TC-D4-011-C001', 'TC-D4-012-C001'].map(caseId =>
    ({caseId, runId: proposal.runId, fingerprint}));
  const evidence = collectRunReferences(done, refs);
  assert.deepEqual(evidence.map(({caseId}) => caseId), refs.map(({caseId}) => caseId));
  assert.equal(done.usage.automatedSeconds, 1);
  const wrongFingerprint = digest(JSON.stringify({...proof, candidateSha: 'b'.repeat(40)}));
  assert.throws(() => collectRunReferences(done, [refs[0], {...refs[1], fingerprint: wrongFingerprint}]),
    {code: 'LS-16'});
  assert.throws(() => collectRunReferences(done, [refs[0], refs[0]]), {code: 'LS-16'});
});

test('TC-D8-014-C001: recovered charge is saved and read back without reapplying it', t => {
  const {mkdtempSync, rmSync, writeFileSync} = require('node:fs');
  const {tmpdir} = require('node:os');
  const {digest} = require('../qa/harness/policy.js');
  const {replayBudgetHistory, recoverPersistedBudget} = require('../qa/harness/checkpoint.js');
  const dir = mkdtempSync(join(tmpdir(), 'game0010-recovery-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const rawPath = join(dir, 'raw-events.jsonl');
  const snapshotPath = join(dir, 'checkpoint.json');
  const lockPath = join(dir, 'single-writer');
  const raw = [
    {sequence: 1, type: 'RESERVED', proposal: {...proposal, fingerprint: 'a'.repeat(64)}},
    {sequence: 2, type: 'STARTED', runId: proposal.runId},
  ].map(row => JSON.stringify(row) + '\n').join('');
  const binding = {approvalId: 'fixture', writerId: 'writer-a', headSha: 'a'.repeat(40)};
  const before = JSON.stringify({binding, previousSnapshotDigest: null, budget: replayBudgetHistory(raw, budgets)}) + '\n';
  writeFileSync(rawPath, raw);
  writeFileSync(snapshotPath, before);
  const argumentsForRecovery = {rawPath, snapshotPath, lockPath, binding, policy: budgets,
    expectedSnapshotDigest: digest(before)};
  for (const mismatch of [{...binding, writerId: 'writer-b'}, {...binding, headSha: 'b'.repeat(40)}]) {
    assert.throws(() => recoverPersistedBudget({...argumentsForRecovery, binding: mismatch}), {code: 'LS-13'});
  }
  const result = recoverPersistedBudget(argumentsForRecovery);
  assert.equal(result.budget.ledger.usage.searchTicksByStage['04'], 1200);
  assert.equal(result.previousSnapshotDigest, digest(before));
  const history = readFileSync(rawPath, 'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(history.map(({type}) => type),
    ['RESERVED', 'STARTED', 'CHECKPOINT', 'SETTLED', 'CHECKPOINT']);
  assert.equal(history[2].snapshot, before);
  assert.equal(history[2].digest, digest(before));
  assert.equal(history[4].snapshot, readFileSync(snapshotPath, 'utf8'));
  const tampered = history.map(event => ({...event}));
  tampered[2].snapshot += ' ';
  assert.throws(() => replayBudgetHistory(tampered.map(row => JSON.stringify(row) + '\n').join(''), budgets),
    {code: 'LS-13'});
  assert.throws(() => recoverPersistedBudget(argumentsForRecovery), {code: 'LS-13'});
  const savedBytes = readFileSync(snapshotPath);
  const latest = recoverPersistedBudget({...argumentsForRecovery, expectedSnapshotDigest: digest(savedBytes)});
  assert.deepEqual(latest, result);
  assert.equal(readFileSync(rawPath, 'utf8').trimEnd().split('\n').length, 5);
});
