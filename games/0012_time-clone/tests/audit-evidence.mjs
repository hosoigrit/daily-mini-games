import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { csv, e1, repo, sha256 } from './verify-h01.mjs';
import { correctionIds } from './evidence-plan.mjs';

const [reportPath, baselinePath, outputPath] = process.argv.slice(2);
assert(reportPath && baselinePath, 'usage: node tests/audit-evidence.mjs REPORT BASELINE [AUDIT]');
const bytes = readFileSync(reportPath);
const report = JSON.parse(bytes);
const baseline = JSON.parse(readFileSync(baselinePath));
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(repo), encoding: 'utf8' }).trim();
const testedSHA = git('rev-parse', 'HEAD');
assert.equal(report.testedSHA, testedSHA);
assert.equal(report.worktreeStatus, '');
assert.equal(git('status', '--short'), '');
assert.equal(baseline.testedSHA, 'b88f3fe6d15dd48d18a5174385cb136a23327de2');

const exact = baseline.results.map(row => [row.testId, row.status]);
assert.equal(exact.length, 190);
assert.equal(exact.filter(([, status]) => status === 'PASS').length, 179);
const original = report.results.filter(row => row.group === 'T1');
assert.deepEqual(original.map(row => [row.testId, row.status]), exact, 'all original statuses');
assert.deepEqual(report.results.filter(row => row.group === 'T2-R01-boundary').map(row => row.testId), correctionIds);
assert.equal(new Set(report.results.map(row => row.testId)).size, report.results.length);

const links = new Map();
const traceSource = '02_reference/Game0012_Requirement_Test_Trace_v0.3_DRAFT.csv';
for (const row of csv(traceSource)) links.set(row.requirementId, row.plannedTestIds.split(','));
const approvedGates = csv('03_test_plans/Game0012_P0_Execution_Gates_v0.1_CANDIDATE.csv');
const mandatoryIds = approvedGates.filter(row => row.firstExecutionGateCandidate.startsWith('T1')).map(row => row.testId);
assert.equal(mandatoryIds.length, 153);
const fields = [
  'testId', 'requirementId', 'priority', 'initialState', 'input', 'expected', 'actual',
  'status', 'evidence', 'testedSHA', 'environment', 'reviewer', 'time'
];
const sources = new Map();
let comparable = 0;
const perCase = [];

for (const [index, row] of report.results.entries()) {
  assert(fields.every(name => Object.hasOwn(row, name)), row.testId + ' missing mandatory field');
  assert.equal(row.testedSHA, testedSHA);
  assert(!Number.isNaN(Date.parse(row.time)));
  assert(row.requirementId.length && new Set(row.requirementId).size === row.requirementId.length);
  assert.equal(row.requirementLink.source, 'handoffs/game-0012/e1/' + traceSource);
  assert(['APPROVED_TRACE', 'SUPPLEMENTARY_LINK'].includes(row.requirementLink.kind));
  assert.deepEqual(Object.keys(row.requirementLink.approvedAnchors), row.requirementId);
  for (const id of row.requirementId) {
    assert(links.has(id));
    assert.deepEqual(row.requirementLink.approvedAnchors[id], links.get(id));
    if (row.requirementLink.kind === 'APPROVED_TRACE') assert(links.get(id).includes(row.testId));
  }
  assert.equal(row.reviewer.status, 'NOT_REVIEWED');
  assert.equal(row.reviewer.independentReviewer, null);

  if (row.status === 'NOT_RUN') {
    assert.equal(row.actual, null);
    assert.equal(row.evidence, null);
    assert.equal(row.executor, null);
    assert.equal(row.environment, null);
    assert(row.reason);
    continue;
  }

  assert.equal(row.status, 'PASS', row.testId);
  for (const key of ['initialState', 'input', 'expected']) {
    assert(typeof row[key] === 'string' && row[key].length > 0, row.testId + ' missing ' + key);
  }
  assert.equal(row.executor.kind, 'AUTOMATED');
  assert(row.environment.node && row.environment.platform && row.environment.arch);
  assert(['Node', 'Chromium'].includes(row.environment.runner));
  if (row.environment.runner === 'Chromium') assert(row.environment.chromium);
  assert.deepEqual(row.actual.captureErrors, []);
  assert.equal(row.evidence.type, 'ASSERTION_TRACE');
  assert.equal(row.evidence.ref, '#/results/' + index + '/actual/assertions');
  assert(row.actual.assertions.length > 0, row.testId + ' lacks observations');
  assert.equal(row.evidence.count, row.actual.assertions.length);
  for (const observed of row.actual.assertions) {
    assert.equal(observed.status, 'PASS');
    assert(Object.hasOwn(observed, 'actual') && Object.hasOwn(observed, 'expected'));
    const match = observed.source?.match(/^(games\/0012_time-clone\/tests\/[^:]+):(\d+):(\d+)$/);
    assert(match, row.testId + ' lacks a verifiable assertion source');
    const [, path, line] = match;
    if (!sources.has(path)) sources.set(path, git('show', testedSHA + ':' + path).split('\n'));
    assert.match(sources.get(path)[Number(line) - 1] ?? '', /\bassert\b/);
  }
  const observed = row.actual.assertions.filter(r => r.operator !== 'ok' && r.operator !== 'fail');
  assert(observed.length > 0 || row.actual.measurements, row.testId + ' lacks case-specific observed data');
  comparable += row.actual.assertions.length;
  perCase.push({
    testId: row.testId, status: row.status, requirementId: row.requirementId,
    requirementLink: row.requirementLink.kind, assertions: row.evidence.count, evidence: row.evidence.ref,
    environment: row.environment.runner
  });
}
assert.equal(perCase.length, 189);
const mandatory = perCase.filter(row => mandatoryIds.includes(row.testId));
assert.equal(mandatory.length, 153);
const audited = {
  status: 'PASS', testedSHA, reportSHA256: sha256(bytes),
  mandatoryP0: {
    cases: mandatory.length,
    directApprovedLinks: mandatory.filter(row => row.requirementLink === 'APPROVED_TRACE').length,
    supplementaryLinks: mandatory.filter(row => row.requirementLink === 'SUPPLEMENTARY_LINK').length,
    assertions: mandatory.reduce((sum, row) => sum + row.assertions, 0)
  },
  originalStatusesUnchanged: exact.length, totalAuditedExecuted: perCase.length, assertionRecords: comparable,
  notRun: report.results.filter(row => row.status === 'NOT_RUN').map(row => row.testId),
  reviewerStatus: 'NOT_REVIEWED', executor: 'AUTOMATED',
  approvedTraceSHA256: sha256(readFileSync(new URL(traceSource, e1))),
  cases: perCase
};
if (outputPath) writeFileSync(outputPath, JSON.stringify(audited, null, 2) + '\n');
console.log(JSON.stringify({ ...audited, cases: undefined }));
