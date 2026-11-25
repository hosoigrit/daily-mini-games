'use strict';

const {createHash} = require('node:crypto');

const supportedOperations = new Set([
  'read', 'setupEnvironment', 'fetchDependencies', 'create', 'modify', 'test',
  'review', 'remediate', 'saveEvidence', 'createDevelopmentBranch',
  'commit', 'pushDevelopmentBranch',
]);
const sha1 = /^[a-f0-9]{40}$/u;
const sha256 = /^[a-f0-9]{64}$/u;

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stop(code, message) {
  throw Object.assign(new Error(message), {code});
}

function loadExecutionPolicy(bytes, expectedDigest) {
  if (!sha256.test(expectedDigest) || digest(bytes) !== expectedDigest) {
    stop('LS-07', 'Execution policy digest differs from the external grant.');
  }
  const policy = JSON.parse(bytes.toString('utf8'));
  if (policy.policyVersion !== 1) stop('LS-01', 'Unrecognized execution policy version.');
  if (policy.execution.maxConcurrentWriters !== 1 || !policy.execution.reviewTasksReadOnly) {
    stop('LS-01', 'The fixed single-writer or independent review contract changed.');
  }
  return policy;
}

function validateAuthorization(policy, grant, actual, operation) {
  if (!grant || policy.externalGrantRequiredFields.some(name => !Object.hasOwn(grant, name))) {
    stop('LS-08', 'An external grant with every required field is necessary.');
  }
  if (!grant.approvalId || !grant.authorizedWriterId || !actual.writerId
    || !Array.isArray(grant.allowedOperations)) {
    stop('LS-08', 'The approval, writer or operations are missing.');
  }
  if (grant.allowedOperations.some(item => !supportedOperations.has(item))) {
    stop('LS-08', 'The grant contains an unsupported operation.');
  }
  if (!sha1.test(grant.baseCommitSha) || !sha1.test(grant.handoffCommitSha)
    || grant.baseCommitSha !== actual.baseCommitSha || grant.handoffCommitSha !== actual.handoffCommitSha
    || grant.policyDigest !== actual.policyDigest || grant.allowedPathsDigest !== actual.allowedPathsDigest) {
    stop('LS-07', 'A fixed commit or grant digest differs.');
  }
  if (actual.repository !== policy.repository.name
    || grant.targetBranch !== policy.repository.developmentBranch || actual.branch !== grant.targetBranch) {
    stop('LS-14', 'Repository or development branch differs from the frozen contract.');
  }
  if (actual.writerId !== grant.authorizedWriterId || !policy.execution.stages.includes(actual.stage)) {
    stop('LS-08', 'Writer or engineering stage is outside the grant.');
  }
  if (!supportedOperations.has(operation) || !grant.allowedOperations.includes(operation)) {
    stop('LS-08', `Operation ${operation} is not authorized.`);
  }
  if (operation !== 'read' && operation !== 'review' && !actual.isWriter) {
    stop('LS-08', 'A read-only reviewer cannot run writer operations.');
  }
  if (policy.gate.designFreezeRequired && policy.gate.designFreezeStatus !== 'FROZEN') {
    stop('LS-08', 'The design is not frozen.');
  }
  return true;
}

module.exports = {digest, stop, loadExecutionPolicy, validateAuthorization};
