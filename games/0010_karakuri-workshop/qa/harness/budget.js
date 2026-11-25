'use strict';

const stageIds = new Set(Array.from({length: 10}, (_, index) => String(index + 1).padStart(2, '0')));
const engineeringStages = new Set(Array.from({length: 9}, (_, index) => `E${index}`));

const stageMetrics = {
  stageAdjustments: ['stageAdjustmentsByStage', 'stageDefinitionAdjustments'],
  generated: ['generatedByStage', 'generatedCandidates'],
  searchSimulations: ['searchSimulationsByStage', 'stageSearchSimulations'],
  searchTicks: ['searchTicksByStage', 'stageSearchTicks'],
  searchSeconds: ['searchSecondsByStage', 'stageSearchTimeSeconds'],
};
const globalMetrics = {
  automatedSeconds: 'automatedExecutionTimeSecondsTotal',
  physicsValidationSimulations: 'physicsValidationSimulationsTotal',
  physicsValidationTicks: 'physicsValidationTicksTotal',
};
const formalMetrics = {
  formalSimulations: ['formalSimulationsByPool', 'simulations', 'formalStageSimulationsTotal'],
  formalTicks: ['formalTicksByPool', 'ticks', 'formalStageTicksTotal'],
};

function fail(code, message) {
  throw Object.assign(new Error(message), {code});
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_RESERVATION', 'Budget counts must be nonnegative safe integers.');
  }
  return value;
}

function operation(section, amount, maximum, key, totalMaximum) {
  const debit = {section, amount: count(amount), maximum: count(maximum)};
  if (key !== undefined) debit.key = key;
  if (totalMaximum !== undefined) debit.totalMaximum = totalMaximum;
  return debit;
}

function resourceOperations(proposal, policy) {
  const {targetStage, pool, engineeringStage, humanQaApproved, reserve = {}} = proposal;
  const hasMetric = prefix => Object.keys(reserve).some(name => name.startsWith(prefix));
  const search = hasMetric('search') || Object.hasOwn(reserve, 'generated');
  const formal = hasMetric('formal');
  const physics = hasMetric('physicsValidation');
  if ([search, formal, physics].filter(Boolean).length > 1) {
    fail('INVALID_RESERVATION', 'A run can only charge one simulation purpose.');
  }
  if (formal) {
    const validFormalPool =
      (pool === 'E6' && engineeringStage === 'E6')
      || (pool === 'E8' && engineeringStage === 'E8')
      || (pool === 'INTERIM' && engineeringStages.has(engineeringStage) && engineeringStage !== 'E8')
      || (pool === 'POST_HUMAN' && humanQaApproved === true);
    if (!validFormalPool) {
      fail('INVALID_RESERVATION', 'Formal pool does not match the engineering stage or grant.');
    }
  }
  return Object.entries(reserve).map(([name, amount]) => {
    if (Object.hasOwn(globalMetrics, name)) {
      return operation(name, amount, policy[globalMetrics[name]]);
    }
    if (Object.hasOwn(stageMetrics, name) && stageIds.has(targetStage) && pool === undefined) {
      const [section, limit] = stageMetrics[name];
      return operation(section, amount, policy[`${limit}PerStage`], targetStage, policy[`${limit}Total`]);
    }
    if (Object.hasOwn(formalMetrics, name) && Object.hasOwn(policy.formalStagePools, pool)) {
      const [section, limit, globalLimit] = formalMetrics[name];
      return operation(section, amount, policy.formalStagePools[pool][limit], pool, policy[globalLimit]);
    }
    if (name === 'physicsCandidates' && policy.physicsCandidateStages.includes(engineeringStage)) {
      return operation('physicsCandidatesByStage', amount, policy.physicsCandidatesPerStage,
        engineeringStage, policy.physicsCandidatesTotal);
    }
    fail('INVALID_RESERVATION', `Invalid metric or pool for ${name}.`);
  });
}

function remediationOperations(remediation, policy) {
  if (remediation === undefined) return [];
  const {stages, majorRootCause} = remediation;
  if (!Array.isArray(stages) || !stages.length || new Set(stages).size !== stages.length
    || stages.some(stage => !engineeringStages.has(stage))) {
    fail('INVALID_RESERVATION', 'A correction requires distinct engineering stages.');
  }
  const operations = [operation('remediationTotal', 1, policy.remediationTotal)];
  for (const stage of stages) {
    operations.push(operation('remediationByStage', 1, policy.remediationPerStage, stage));
  }
  if (majorRootCause !== undefined) {
    if (typeof majorRootCause !== 'string' || !majorRootCause.trim()) {
      fail('INVALID_RESERVATION', 'A major correction requires a root cause identifier.');
    }
    operations.push(operation('remediationByRootCause', 1, policy.majorRootCauseAttempts, majorRootCause));
  }
  return operations;
}

function increment(usage, {section, amount, key}) {
  if (key === undefined) {
    usage[section] = count((usage[section] ?? 0) + amount);
    return;
  }
  const group = usage[section] ?? {};
  const previous = Object.hasOwn(group, key) ? group[key] : 0;
  usage[section] = {...group, [key]: count(previous + amount)};
}

function permitsStageSearchSimulations({stageUsed, totalUsed, request}, policy) {
  return count(stageUsed) + count(request) <= count(policy.stageSearchSimulationsPerStage)
    && count(totalUsed) + count(request) <= count(policy.stageSearchSimulationsTotal);
}

function permitsPhysicsCandidates({stageUsed, totalUsed, request}, policy) {
  return count(stageUsed) + count(request) <= count(policy.physicsCandidatesPerStage)
    && count(totalUsed) + count(request) <= count(policy.physicsCandidatesTotal);
}

function exceeds(usage, {section, maximum, key, totalMaximum}, policy) {
  if (key === undefined) return usage[section] > maximum;
  const group = usage[section];
  if (section === 'searchSimulationsByStage') {
    const totalUsed = Object.values(group).reduce((sum, value) => sum + count(value), 0);
    return !permitsStageSearchSimulations({stageUsed: group[key], totalUsed, request: 0}, policy);
  }
  if (section === 'physicsCandidatesByStage') {
    const totalUsed = Object.values(group).reduce((sum, value) => sum + count(value), 0);
    return !permitsPhysicsCandidates({stageUsed: group[key], totalUsed, request: 0}, policy);
  }
  if (group[key] > maximum) return true;
  return totalMaximum !== undefined
    && Object.values(group).reduce((sum, value) => sum + count(value), 0) > totalMaximum;
}

function reserveBudget(current, proposal, policy) {
  const {runId, fingerprint, reserve = {}} = proposal;
  if (typeof runId !== 'string' || !runId.trim()) {
    fail('INVALID_RESERVATION', 'A unique run identifier is required.');
  }
  if (fingerprint !== undefined && (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(fingerprint))) {
    fail('INVALID_RESERVATION', 'Run fingerprint must be a SHA-256 digest.');
  }
  if (current.reservations.some(record => record.runId === runId)) {
    fail('DUPLICATE_RUN_ID', `Run ${runId} is already recorded.`);
  }
  if (!Object.hasOwn(reserve, 'automatedSeconds') || count(reserve.automatedSeconds) === 0) {
    fail('INVALID_RESERVATION', 'Reserve a positive bound for automated execution, including revalidation.');
  }
  if ((reserve.searchSeconds ?? 0) > (reserve.automatedSeconds ?? 0)) {
    fail('INVALID_RESERVATION', 'Search time must be included in automated time.');
  }
  const resources = resourceOperations(proposal, policy);
  const remediation = remediationOperations(proposal.remediation, policy);
  if (!resources.length && !remediation.length) {
    fail('INVALID_RESERVATION', 'There are no bounds to reserve.');
  }
  const projectedUsage = structuredClone(current.usage);
  for (const entry of current.reservations) {
    if (entry.state === 'RESERVED') {
      for (const debit of entry.remediation) increment(projectedUsage, debit);
    }
    if (entry.state === 'RESERVED' || entry.state === 'STARTED') {
      for (const debit of entry.resources) increment(projectedUsage, debit);
    }
  }
  const debits = [...resources, ...remediation];
  for (const debit of debits) increment(projectedUsage, debit);
  const exceeded = debits.filter(debit => exceeds(projectedUsage, debit, policy));
  if (exceeded.length > 0) {
    fail('BUDGET_EXCEEDED', exceeded.map(({section, key}) => key ? `${section}:${key}` : section).join(', '));
  }
  return {...current, reservations: [...current.reservations, {
    runId, fingerprint: fingerprint ?? null, state: 'RESERVED', resources, remediation, metrics: Object.keys(reserve),
  }]};
}

function transition(current, runId, expected, destination, update) {
  const record = current.reservations.find(entry => entry.runId === runId);
  if (!record) fail('UNKNOWN_RESERVATION', `Run ${runId} has no saved reservation.`);
  if (record.state !== expected) {
    fail('INVALID_TRANSITION', `Cannot transition from ${record.state} to ${destination}.`);
  }
  const usage = structuredClone(current.usage);
  const settlement = update(usage, record);
  return {
    usage,
    reservations: current.reservations.map(entry =>
      entry === record ? {...record, ...settlement, state: destination} : entry),
  };
}

function startReservation(current, runId) {
  return transition(current, runId, 'RESERVED', 'STARTED', (usage, record) => {
    for (const debit of record.remediation) increment(usage, debit);
  });
}

function settleBudgetUsage(current, runId, actual) {
  return transition(current, runId, 'STARTED', 'SETTLED', (usage, record) => {
    if (actual !== null && Object.keys(actual).some(key => !record.metrics.includes(key))) {
      fail('INVALID_RESERVATION', 'Actual consumption includes an unreserved metric.');
    }
    const charged = {};
    for (const [index, debit] of record.resources.entries()) {
      const name = record.metrics[index];
      const amount = actual !== null && Object.hasOwn(actual, name) ? count(actual[name]) : debit.amount;
      if (amount > debit.amount) fail('BUDGET_EXCEEDED', `Actual consumption exceeded reserved ${name}.`);
      charged[name] = amount;
      increment(usage, {...debit, amount});
    }
    if ((charged.searchSeconds ?? 0) > (charged.automatedSeconds ?? 0)) {
      fail('INVALID_RESERVATION', 'Settled search time exceeds settled automated time.');
    }
    return {charged, consumptionKnown: actual !== null && record.metrics.every(name =>
      Object.hasOwn(actual, name))};
  });
}

function referenceRun(current, runId, fingerprint) {
  const record = current.reservations.find(entry => entry.runId === runId);
  if (!record || record.state !== 'SETTLED' || record.fingerprint === null
    || record.fingerprint !== fingerprint) {
    fail('LS-16', 'Evidence must identify a settled run with the same execution fingerprint.');
  }
  return structuredClone(record.charged);
}

function releaseUnstartedReservation(current, runId, confirmedNotStarted) {
  if (confirmedNotStarted !== true) {
    fail('MISSING_START_EVIDENCE', 'Unstarted status must be confirmed before release.');
  }
  return transition(current, runId, 'RESERVED', 'RELEASED', () => {});
}

module.exports = {
  permitsStageSearchSimulations,
  permitsPhysicsCandidates,
  reserveBudget,
  referenceRun,
  startReservation,
  settleBudgetUsage,
  releaseUnstartedReservation,
};

function collectRunReferences(current, references) {
  const cases = new Set();
  return references.map(({caseId, runId, fingerprint}) => {
    if (typeof caseId !== 'string' || !caseId || cases.has(caseId)) {
      fail('LS-16', 'Each execution evidence reference needs a distinct case ID.');
    }
    cases.add(caseId);
    const charged = referenceRun(current, runId, fingerprint);
    return {caseId, runId, fingerprint, charged};
  });
}

module.exports.collectRunReferences = collectRunReferences;
