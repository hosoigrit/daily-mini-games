'use strict';

const {isDeepStrictEqual} = require('node:util');
const {stop} = require('./policy.js');
const {reserveBudget} = require('./budget.js');

const statuses = new Set(['PASS', 'FAIL', 'BLOCKED', 'HOLD', 'NOT_RUN', 'STALE']);
const earlyMutationIds = new Set([
  'TC-D7-023-C013', 'TC-D7-023-C014', 'TC-D7-023-C015', 'TC-D7-023-C016',
  'TC-D7-023-C018', 'TC-D7-023-C019', 'TC-D7-023-C020', 'TC-D7-023-C021',
  'TC-D7-023-C022', 'TC-D7-023-C023', 'TC-D7-023-C024',
]);

function indexManifest(manifest) {
  const cases = new Map();
  const parents = new Set();
  for (const parent of manifest.parents) {
    if (parents.has(parent.testId)) stop('LS-09', 'Duplicate manifest parent ID.');
    parents.add(parent.testId);
    for (const item of parent.cases) {
      if (cases.has(item.caseId) || item.parentTestId !== parent.testId) {
        stop('LS-09', `Invalid manifest linkage for ${item.caseId}.`);
      }
      cases.set(item.caseId, item);
    }
  }
  if (manifest.parentCount !== 296 || manifest.childCount !== 982
    || parents.size !== manifest.parentCount || cases.size !== manifest.childCount) {
    stop('LS-09', 'The approved parent or child test count differs.');
  }
  return cases;
}

function effectiveDependencies(item, stage) {
  if (stage !== 'E8' && stage === item.engineeringStage && earlyMutationIds.has(item.caseId)) {
    return item.dependencies.map(dependency => dependency === 'E8対象機能の成立'
      ? `${stage}の指定フィクスチャと当該工程の対象機能の成立` : dependency);
  }
  return [...item.dependencies];
}

function verifyManifest(fixed, candidate) {
  const original = indexManifest(fixed);
  const comparison = indexManifest(candidate);
  for (const [id, item] of original) {
    if (!isDeepStrictEqual(item, comparison.get(id))) {
      stop('LS-09', `A fixed case was removed or modified: ${id}.`);
    }
  }
  if (!isDeepStrictEqual(fixed, candidate)) stop('LS-09', 'The fixed manifest contract was modified.');
  return true;
}

function reconcileCaseResults(cases, evidence, identity) {
  const byId = new Map();
  for (const row of evidence) {
    const {caseId, parentTestId, status, testedSha, executionFingerprint, evidenceRef} = row;
    const item = cases.get(caseId);
    if (!item || item.parentTestId !== parentTestId || byId.has(caseId) || !statuses.has(status)) {
      stop('LS-16', `Invalid or duplicate case evidence: ${caseId}.`);
    }
    if (status === 'PASS' && (testedSha !== identity.testedSha
      || executionFingerprint !== identity.executionFingerprint || !evidenceRef)) {
      stop('LS-16', `Stale or untraceable successful evidence: ${caseId}.`);
    }
    byId.set(caseId, status);
  }
  return new Map([...cases].map(([id]) => [id, byId.get(id) ?? 'NOT_RUN']));
}

function verifyReportedResults(reconciled, reported) {
  if (reconciled.size !== reported.size) stop('LS-16', 'A case is missing from the report.');
  for (const [id, status] of reconciled) {
    if (reported.get(id) !== status) stop('LS-16', `Report does not match raw evidence for ${id}.`);
  }
  return true;
}

const purposeMetrics = Object.freeze({
  AUTOMATED: [],
  FOUNDATION: ['physicsValidationSimulations', 'physicsValidationTicks'],
  FORMAL: ['formalSimulations', 'formalTicks'],
  SEARCH: ['generated', 'searchSimulations', 'searchTicks', 'searchSeconds'],
});

function reserveDispatchedBatch(current, declarations, requested, policy) {
  // Declarations come from the reviewed execution plan through a separate input.
  // A mixed suite has multiple reservations before any child process may start.
  const plan = new Map(declarations.map(job => [job.runId, job]));
  if (plan.size === 0 || plan.size !== declarations.length || plan.size !== requested.length) {
    stop('LS-13', 'The execution plan and reservation batch do not match.');
  }
  const seen = new Set();
  let next = current;
  for (const proposal of requested) {
    const declared = plan.get(proposal.runId);
    if (!declared || seen.has(proposal.runId)
      || !/^[a-f0-9]{64}$/u.test(declared.fingerprint)
      || declared.fingerprint !== proposal.fingerprint
      || declared.engineeringStage !== proposal.engineeringStage
      || declared.targetStage !== proposal.targetStage
      || declared.pool !== proposal.pool
      || !Object.hasOwn(purposeMetrics, declared.purpose)) {
      stop('LS-13', 'A reservation lacks the exact reviewed command and purpose.');
    }
    seen.add(proposal.runId);
    const required = ['automatedSeconds', ...purposeMetrics[declared.purpose]];
    const lower = declared.lowerBounds ?? {};
    if (!proposal.reserve || Object.keys(proposal.reserve).length !== required.length
      || required.some(name => !Object.hasOwn(lower, name)
        || !Object.hasOwn(proposal.reserve, name)
        || !Number.isSafeInteger(lower[name]) || lower[name] < 0
        || !Number.isSafeInteger(proposal.reserve[name]) || proposal.reserve[name] < lower[name])
      || (declared.purpose !== 'AUTOMATED' && lower[required[1]] < 1)) {
      stop('LS-13', 'A required resource bound is missing, unverified or too small.');
    }
    try {
      next = reserveBudget(next, proposal, policy);
    } catch (error) {
      if (error.code === 'BUDGET_EXCEEDED' && error.exceededSections?.includes('remediationByRootCause')) {
        stop('LS-04', error.message);
      }
      throw error;
    }
  }
  return next;
}

module.exports = {indexManifest, effectiveDependencies, verifyManifest, reconcileCaseResults,
  verifyReportedResults, reserveDispatchedBatch};
