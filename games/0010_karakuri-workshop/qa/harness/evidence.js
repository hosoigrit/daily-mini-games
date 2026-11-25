'use strict';

const {stop, digest} = require('./policy.js');
const {checkEffectiveBudgetUsage, remediationLimits} = require('./budget.js');

const {isDeepStrictEqual} = require('node:util');
const baselineCounts = Object.freeze({
  '0001_target-tap': 30,
  '0002_light-panels': 36,
  '0003_30sec-survival': 45,
  '0004_wobbly-tower': 76,
  '0005_hitofude-delivery': 52,
  '0006_traffic-panic': 138,
  '0007_weather-bakery': 1342,
  '0008_three-minute-detective': 131,
  '0009_three-move-hero': 169,
});
const timingLimit = 21_600;

function reconciliationError(message) {
  stop('LS-13', message);
}

function replayE0ReceiptHistory(rawBytes, anchor, effectiveBudget) {
  if (!anchor || !/^[a-f0-9]{64}$/u.test(anchor.sha256)
    || digest(rawBytes) !== anchor.sha256 || !rawBytes.length || rawBytes.at(-1) !== 10) {
    reconciliationError('E0 receipt history lacks the expected evidence digest.');
  }
  const rows = rawBytes.toString('utf8').slice(0, -1).split('\n');
  const reservations = new Map();
  const settlements = new Map();
  let priorIncident;
  for (const line of rows) {
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      reconciliationError('E0 history has a malformed receipt.');
    }
    const {record, type, sha256, source} = raw;
    if (typeof source !== 'string' || !/^[a-z0-9.-]+$/u.test(source)
      || !/^[a-f0-9]{64}$/u.test(sha256) || !record || typeof record !== 'object') {
      reconciliationError('E0 history has an invalid receipt envelope.');
    }
    const id = record.runId ?? record.newRunId;
    if (typeof id !== 'string' || !id.startsWith('E0-')) reconciliationError('Invalid E0 attempt ID.');
    switch (type) {
      case 'RESERVATION_RECEIPT':
        if (reservations.has(id)) reconciliationError(`Duplicate reservation: ${id}.`);
        reservations.set(id, raw);
        break;
      case 'CONSUMPTION_RECEIPT':
        if (settlements.has(id) || !reservations.has(id)) {
          reconciliationError(`Unreserved or duplicate consumption: ${id}.`);
        }
        settlements.set(id, raw);
        break;
      case 'APPROVED_HISTORICAL_INCIDENT':
        if (priorIncident || id !== anchor.incidentRunId
          || record.chargedSeconds !== anchor.incidentChargedSeconds || sha256 !== anchor.incidentSourceDigest) {
          reconciliationError('The unreserved historic incident does not match the approved exception.');
        }
        priorIncident = raw;
        break;
      default:
        reconciliationError(`The bootstrap ledger has an unsupported event: ${type}.`);
    }
  }
  if (!priorIncident || reservations.has(anchor.incidentRunId) || settlements.has(anchor.incidentRunId)) {
    reconciliationError('The historic budget incident must be preserved exactly once.');
  }
  const attempts = [];
  const unsettled = [];
  let automatedSeconds = priorIncident.record.chargedSeconds;
  for (const [id, receipt] of reservations) {
    const reservedSeconds = receipt.record.automatedSeconds ?? receipt.record.reservedAutomatedSeconds;
    if (!Number.isSafeInteger(reservedSeconds) || reservedSeconds < 1) {
      reconciliationError(`Invalid reserved seconds for ${id}.`);
    }
    const settled = settlements.get(id);
    if (!settled) {
      unsettled.push(id);
      continue;
    }
    const actualSeconds = settled.record.actualSeconds ?? settled.record.chargedSeconds;
    if (!Number.isSafeInteger(actualSeconds) || actualSeconds < 0 || actualSeconds > reservedSeconds) {
      reconciliationError(`Invalid actual seconds for ${id}.`);
    }
    attempts.push({attemptId:id, category:'automated', scope:'E0', state:'COMPLETED',
      reserved:{automatedSeconds:reservedSeconds}, actual:{automatedSeconds:actualSeconds},
      evidenceRefs:[receipt.sha256, settled.sha256]});
    automatedSeconds += actualSeconds;
  }
  if (unsettled.length) {
    reconciliationError(`Unmatched receipts require approved recovery: ${unsettled.join(', ')}.`);
  }
  attempts.push({
    attemptId:anchor.incidentRunId, category:'approved-historical-incident', scope:'E0',
    state:'INTERRUPTED', reserved:{}, actual:{automatedSeconds:priorIncident.record.chargedSeconds},
    evidenceRefs:[priorIncident.sha256],
  });
  const remedies = new Set(anchor.remediationRunIds);
  if (remedies.size !== anchor.remediationRunIds.length || [...remedies].some(id => !settlements.has(id))) {
    reconciliationError('The authorized list of historical corrections is missing or duplicated.');
  }
  const observedRemedies = new Set([...reservations]
    .filter(([, receipt]) => Number.isSafeInteger(receipt.record.remediationAttempt)).map(([id]) => id));
  if (remedies.size !== observedRemedies.size || [...observedRemedies].some(id => !remedies.has(id))) {
    reconciliationError('The correction history disagrees with the independently approved attempt list.');
  }
  const causeTotals = new Map();
  for (const id of remedies) {
    const row=reservations.get(id).record;
    const cause=row.majorRootCause ?? row.rootCause;
    if (typeof cause !== 'string' || !cause) reconciliationError(`Missing root cause for ${id}.`);
    causeTotals.set(cause,(causeTotals.get(cause) ?? 0)+1);
  }
  if (automatedSeconds > timingLimit) reconciliationError('The aggregate automation budget is exhausted.');
  const usage = {remediationTotal:remedies.size, remediationByStage:{E0:remedies.size},
    remediationByRootCause:Object.fromEntries(causeTotals), automatedSeconds};
  if (effectiveBudget) {
    checkEffectiveBudgetUsage(usage, effectiveBudget, true);
    const limits = remediationLimits(effectiveBudget);
    for (const [cause, maximum] of Object.entries(limits.rootCause)) {
      if (causeTotals.get(cause) === maximum) {
        const runs = [...remedies].filter(id => {
          const value = reservations.get(id).record;
          return (value.majorRootCause ?? value.rootCause) === cause;
        });
        if (runs.at(-1) !== limits.approvedHistoricalCorrection) {
          reconciliationError('The last historical-cause correction is not the approved run.');
        }
      }
    }
  }
  return {attempts, ...usage};
}

function readTapCounts(log) {
  const lines = log.toString('utf8').split(/\r?\n/u);
  if (lines[0] !== 'TAP version 13') stop('LS-16', 'Regression log is not the fixed Node TAP output.');
  const totals = new Map();
  for (const line of lines) {
    const match = /^# (tests|pass|fail|skipped|cancelled|todo) ([0-9]+)$/u.exec(line);
    if (!match) continue;
    if (totals.has(match[1])) stop('LS-16', 'A regression log repeats a summary field.');
    totals.set(match[1], Number(match[2]));
  }
  if (totals.size !== 6 || ![...totals.values()].every(Number.isSafeInteger)) {
    stop('LS-16', 'The regression runner summary is incomplete.');
  }
  return Object.fromEntries(totals);
}

function checkRegressionEvidence(summary, {expectedBase, run, fixedInventory, receipts, rawLogs} = {}) {
  if (!summary || !run?.id || summary.runId !== run.id || run.testedSha !== expectedBase
    || summary.testedSha !== expectedBase || run.node !== '26.13.0' || summary.node !== run.node
    || summary.failures !== 0 || summary.skipped !== 0) {
    stop('LS-16', 'The protected regression run identity, baseline or result differs.');
  }
  const expectedGames = Object.keys(baselineCounts);
  for (const set of [fixedInventory, receipts, rawLogs, summary.passedPerGame]) {
    if (!set || Object.keys(set).length !== expectedGames.length
      || expectedGames.some(game => !Object.hasOwn(set, game))) {
      stop('LS-16', 'Regression evidence does not cover the fixed nine-game inventory.');
    }
  }
  let passed = 0;
  for (const game of expectedGames) {
    const inventory = fixedInventory[game];
    const receipt = receipts[game];
    const log = rawLogs[game];
    if (!receipt || !Array.isArray(inventory) || !inventory.length
      || !isDeepStrictEqual(receipt.testFiles, inventory)
      || !isDeepStrictEqual(receipt.args, ['--test', '--test-reporter=tap', ...inventory])
      || receipt.runId !== run.id || receipt.testedSha !== expectedBase
      || receipt.exitCode !== 0 || !Buffer.isBuffer(log)
      || digest(log) !== receipt.rawLogSha256) {
      stop('LS-16', `Regression source, execution or raw log differs for ${game}.`);
    }
    const totals = readTapCounts(log);
    if (totals.tests !== baselineCounts[game] || totals.pass !== totals.tests
      || totals.fail !== 0 || totals.skipped !== 0 || totals.cancelled !== 0 || totals.todo !== 0
      || totals.pass !== summary.passedPerGame[game]) {
      stop('LS-16', `Regression counts differ from the measured fixed baseline for ${game}.`);
    }
    passed += totals.pass;
  }
  if (passed !== summary.casesPassed) stop('LS-16', 'Regression total differs from the source logs.');
  return true;
}

module.exports = {replayE0ReceiptHistory, checkRegressionEvidence};
