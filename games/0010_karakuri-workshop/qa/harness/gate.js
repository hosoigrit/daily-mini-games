'use strict';

const {stop} = require('./policy.js');
const {checkEffectiveBudgetUsage} = require('./budget.js');
const {checkRegressionEvidence, replayE0ReceiptHistory} = require('./evidence.js');

const requiredReviews = [
  'regression', 'protection', 'scope', 'budget', 'authorization',
  'evidence', 'independentReview', 'dependencies', 'hitlClear',
];

function evaluateFixtureEngineeringGate({stage, policy, cases, results, gates, verified, findings, mutationStatuses}) {
  const stageIndex = policy.execution.stages.indexOf(stage);
  if (stageIndex === -1) stop('LS-01', 'Engineering gate stage is not defined.');
  const previous = policy.execution.stages.slice(0, stageIndex);
  const prerequisites = previous.filter(item => gates[item] !== 'PASS');
  const automaticMethods = new Set(['U', 'I', 'P', 'B']);
  const requiredCaseIds = [...cases].filter(([, item]) => {
    if (item.required !== true) return false;
    if (item.engineeringStage === stage) return true;
    return stage === 'E8' && previous.includes(item.engineeringStage) && automaticMethods.has(item.method);
  }).map(([id]) => id);
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

function evaluateEngineeringGate(input) {
  const {budgetProof, regressionProof} = input;
  const verified = {...input.verified, budget: false, regression: false};
  if (budgetProof) {
    if (!Buffer.isBuffer(budgetProof.rawLedger) || !budgetProof.anchor) {
      stop('LS-13', 'The formal gate needs independently anchored raw budget receipts.');
    }
    const usage = replayE0ReceiptHistory(budgetProof.rawLedger, budgetProof.anchor, budgetProof.policy);
    verified.budget = checkEffectiveBudgetUsage(usage, budgetProof.policy, true);
  }
  if (regressionProof) {
    verified.regression = checkRegressionEvidence(regressionProof.summary, regressionProof.provenance);
  }
  return evaluateFixtureEngineeringGate({...input, verified});
}

module.exports = {evaluateEngineeringGate, evaluateFixtureEngineeringGate};
