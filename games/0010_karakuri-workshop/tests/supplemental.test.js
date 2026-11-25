'use strict';

const assert = require('node:assert/strict');
const {mkdtempSync, readFileSync, mkdirSync, rmSync, symlinkSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve} = require('node:path');
const {test} = require('node:test');
const {digest, loadExecutionPolicy, validateAuthorization} = require('../qa/harness/policy.js');
const {validateChangeScope, verifyPath} = require('../qa/harness/scope.js');
const {verifyProtectedAssets} = require('../qa/harness/integrity.js');

const handoff = resolve(__dirname, '../../../handoffs/game-0010');
const policyBytes = readFileSync(join(handoff, '15_execution_policy.json'));
const policySha = 'b89f94b4bf800aefe5fd27c19a66b0a7715ccdb2f95d97af031b5984b6df3cfa';
const pathBytes = readFileSync(join(handoff, '19_allowed_paths.json'));
const allowedSha = 'e9b7f557cb26c535dd1ddb3f1903db060cd90ac49d2aa0d0d908d2174a98dbd6';
const scope = JSON.parse(pathBytes);
const base = 'afbb965fe57c4772f91cbe67e59571180e9073f8';
const handoffSha = 'd5bae9f0afe6b6d860257e2dfec25e028e557a4f';
const grant = {
  approvalId: 'test-approval',
  baseCommitSha: base,
  handoffCommitSha: handoffSha,
  policyDigest: policySha,
  allowedPathsDigest: allowedSha,
  targetBranch: 'codex/game-0010-development',
  allowedOperations: ['read', 'create', 'review'],
  authorizedWriterId: 'fixture-writer',
};
const actual = {
  baseCommitSha: base,
  handoffCommitSha: handoffSha,
  policyDigest: digest(policyBytes),
  allowedPathsDigest: digest(pathBytes),
  repository: 'hosoigrit/daily-mini-games',
  branch: grant.targetBranch,
  writerId: grant.authorizedWriterId,
  stage: 'E0',
  isWriter: true,
};

test('authorization fixture allows valid external grant and refuses absent rights, identity and SHA', () => {
  const policy = loadExecutionPolicy(policyBytes, policySha);
  assert.equal(policy.approval.implementation, false);
  assert.equal(validateAuthorization(policy, grant, actual, 'create'), true);
  const {approvalId, ...missingApproval} = grant;
  for (const candidate of [null, missingApproval, {...grant, allowedOperations: ['read']},
    {...grant, allowedOperations: ['create', 'unknown']}]) {
    assert.throws(() => validateAuthorization(policy, candidate, actual, 'create'), {code: 'LS-08'});
  }
  assert.throws(() => validateAuthorization(policy, grant, {...actual, isWriter: false}, 'create'),
    {code: 'LS-08'});
  assert.equal(validateAuthorization(policy, grant, {...actual, isWriter: false}, 'review'), true);
  for (const field of ['baseCommitSha', 'handoffCommitSha']) {
    const sha = actual[field];
    const changed = (sha[0] === 'a' ? 'b' : 'a') + sha.slice(1);
    assert.throws(() => validateAuthorization(policy, grant, {...actual, [field]: changed}, 'create'),
      {code: 'LS-07'});
  }
  for (const changes of [{branch: 'main'}, {branch: 'codex/another-game'}, {repository: 'other/daily-mini-games'}]) {
    assert.throws(() => validateAuthorization(policy, grant, {...actual, ...changes}, 'create'), {code: 'LS-14'});
  }
  for (const forbidden of ['pullRequest', 'updatePullRequest', 'merge', 'publish', 'forcePush',
    'pushMain', 'changeSharedConfig']) {
    assert.throws(() => validateAuthorization(policy, grant, actual, forbidden), {code: 'LS-08'});
  }
  const unknownVersion = Buffer.from(JSON.stringify({...policy, policyVersion: 2}));
  assert.throws(() => loadExecutionPolicy(unknownVersion, digest(unknownVersion)), {code: 'LS-01'});
});

test('scope fixture rejects creation outside scope, deletions, moves, links and Git submodules', t => {
  const root = mkdtempSync(join(tmpdir(), 'game0010-scope-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const prefix = 'games/0010_karakuri-workshop';
  const path = `${prefix}/README.md`;
  assert.equal(validateChangeScope(root, scope, 'E0', [{path, operation: 'create'}]), true);
  for (const change of [
    {path: 'games/0009/README.md', operation: 'create'},
    {path, operation: 'delete'},
    {path, operation: 'rename'},
    {path, operation: 'create', mode: '160000'},
    {path, operation: 'create', mode: '120000'},
    {path: `${prefix}/index.html`, operation: 'create'},
  ]) {
    assert.throws(() => validateChangeScope(root, scope, 'E0', [change]), {code: 'LS-02'});
  }
  assert.throws(() => verifyPath(root, '../README.md'), {code: 'LS-02'});
  assert.throws(() => verifyPath(root, '/README.md'), {code: 'LS-02'});
  mkdirSync(join(root, 'games'));
  mkdirSync(join(root, 'outside'));
  symlinkSync(join(root, 'outside'), join(root, prefix), 'dir');
  assert.throws(() => validateChangeScope(root, scope, 'E0', [{path, operation: 'create'}]), {code: 'LS-02'});
});

test('protected inventory detects joint expectation and worktree hash tampering', () => {
  const path = 'tests/approved.test.js';
  const list = 'tests/SHA256SUMS.txt';
  const fixture = script => {
    const entry = sha256 => ({mode: '100644', sha256});
    const proof = digest(script);
    return new Map([[path, entry(proof)], [list, entry(digest(proof + '  ' + path + '\n'))]]);
  };
  const expected = fixture('assert.equal(answer, 1);');
  assert.equal(verifyProtectedAssets(expected, fixture('assert.equal(answer, 1);')), true);
  assert.throws(() => verifyProtectedAssets(expected, fixture('assert.equal(answer, 2);')), {code: 'LS-09'});
  assert.throws(() => verifyProtectedAssets(expected, fixture('test.skip("original");')), {code: 'LS-09'});
  const removed = new Map(expected);
  removed.delete(path);
  assert.throws(() => verifyProtectedAssets(expected, removed), {code: 'LS-09'});
});

test('frozen manifest, early mutation decision and raw evidence are independently checked', () => {
  const {
    indexManifest, effectiveDependencies, verifyManifest, reconcileCaseResults, verifyReportedResults,
  } = require('../qa/harness/test-runner.js');
  const fixed = JSON.parse(readFileSync(join(handoff, '18_test_execution_manifest.json')));
  const cases = indexManifest(fixed);
  assert.equal(cases.size, 982);
  const early = cases.get('TC-D7-023-C024');
  assert.equal(early.engineeringStage, 'E0');
  assert.equal(effectiveDependencies(early, 'E0').at(-1), 'E0の指定フィクスチャと当該工程の対象機能の成立');
  assert.equal(effectiveDependencies(early, 'E8').at(-1), 'E8対象機能の成立');
  assert.equal(early.dependencies.at(-1), 'E8対象機能の成立');
  assert.equal([...cases.values()].filter(item =>
    !require('node:util').isDeepStrictEqual(effectiveDependencies(item, item.engineeringStage),
      item.dependencies)).length, 11);
  const modified = structuredClone(fixed);
  const tampered = modified.parents.flatMap(parent => parent.cases).find(item => item.caseId === early.caseId);
  tampered.engineeringStage = 'E7';
  assert.throws(() => verifyManifest(fixed, modified), {code: 'LS-09'});
  assert.equal(verifyManifest(fixed, fixed), true);

  const testCases = new Map([['A', {parentTestId: 'parent'}], ['B', {parentTestId: 'parent'}]]);
  const identity = {testedSha: 'a'.repeat(40), executionFingerprint: 'b'.repeat(64)};
  const evidence = [
    {caseId: 'A', parentTestId: 'parent', status: 'PASS', evidenceRef: 'raw:1', ...identity},
    {caseId: 'B', parentTestId: 'parent', status: 'FAIL', evidenceRef: 'raw:2', ...identity},
  ];
  const actual = reconcileCaseResults(testCases, evidence, identity);
  assert.equal(verifyReportedResults(actual, new Map([['A', 'PASS'], ['B', 'FAIL']])), true);
  assert.throws(() => verifyReportedResults(actual, new Map([['A', 'PASS'], ['B', 'PASS']])), {code: 'LS-16'});
  assert.throws(() => verifyReportedResults(actual, new Map([['A', 'PASS']])), {code: 'LS-16'});
  assert.equal(reconcileCaseResults(testCases, [evidence[0]], identity).get('B'), 'NOT_RUN');
  assert.throws(() => reconcileCaseResults(testCases, [...evidence, evidence[0]], identity), {code: 'LS-16'});
});

test('engineering gate refuses incomplete evidence without requiring future cases early', () => {
  const {evaluateFixtureEngineeringGate: evaluateEngineeringGate} = require('../qa/harness/gate.js');
  const policy = loadExecutionPolicy(policyBytes, policySha);
  const cases = new Map([
    ['current', {required: true, engineeringStage: 'E0'}],
    ['future', {required: true, engineeringStage: 'E7'}],
  ]);
  const verified = {regression: true, protection: true, scope: true, budget: true,
    authorization: true, evidence: true, independentReview: true, dependencies: true, hitlClear: true};
  const cfg = {stage: 'E0', policy, cases, gates: {}, verified, findings: [],
    mutationStatuses: {'MUT-12': 'PASS'}, results: new Map([['current', 'PASS'], ['future', 'NOT_RUN']])};
  assert.equal(evaluateEngineeringGate(cfg).canAdvance, true);
  for (const status of ['FAIL', 'NOT_RUN', 'BLOCKED', 'STALE']) {
    assert.equal(evaluateEngineeringGate({...cfg, results: new Map([['current', status]])}).status, 'HOLD');
  }
  assert.equal(evaluateEngineeringGate({...cfg, verified: {...verified, independentReview: false}}).status, 'HOLD');
  assert.equal(evaluateEngineeringGate({...cfg, verified: {...verified, hitlClear: false}}).status, 'HOLD');
  assert.equal(evaluateEngineeringGate({...cfg, findings: [{severity: 'HIGH', state: 'OPEN'}]}).status, 'HOLD');
  assert.equal(evaluateEngineeringGate({...cfg, mutationStatuses: {}}).status, 'HOLD');
  assert(evaluateEngineeringGate({...cfg, stage: 'E7'}).prerequisites.includes('E0'));
});

const budgetBoundaryCases = [
  ['C002', {stageAdjustmentsByStage: {'04': 12}},
    {targetStage: '04', reserve: {stageAdjustments: 1, automatedSeconds: 1}},
    /stageAdjustmentsByStage:04/u],
  ['C003', {generatedByStage: {'04': 6000}},
    {targetStage: '04', reserve: {generated: 1, automatedSeconds: 1}}, /generatedByStage:04/u],
  ['C004', {searchTicksByStage: {'04': 2_400_000}},
    {targetStage: '04', reserve: {searchTicks: 1, automatedSeconds: 1}}, /searchTicksByStage:04/u],
  ['C005', {automatedSeconds: 5400, searchSecondsByStage: {'01': 900, '02': 900, '03': 900, '05': 900, '06': 900, '07': 900}},
    {targetStage: '04', reserve: {searchSeconds: 1, automatedSeconds: 1}}, /searchSecondsByStage:04/u],
  ['C006', {physicsCandidatesByStage: {E1: 20, E3: 20, E4: 20}},
    {engineeringStage: 'E4', reserve: {physicsCandidates: 1, automatedSeconds: 1}}, /physicsCandidatesByStage:E4/u],
  ['C007', {automatedSeconds: 21_600}, {reserve: {automatedSeconds: 1}}, /automatedSeconds/u],
];

for (const [subcase, usage, reservation, message] of budgetBoundaryCases) {
  test(`TC-D8-012-${subcase}: refuse the fixed isolated boundary without recording a reservation`, () => {
    const {reserveBudget} = require('../qa/harness/budget.js');
    const {budgets} = loadExecutionPolicy(policyBytes, policySha);
    const checkpoint = {usage: structuredClone(usage), reservations: []};
    const before = structuredClone(checkpoint);
    const proposal = {runId: `isolated-${subcase}`, ...reservation};
    const allowed = reserveBudget({usage: {}, reservations: []}, proposal, budgets);
    assert.equal(allowed.reservations[0].state, 'RESERVED');
    assert.throws(() => reserveBudget(checkpoint, proposal, budgets), {code: 'BUDGET_EXCEEDED', message});
    assert.deepEqual(checkpoint, before);
  });
}

test('TC-D8-012-C006: the shared physics candidate bound is checked independently', () => {
  const {permitsPhysicsCandidates} = require('../qa/harness/budget.js');
  const {budgets} = loadExecutionPolicy(policyBytes, policySha);
  assert.equal(permitsPhysicsCandidates({stageUsed:19,totalUsed:59,request:1},budgets),true);
  assert.equal(permitsPhysicsCandidates({stageUsed:19,totalUsed:60,request:1},budgets),false);
  assert.equal(permitsPhysicsCandidates({stageUsed:20,totalUsed:59,request:1},budgets),false);
});

test('TC-D8-012-C001: a mixed reservation is atomic when an independent bound is exhausted', () => {
  const {reserveBudget} = require('../qa/harness/budget.js');
  const {budgets} = loadExecutionPolicy(policyBytes, policySha);
  for (const [subcase, usage, reservation, message] of budgetBoundaryCases) {
    const current = {usage, reservations: []};
    const previous = structuredClone(current);
    const proposed = {runId: `aggregate-${subcase}`, ...reservation, reserve: {
      ...reservation.reserve, automatedSeconds: Math.max(2, reservation.reserve.automatedSeconds),
    }};
    assert.throws(() => reserveBudget(current, proposed, budgets), {code: 'BUDGET_EXCEEDED', message});
    assert.deepEqual(current, previous);
  }
});

test('TC-D8-015-C001: only the verified original task or approved writer transfer may resume', () => {
  const {verifyResumeAuthority} = require('../qa/harness/checkpoint.js');
  const external = {approvalId: 'fixture-grant', baseCommitSha: base, handoffCommitSha: handoffSha,
    writerId: 'fixture-writer', branch: grant.targetBranch};
  const checkpoint = {...external, digest: 'a'.repeat(64), head: handoffSha, remoteHead: handoffSha};
  const observations = {...external, head: handoffSha, remoteHead: handoffSha,
    latestCheckpointDigest: checkpoint.digest, loadedCheckpointDigest: checkpoint.digest,
    replayedHistoryVerified: true, protectedScopeVerified: true};
  const verify = observed => verifyResumeAuthority({checkpoint, external, observed});
  assert.equal(verify({...observations, sameTaskVerified: true}), true);
  const approvedTransfer = {...observations, sameTaskVerified: false,
    priorWriterStopped: true, readBackFromApprovedRemote: true};
  assert.equal(verify(approvedTransfer), true);
  for (const mismatch of [
    {latestCheckpointDigest: 'b'.repeat(64)}, {priorWriterStopped: false},
    {approvalId: 'wrong-grant'}, {readBackFromApprovedRemote: false},
    {replayedHistoryVerified: false}, {protectedScopeVerified: false},
    {priorWriterStopped: 'unverified'}, {readBackFromApprovedRemote: 'unverified'},
    {head: undefined}, {remoteHead: null},
  ]) {
    assert.throws(() => verify({...approvedTransfer, ...mismatch}), {code:'LS-13'});
  }
  assert.throws(() => verify({...approvedTransfer, remoteHead: base}), {code:'LS-14'});
});

test('TC-D8-019-C001: preserve old gates and invalidate only the affected stage and its successors', () => {
  const {invalidateAffectedGates} = require('../qa/harness/impact.js');
  const stageIds = Array.from({length:9},(_, index)=>`E${index}`);
  const gates = Object.fromEntries(stageIds.map(stage=>[stage,'PASS']));
  for (const [kind, activeStage, firstAffected] of [
    ['commonPhysics','E4',1], ['stageDefinition','E6',6], ['save','E7',7],
  ]) {
    const update = invalidateAffectedGates({kind, activeStage, changeAuthorized: true, commonPhysicsFrozen: false, gates});
    assert.deepEqual(update.reopened, stageIds.slice(firstAffected));
    assert.deepEqual(Object.values(update.gates),
      stageIds.map((_, index)=>index<firstAffected?'PASS':'STALE'));
    assert(Object.values(gates).every(result=>result==='PASS'));
  }
  assert.throws(() => invalidateAffectedGates({kind:'commonPhysics',activeStage:'E6',
    changeAuthorized:true,commonPhysicsFrozen:false,gates}), {code:'LS-08'});
  assert.throws(() => invalidateAffectedGates({kind:'commonPhysics',activeStage:'E4',
    changeAuthorized:true,commonPhysicsFrozen:true,gates}), {code:'LS-08'});
  assert.throws(() => invalidateAffectedGates({kind:'unknown',activeStage:'E6',
    changeAuthorized:true,gates}), {code:'LS-01'});
});

const forbiddenOperations = [
  ['C002','pullRequest'], ['C003','updatePullRequest'], ['C004','merge'],
  ['C005','publish'], ['C006','forcePush'], ['C007','pushMain'], ['C008','changeSharedConfig'],
];

function attemptExternalCommand(operation, calls) {
  const policy = loadExecutionPolicy(policyBytes, policySha);
  validateAuthorization(policy, grant, actual, operation);
  calls.push(operation);
}

for (const [subcase, operation] of forbiddenOperations) {
  test(`TC-D8-005-${subcase}: reject ${operation} before dispatch`, () => {
    const calls = [];
    assert.throws(() => attemptExternalCommand(operation, calls), {code:'LS-08'});
    assert.deepEqual(calls, []);
  });
}

test('TC-D8-005-C001: blocked GitHub operations cannot reach the isolated dispatcher', () => {
  const calls = [];
  for (const operation of ['pushMain','pullRequest','merge','publish']) {
    assert.throws(() => attemptExternalCommand(operation, calls), {code:'LS-08'});
  }
  assert.deepEqual(calls, []);
  attemptExternalCommand('read',calls);
  assert.deepEqual(calls,['read']);
});

const fixedCorrections = [
  ['C002','E0',4,29,1,true],
  ['C003','E0',5,29,0,false],
  ['C004','E1',4,30,0,false],
  ['C005','E0',2,2,2,false],
];
function checkCorrectionBoundary(stage, stageUsed, totalUsed, majorUsed, allowed) {
  const {reserveBudget,startReservation,settleBudgetUsage} = require('../qa/harness/budget.js');
  const {budgets} = loadExecutionPolicy(policyBytes, policySha);
  const rootCause = 'fixture';
  const current = {reservations:[],usage:{remediationTotal:totalUsed,
    remediationByStage:{[stage]:stageUsed},remediationByRootCause:{[rootCause]:majorUsed}}};
  const original = structuredClone(current);
  const proposal = {runId:'fixture-remediation',remediation:{stages:[stage],majorRootCause:rootCause},
    reserve:{automatedSeconds:120}};
  if (!allowed) {
    assert.throws(()=>reserveBudget(current,proposal,budgets),{code:'BUDGET_EXCEEDED'});
    assert.throws(()=>startReservation(current,proposal.runId),{code:'UNKNOWN_RESERVATION'});
  } else {
    const reserved=reserveBudget(current,proposal,budgets);
    assert.equal(reserved.reservations[0].state,'RESERVED');
    assert.deepEqual(reserved.usage, original.usage);
    const started=startReservation(reserved,proposal.runId);
    assert.equal(started.usage.remediationTotal,totalUsed+1);
    assert.equal(started.usage.remediationByStage[stage],stageUsed+1);
    assert.equal(started.usage.remediationByRootCause[rootCause],majorUsed+1);
    const interrupted=settleBudgetUsage(started,proposal.runId,null);
    assert.equal(interrupted.usage.automatedSeconds,120);
    assert.equal(interrupted.usage.remediationTotal,totalUsed+1);
  }
  assert.deepEqual(current,original);
}
for (const [subcase,...variant] of fixedCorrections) {
  test(`TC-D8-009-${subcase}: evaluate the frozen correction boundary`, () => checkCorrectionBoundary(...variant));
}
test('TC-D8-009-C001: verify combined correction bounds', () => {
  for (const [, ...variant] of fixedCorrections) checkCorrectionBoundary(...variant);
});

const prohibitedChanges = [
  ['C003','games/another-game/README.md','create',undefined],
  ['C004','games/0010_karakuri-workshop/README.md','delete',undefined],
  ['C005','games/0010_karakuri-workshop/README.md','rename',undefined],
  ['C006','games/0010_karakuri-workshop/README.md','create','120000'],
  ['C007','games/0010_karakuri-workshop/../README.md','create',undefined],
  ['C008','/README.md','create',undefined],
  ['C009','games/0010_karakuri-workshop/README.md','modify','160000'],
];

function inspectFixtureTree(directory) {
  const {readdirSync, lstatSync, readlinkSync} = require('node:fs');
  const entries = [];
  function visit(parent, relative) {
    for (const key of readdirSync(parent).sort()) {
      const absolute = join(parent,key);
      const path = relative ? `${relative}/${key}` : key;
      const item = lstatSync(absolute);
      if (item.isSymbolicLink()) entries.push([path, 'link', readlinkSync(absolute)]);
      else if (item.isDirectory()) visit(absolute,path);
      else entries.push([path,item.mode,digest(readFileSync(absolute))]);
    }
  }
  visit(directory,'');
  return entries;
}

for (const [id,path,operation,mode] of prohibitedChanges) {
  test(`TC-D8-004-${id}: isolate and reject ${operation} before any filesystem mutation`, t => {
    const {writeFileSync} = require('node:fs');
    const root = mkdtempSync(join(tmpdir(),'game0010-scope-diff-'));
    t.after(()=>rmSync(root,{recursive:true,force:true}));
    const game = join(root,'games/0010_karakuri-workshop');
    mkdirSync(game,{recursive:true});
    const readme=join(game,'README.md');
    writeFileSync(join(root,'protected'),'untouched');
    if (mode==='120000') symlinkSync(join(root,'protected'),readme);
    else writeFileSync(readme,'existing asset');
    const before=inspectFixtureTree(root);
    let dispatched=0;
    assert.throws(() => {
      validateChangeScope(root,scope,'E0',[{path,operation,mode}]);
      dispatched++;
    }, {code:'LS-02'});
    assert.equal(dispatched,0);
    assert.deepEqual(inspectFixtureTree(root),before);
  });
}

test('TC-D8-002-C002: base and handoff SHA errors prevent fixture dispatch', () => {
  const policy=loadExecutionPolicy(policyBytes,policySha);
  let starts=0;
  const open=(observed)=>{
    validateAuthorization(policy,grant,observed,'create');
    starts++;
  };
  open(actual);
  for (const field of ['baseCommitSha','handoffCommitSha']) {
    const prior=actual[field];
    const changed=(prior[0] === 'a' ? 'b' : 'a')+prior.slice(1);
    assert.throws(()=>open({...actual,[field]:changed}),{code:'LS-07'});
  }
  assert.equal(starts,1);
});

test('TC-D8-003-C002: reject repo, main and another game branch without dispatch', () => {
  const policy=loadExecutionPolicy(policyBytes,policySha);
  let starts=0;
  const open=(observed)=>{
    validateAuthorization(policy,grant,observed,'create');
    starts++;
  };
  for (const unauthorized of [{repository:'another/repository'}, {branch:'main'}, {branch:'codex/game-0009-development'}]) {
    assert.throws(()=>open({...actual,...unauthorized}),{code:'LS-14'});
  }
  assert.equal(starts,0);
  open(actual);
  assert.equal(starts,1);
});

test('TC-D8-017-C001: even RUN evidence fails the prerequisite for advance', () => {
  const {evaluateFixtureEngineeringGate: evaluateEngineeringGate}=require('../qa/harness/gate.js');
  const policy=loadExecutionPolicy(policyBytes,policySha);
  const cases=new Map([['required',{required:true,engineeringStage:'E0'}]]);
  const verified={scope:true,protection:true,authorization:true,budget:true,independentReview:true,
    dependencies:true,evidence:true,regression:true,hitlClear:true};
  for (const status of ['FAIL','NOT_RUN','BLOCKED','STALE','RUN','PASS']) {
    const result=evaluateEngineeringGate({stage:'E0',policy,cases,results:new Map([['required',status]]),
      gates:{},verified,findings:[],mutationStatuses:{'MUT-12':'PASS'}});
    assert.equal(result.canAdvance,status==='PASS');
  }
});

test('TC-D7-026-C001: stale spring dependents and incomplete prerequisites cannot advance', () => {
  const {evaluateFixtureEngineeringGate: evaluateEngineeringGate} = require('../qa/harness/gate.js');
  const {invalidateAffectedGates} = require('../qa/harness/impact.js');
  const policy = loadExecutionPolicy(policyBytes,policySha);
  const passed = Object.fromEntries(policy.execution.stages.map(stage=>[stage,'PASS']));
  const springChange = invalidateAffectedGates({kind:'spring',activeStage:'E3',changeAuthorized:true,gates:passed});
  assert.deepEqual(springChange.reopened,['E3','E5','E6','E7','E8']);
  assert.equal(springChange.gates.E4,'PASS');
  assert.equal(passed.E3,'PASS');
  const input = {stage:'E5',policy,cases:new Map([['local',{required:true,engineeringStage:'E5'}]]),
    results:new Map([['local','PASS']]),findings:[],mutationStatuses:{
      'MUT-01':'PASS','MUT-06':'PASS','MUT-07':'PASS','MUT-08':'PASS','MUT-09':'PASS',
    },verified:{scope:true,protection:true,authorization:true,budget:true,independentReview:true,
      dependencies:true,evidence:true,regression:true,hitlClear:true}};
  assert.equal(evaluateEngineeringGate({...input,gates:passed}).canAdvance,true);
  for (const status of ['FAIL','NOT_RUN','BLOCKED','STALE']) {
    assert.equal(evaluateEngineeringGate({...input,gates:{...passed,E3:status}}).canAdvance,false);
  }
  assert.equal(evaluateEngineeringGate({...input,gates:springChange.gates,
    results:new Map([['local','NOT_RUN']])}).canAdvance,false);
});

test('TC-D8-018-C001: future E7 stays pending at E2 and E8 includes prior applicable automatic cases', () => {
  const {evaluateFixtureEngineeringGate: evaluateEngineeringGate}=require('../qa/harness/gate.js');
  const {verifyManifest}=require('../qa/harness/test-runner.js');
  const policy=loadExecutionPolicy(policyBytes,policySha);
  const cases=new Map([
    ['current',{engineeringStage:'E2',method:'I',required:true}],
    ['ui',{engineeringStage:'E7',method:'B',required:true}],
    ['final',{engineeringStage:'E8',method:'I',required:true}],
    ['realDevice',{engineeringStage:'HUMAN_QA',method:'D',required:true}],
  ]);
  const gates=Object.fromEntries(policy.execution.stages.map(stage=>[stage,'PASS']));
  const mutationStatuses=Object.fromEntries(Object.keys(policy.execution.earlyMutationStages).map(id=>[id,'PASS']));
  const verified={scope:true,protection:true,authorization:true,budget:true,independentReview:true,
    dependencies:true,evidence:true,regression:true,hitlClear:true};
  const cfg={stage:'E2',policy,cases,gates,findings:[],mutationStatuses,verified,
    results:new Map([['current','PASS'],['ui','NOT_RUN'],['final','NOT_RUN'],['realDevice','NOT_RUN']])};
  assert.equal(evaluateEngineeringGate(cfg).canAdvance,true);
  cfg.results.set('current','STALE');
  cfg.results.set('final','PASS');
  const whenE8=evaluateEngineeringGate({...cfg,stage:'E8'});
  assert.deepEqual(whenE8.pendingCases,['current','ui']);
  assert.equal(whenE8.canAdvance,false);
  const frozen=JSON.parse(readFileSync(join(handoff,'18_test_execution_manifest.json')));
  const moved=structuredClone(frozen);
  const stage2=moved.parents.flatMap(parent=>parent.cases).find(item=>item.required&&item.engineeringStage==='E2');
  stage2.engineeringStage='E7';
  assert.throws(()=>verifyManifest(frozen,moved),{code:'LS-09'});
});
