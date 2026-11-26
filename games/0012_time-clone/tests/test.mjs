import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerDomain } from './domain-cases.mjs';
import { registerRuntime } from './runtime-cases.mjs';
import { registerProgress } from './progress-cases.mjs';
import { registerBrowser, startBrowser } from './browser-cases.mjs';
import { csv, e1, json, repo, sha256, supplements } from './verify-h01.mjs';

const plan = '03_test_plans/';
const index = csv(plan + 'Game0012_Test_Case_Index_v0.4_NORMALIZATION_CANDIDATE.csv');
const gates = new Map(csv(plan + 'Game0012_P0_Execution_Gates_v0.1_CANDIDATE.csv').map(x => [x.testId, x.firstExecutionGateCandidate]));
const vectors = new Map(json(plan + 'Game0012_P0_Concrete_Test_Vectors_v0.1_REVIEW_CANDIDATE.json').items.map(x => [x.testId, x]));
const manifest = json('Game0012_E1_Approved_Scope_Manifest_20261126.json');
const wanted = new Set(index.filter(x => gates.get(x.testId)?.startsWith('T1') || /^UI-\d+$/.test(x.testId) && x.priority === 'P1').map(x => x.testId));
const supplemental = new Set(['T1-H01', 'BROWSER-SAV-19', 'BROWSER-LIVE-CLOCK', ...Array.from({ length: 7 }, (_, i) => 'BROWSER-GC-0' + (i + 1))]);
const checks = new Map();
const add = (id, run, environment = 'Node') => {
  assert(!checks.has(id), 'duplicate test ' + id);
  checks.set(id, { run, environment });
};
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(repo), encoding: 'utf8' }).trim();
const testedSHA = git('rev-parse', 'HEAD');
const worktreeStatus = git('status', '--short');
const supplementBytes = readFileSync(new URL('record-events-t1-h01.json', import.meta.url));
const manifestBytes = readFileSync(new URL('Game0012_E1_Approved_Scope_Manifest_20261126.json', e1));
assert.equal(sha256(manifestBytes), '10f9e128da679e64c048b4bc2ba8fcf7426e5b9cc83273f7d170be4643aec420');
for (const f of manifest.files) {
  const raw = readFileSync(new URL(f.path, e1));
  assert.equal(raw.length, f.bytes, f.path);
  assert.equal(sha256(raw), f.sha256, f.path);
}

let engine, browserError;
try {
  engine = await startBrowser();
} catch (error) {
  browserError = error.message;
}

try {
  registerDomain(add);
  registerRuntime(add);
  registerProgress(add);
  registerBrowser(add, engine);
  assert.deepEqual([...checks.keys()].sort(), [...wanted, ...supplemental].sort());
  assert.equal(index.length, 180);
  assert.equal(wanted.size, 169);
  const results = [];
  for (const entry of [...index, ...[...supplemental].map(testId => ({ testId, priority: 'SUPPLEMENT' }))]) {
    const { testId, priority } = entry;
    const current = checks.get(testId), vector = vectors.get(testId);
    const gate = gates.get(testId) ?? (priority === 'P1' ? testId.startsWith('DEV-') ? 'T3_DEVICE_QA' : 'T1_BROWSER' : 'T1');
    const time = new Date().toISOString();
    const fields = { testId, priority, gate, testedSHA, environment: current?.environment, time };
    if (!current) {
      results.push({
        ...fields, status: 'NOT_RUN',
        reason: gate === 'T4_PROOF_GATE' ? 'DD-H14の独立最適性証明はT4で判定する。' : '指定端末での実機QAはT3で判定する。'
      });
      continue;
    }
    const expected = vector?.expectedAssertions ?? entry.expectedOrSource;
    const setup = vector?.initialSetup;
    const input = vector?.testSteps;
    if (current.environment === 'Chromium' && !engine) {
      results.push({ ...fields, setup, input, expected, status: 'BLOCKED', reason: browserError });
      continue;
    }
    try {
      const measured = await current.run();
      results.push({ ...fields, setup, input, expected, status: 'PASS', actual: measured ?? 'ケースの全アサーションに一致。' });
      console.log('PASS', testId);
    } catch (error) {
      results.push({ ...fields, setup, input, expected, status: 'FAIL', actual: error.message, stack: error.stack });
      console.error('FAIL', testId, error.stack);
    }
  }
  const p0 = results.filter(x => x.priority === 'P0' && x.gate.startsWith('T1'));
  const p1 = results.filter(x => x.priority === 'P1');
  const counts = list => Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map(status => [status, list.filter(x => x.status === status).length]));
  const summary = { t1MandatoryP0: counts(p0), p1: counts(p1), supplemental: counts(results.filter(x => x.priority === 'SUPPLEMENT')) };
  const out = {
    e1Commit: supplements.e1Commit, testedSHA, worktreeStatus,
    environment: { node: process.version, platform: process.platform, arch: process.arch, chromium: engine?.browser.version() },
    sourceManifestSHA256: sha256(manifestBytes), recordEventSupplementSHA256: sha256(supplementBytes),
    summary, results
  };
  if (process.env.GAME0012_TEST_REPORT) writeFileSync(process.env.GAME0012_TEST_REPORT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(summary));
  if (results.some(x => x.status === 'FAIL' || x.status === 'BLOCKED')) process.exitCode = 1;
} finally {
  await engine?.close();
}
