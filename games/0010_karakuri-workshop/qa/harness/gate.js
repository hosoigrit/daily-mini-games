'use strict';

const {stop} = require('./policy.js');

const requiredReviews = [
  'regression', 'protection', 'scope', 'budget', 'authorization',
  'evidence', 'independentReview', 'dependencies',
];

function evaluateEngineeringGate({stage, policy, cases, results, gates, verified, findings, mutationStatuses}) {
  const stageIndex = policy.execution.stages.indexOf(stage);
  if (stageIndex === -1) stop('LS-01', 'Engineering gate stage is not defined.');
  const previous = policy.execution.stages.slice(0, stageIndex);
  const prerequisites = previous.filter(item => gates[item] !== 'PASS');
  const requiredCaseIds = [...cases].filter(([, item]) =>
    item.required === true && item.engineeringStage === stage).map(([id]) => id);
  const pendingCases = requiredCaseIds.filter(id => results.get(id) !== 'PASS');
  const requiredMutations = Object.entries(policy.execution.earlyMutationStages)
    .filter(([, origin]) => origin === stage || stage === 'E8').map(([id]) => id);
  const missingMutations = requiredMutations.filter(id => mutationStatuses[id] !== 'PASS');
  const missingChecks = requiredReviews.filter(name => verified[name] !== true);
  const blockingFindings = findings.filter(item => item.state !== 'CLOSED'
    && (item.severity === 'CRITICAL' || item.severity === 'HIGH' || item.must === true));
  const canAdvance = requiredCaseIds.length > 0 && !pendingCases.length && !prerequisites.length
    && !missingMutations.length && !missingChecks.length && !blockingFindings.length;
  return {
    status: canAdvance ? 'PASS' : 'HOLD',
    canAdvance,
    pendingCases,
    prerequisites,
    missingMutations,
    missingChecks,
    blockingFindings,
  };
}

module.exports = {evaluateEngineeringGate};
