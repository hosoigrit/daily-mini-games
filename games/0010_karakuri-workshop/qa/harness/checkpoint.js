'use strict';

const {createHash} = require('node:crypto');
const {closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync} = require('node:fs');
const {dirname} = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const {
  reserveBudget, startReservation, settleBudgetUsage, releaseUnstartedReservation,
  remediationLimits, checkEffectiveBudgetUsage,
} = require('./budget.js');

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hold(reason) {
  throw Object.assign(new Error(reason), {code: 'LS-13'});
}

function replayHistory(raw, policy) {
  if (typeof raw !== 'string' || !raw.trim() || !raw.endsWith('\n')) {
    hold('The budget event stream is missing, empty or truncated.');
  }
  let ledger = {usage: {}, reservations: []};
  let sequence = 0;
  let lastCheckpoint = null;
  let endsWithCheckpoint = false;
  const prefix = createHash('sha256');
  const snapshot = () => ({generation: sequence, historyDigest: prefix.copy().digest('hex'), ledger});
  try {
    for (const line of raw.slice(0, -1).split('\n')) {
      const event = JSON.parse(line);
      endsWithCheckpoint = event.type === 'CHECKPOINT';
      if (endsWithCheckpoint) {
        if (typeof event.snapshot !== 'string'
          || hash(event.snapshot) !== event.digest) {
          hold('A checkpoint history entry has an invalid digest.');
        }
        const saved = JSON.parse(event.snapshot);
        assertBinding(saved.binding);
        if (saved.previousSnapshotDigest !== (lastCheckpoint?.digest ?? null)
          || !isDeepStrictEqual(saved.budget, snapshot())) {
          hold('Checkpoint generations or their recorded budget snapshots differ.');
        }
        lastCheckpoint = event;
      } else {
        sequence += 1;
        if (event.sequence !== sequence) hold('Budget event sequence is discontinuous.');
        switch (event.type) {
          case 'RESERVED':
            if (!/^[a-f0-9]{64}$/u.test(event.proposal.fingerprint ?? '')) {
              hold('The run reservation lacks an execution fingerprint.');
            }
            ledger = reserveBudget(ledger, event.proposal, policy);
            break;
          case 'STARTED':
            ledger = startReservation(ledger, event.runId);
            break;
          case 'SETTLED':
            ledger = settleBudgetUsage(ledger, event.runId, event.actual);
            break;
          case 'RELEASED':
            ledger = releaseUnstartedReservation(ledger, event.runId, event.confirmedNotStarted);
            break;
          default:
            hold('Unknown budget event type.');
        }
      }
      prefix.update(line + '\n');
    }
    return {budget: snapshot(), lastCheckpoint, endsWithCheckpoint};
  } catch (error) {
    if (error.code === 'LS-13') throw error;
    hold(`Budget event reconciliation failed: ${error.message}`);
  }
}

function replayBudgetHistory(raw, policy) {
  return replayHistory(raw, policy).budget;
}

function pendingRecovery(budget) {
  const interrupted = budget.ledger.reservations.filter(run => run.state === 'STARTED');
  return interrupted.map(({runId}, index) => ({
    sequence: budget.generation + index + 1, type: 'SETTLED', runId, actual: null,
  }));
}

function restoreCheckpoint(snapshot, raw, policy) {
  const reconciled = replayBudgetHistory(raw, policy);
  if (!snapshot || !isDeepStrictEqual(snapshot, reconciled)) {
    hold('The budget checkpoint and raw event stream differ.');
  }
  return {snapshot: reconciled, recoveryEvents: pendingRecovery(reconciled)};
}

function assertBinding(binding) {
  if (!binding?.approvalId || !binding?.writerId || !/^[a-f0-9]{40}$/u.test(binding.headSha)) {
    hold('Recovery needs the current approval, writer and development HEAD.');
  }
}

function appendRaw(path, previous, addition) {
  const history = openSync(path, 'a');
  try {
    writeFileSync(history, addition);
    fsyncSync(history);
  } finally {
    closeSync(history);
  }
  const saved = readFileSync(path, 'utf8');
  if (saved !== previous + addition) hold('Recovery event readback mismatch.');
  return saved;
}

function checkpointRow(bytes) {
  return JSON.stringify({type: 'CHECKPOINT', digest: hash(bytes), snapshot: bytes}) + '\n';
}

function recoverPersistedBudget({snapshotPath, rawPath, lockPath, expectedSnapshotDigest, binding, policy}) {
  assertBinding(binding);
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    hold(`Cannot acquire the single-writer recovery lock: ${error.message}`);
  }
  const temporary = snapshotPath + '.new';
  let temporaryOwned = false;
  try {
    let raw = readFileSync(rawPath, 'utf8');
    const beforeBytes = readFileSync(snapshotPath, 'utf8');
    const digest = hash(beforeBytes);
    const before = JSON.parse(beforeBytes);
    if (digest !== expectedSnapshotDigest || !isDeepStrictEqual(before.binding, binding)) {
      hold('The current checkpoint digest, approval, writer or HEAD differs.');
    }
    const recorded = replayHistory(raw, policy);
    if (recorded.lastCheckpoint) {
      if (!recorded.endsWithCheckpoint || recorded.lastCheckpoint.snapshot !== beforeBytes) {
        hold('The current checkpoint differs from the latest checkpoint saved in raw history.');
      }
    } else {
      // An initial checkpoint has no predecessor and must match the original execution events.
      if (before.previousSnapshotDigest !== null || !isDeepStrictEqual(before.budget, recorded.budget)) {
        hold('The initial checkpoint and raw event stream differ.');
      }
    }
    checkEffectiveBudgetUsage(before.budget.ledger.usage, policy);
    const recoveryEvents = pendingRecovery(before.budget);
    if (!recoveryEvents.length) return before;
    if (!recorded.lastCheckpoint) {
      raw = appendRaw(rawPath, raw, checkpointRow(beforeBytes));
    }
    const recoveryRaw = recoveryEvents.map(event => JSON.stringify(event) + '\n').join('');
    const budget = replayBudgetHistory(raw + recoveryRaw, policy);
    checkEffectiveBudgetUsage(budget.ledger.usage, policy);
    const afterBytes = JSON.stringify({binding, previousSnapshotDigest: digest, budget}) + '\n';
    const savedHistory = appendRaw(rawPath, raw, recoveryRaw + checkpointRow(afterBytes));
    const published = replayHistory(savedHistory, policy);
    if (!published.endsWithCheckpoint || published.lastCheckpoint.snapshot !== afterBytes) {
      hold('New checkpoint history verification failed.');
    }

    const staged = openSync(temporary, 'wx', 0o600);
    temporaryOwned = true;
    try {
      writeFileSync(staged, afterBytes);
      fsyncSync(staged);
    } finally {
      closeSync(staged);
    }
    renameSync(temporary, snapshotPath);
    temporaryOwned = false;
    const directory = openSync(dirname(snapshotPath), 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    const readback = readFileSync(snapshotPath, 'utf8');
    if (readback !== published.lastCheckpoint.snapshot) hold('Recovered checkpoint readback mismatch.');
    return JSON.parse(readback);
  } catch (error) {
    if (error.code === 'LS-13') throw error;
    hold(`Persisted budget recovery did not complete: ${error.message}`);
  } finally {
    if (temporaryOwned) unlinkSync(temporary);
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

module.exports = {replayBudgetHistory, restoreCheckpoint, recoverPersistedBudget};

const checkpointSchemas = new WeakMap();

function freezeSchema(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeSchema);
    Object.freeze(value);
  }
  return value;
}

function deriveCheckpointSchema(frozenBytes, grant, historicalCauses, effectiveBudget) {
  const extensionId = 'EXEC-GAME-0010-CP-EXT-20261125-01';
  const originalDigest = '6d8eb083c64a4fea4ba109fccc6c9fd8eb16041465dbaea54331aeab3887fe05';
  const identities = {
    approvalId: extensionId,
    baseGrant: 'EXEC-GAME-0010-E0-E8-20261125-01',
    resumeGrant: 'EXEC-GAME-0010-AUTONOMOUS-RESUME-20261125-01',
    branch: 'codex/game-0010-development',
    writerId: 'GAME0010-CODEX-PRIMARY-01',
    baseCommitSha: 'afbb965fe57c4772f91cbe67e59571180e9073f8',
    handoffCommitSha: 'd5bae9f0afe6b6d860257e2dfec25e028e557a4f',
    policyDigest: 'b89f94b4bf800aefe5fd27c19a66b0a7715ccdb2f95d97af031b5984b6df3cfa',
    allowedPathsDigest: 'e9b7f557cb26c535dd1ddb3f1903db060cd90ac49d2aa0d0d908d2174a98dbd6',
    schemaSha256: originalDigest,
  };
  if (!grant || Object.entries(identities).some(([key, value]) => grant[key] !== value)
    || Object.keys(grant).length !== Object.keys(identities).length + 2
    || !isDeepStrictEqual(grant['EXT-01'], {stage: 'E0', maximum: 11})
    || !isDeepStrictEqual(grant['EXT-02'], {historicalMaximum: 5, allowFurtherRemediation: false})) {
    hold('Checkpoint extension does not match the authorized external grant.');
  }
  if (hash(frozenBytes) !== originalDigest) hold('The frozen checkpoint schema digest differs.');
  const candidates = Object.entries(historicalCauses).filter(([, count]) => count > 2);
  const rootCause = 'e0-budget-reservation-and-accounting';
  const effective = effectiveBudget === undefined ? null : remediationLimits(effectiveBudget);
  if (effective && (effective.stage.E0 !== 14 || effective.rootCause[rootCause] !== 6)) {
    hold('The checkpoint convergence budget is not authorized.');
  }
  const historicalCount = historicalCauses[rootCause];
  if (candidates.length !== 1 || candidates[0][0] !== rootCause
    || ![5, effective ? effective.rootCause[rootCause] : 5].includes(historicalCount)) {
    hold('The grandfathered root cause does not match its approved historical ledger.');
  }
  const schema = JSON.parse(frozenBytes);
  const budget = schema.properties.budgetUsage.properties;
  const changes = [];
  for (const [field, name, maximum] of [
    ['remediationByStage', 'E0', effective?.stage.E0 ?? 11],
    ['remediationByRootCause', rootCause, effective?.rootCause[rootCause] ?? 5],
  ]) {
    const override = {[name]: {...budget[field].additionalProperties, maximum}};
    budget[field].properties = override;
    changes.push({op: 'add', path: `/properties/budgetUsage/properties/${field}/properties`, value: override});
  }
  // Canonical JSON matches the separately verified derivation, independent of input key order.
  const canonical = (_, value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : Number(a > b)));
  };
  const bytes = Buffer.from(JSON.stringify(schema, canonical, 2) + '\n');
  checkpointSchemas.set(freezeSchema(schema), effectiveBudget ?? null);
  return {schema, bytes, changes, originalDigest, derivedDigest: hash(bytes), grandfatheredRootCause: rootCause};
}

// Implements the assertion keywords used by the verified frozen checkpoint schema.
function matchesCheckpointSchema(value, schema) {
  if (schema.anyOf && !schema.anyOf.some(option => matchesCheckpointSchema(value, option))) return false;
  if (Object.hasOwn(schema, 'const') && !isDeepStrictEqual(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some(option => isDeepStrictEqual(value, option))) return false;
  switch (schema.type) {
    case undefined: return true;
    case 'null': return value === null;
    case 'integer': return Number.isSafeInteger(value)
      && (schema.minimum === undefined || value >= schema.minimum)
      && (schema.maximum === undefined || value <= schema.maximum);
    case 'string': return typeof value === 'string'
      && (schema.minLength === undefined || [...value].length >= schema.minLength)
      && (schema.pattern === undefined || new RegExp(schema.pattern, 'u').test(value));
    case 'array': return Array.isArray(value)
      && (schema.items === undefined || value.every(item => matchesCheckpointSchema(item, schema.items)));
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
      if (schema.required?.some(key => !Object.hasOwn(value, key))) return false;
      for (const [key, item] of Object.entries(value)) {
        if (schema.propertyNames && !matchesCheckpointSchema(key, schema.propertyNames)) return false;
        const property = schema.properties && Object.hasOwn(schema.properties, key)
          ? schema.properties[key] : schema.additionalProperties;
        if (property === false || (property && !matchesCheckpointSchema(item, property))) return false;
      }
      return true;
    }
    default: hold(`Unknown frozen schema assertion type: ${schema.type}`);
  }
}

function verifyFormalCheckpoint({bytes, schema, history, binding, previousBytes, effectiveBudget}) {
  if (!checkpointSchemas.has(schema) || checkpointSchemas.get(schema) !== (effectiveBudget ?? null)) {
    hold('Formal validation requires the verified derived schema and its matching budget.');
  }
  const requiredBinding = ['approvalId', 'writerId', 'baseCommitSha', 'handoffCommitSha',
    'testedCommitSha', 'workspaceFingerprint'];
  if (!binding || requiredBinding.some(key =>
    typeof binding[key] !== 'string' || !binding[key])) {
    hold('Formal checkpoint verification requires an independently established writer and commit binding.');
  }
  if (!history || !Array.isArray(history.attempts) || !history.budgetUsage
    || new Set(history.attempts.map(row => row.attemptId)).size !== history.attempts.length) {
    hold('Verified formal checkpoint history is missing or has duplicate attempt IDs.');
  }
  let snapshot;
  let previous;
  try {
    snapshot = JSON.parse(bytes);
    previous = previousBytes === null ? null : JSON.parse(previousBytes);
  } catch {
    hold('The current or previous formal checkpoint is not JSON.');
  }
  if (!matchesCheckpointSchema(snapshot, schema)) hold('Formal checkpoint does not match the derived schema.');
  if (Object.entries(binding).some(([key, value]) => snapshot[key] !== value)) {
    hold('Formal checkpoint writer, approval or commit binding differs.');
  }
  if (!isDeepStrictEqual(snapshot.attempts, history.attempts)
    || !isDeepStrictEqual(snapshot.budgetUsage, history.budgetUsage)) {
    hold('Formal checkpoint totals and attempts differ from independently replayed history.');
  }
  if (effectiveBudget) checkEffectiveBudgetUsage(snapshot.budgetUsage, effectiveBudget, true);
  if (previous && !matchesCheckpointSchema(previous, schema)) hold('The previous formal checkpoint is invalid.');
  if (snapshot.generation !== (previous ? previous.generation + 1 : 0)
    || snapshot.previousCheckpointId !== (previous?.checkpointId ?? null)
    || snapshot.previousCheckpointDigest !== (previous ? hash(previousBytes) : null)) {
    hold('Formal checkpoint generation or previous saved bytes differ.');
  }
  return snapshot;
}

Object.assign(module.exports, {deriveCheckpointSchema, matchesCheckpointSchema, verifyFormalCheckpoint});

function verifyResumeAuthority({checkpoint, external, observed}) {
  if (!checkpoint || !external || !observed
    || (observed.sameTaskVerified !== true && observed.priorWriterStopped !== true)) {
    hold('The checkpoint, authorization or termination of the previous writer is unverified.');
  }
  if (observed.latestCheckpointDigest !== observed.loadedCheckpointDigest
    || observed.loadedCheckpointDigest !== checkpoint.digest
    || !/^[a-f0-9]{64}$/u.test(checkpoint.digest)) {
    hold('Only the latest verifiable checkpoint may be restored.');
  }
  if (observed.sameTaskVerified !== true && observed.readBackFromApprovedRemote !== true) {
    hold('Writer transfer requires the checkpoint read back from the approved remote.');
  }
  for (const field of ['approvalId', 'baseCommitSha', 'handoffCommitSha', 'writerId', 'branch']) {
    if (!external[field] || checkpoint[field] !== external[field] || observed[field] !== external[field]) {
      hold(`The checkpoint or current writer does not match external ${field}.`);
    }
  }
  const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
  const admittedRemote = value => validSha(value)
    || (value === null && observed.sameTaskVerified === true);
  if (!validSha(observed.head) || !validSha(checkpoint.head)
    || !admittedRemote(observed.remoteHead) || !admittedRemote(checkpoint.remoteHead)) {
    hold('Actual HEAD and remote presence must be explicitly verified.');
  }
  if (observed.head !== checkpoint.head || observed.remoteHead !== checkpoint.remoteHead) {
    throw Object.assign(new Error('Development HEAD or remote changed since checkpoint.'), {code: 'LS-14'});
  }
  if (observed.replayedHistoryVerified !== true || observed.protectedScopeVerified !== true) {
    hold('Checkpoint budget history and protected changes must be verified before resuming.');
  }
  return true;
}

module.exports.verifyResumeAuthority = verifyResumeAuthority;
