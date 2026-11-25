'use strict';

const {execFileSync} = require('node:child_process');
const {join} = require('node:path');
const {digest, loadExecutionPolicy, stop, validateAuthorization} = require('./policy.js');
const {verifyFixedHandoff} = require('./integrity.js');
const {validateChangeScope} = require('./scope.js');

const gitTimeoutMs = 10_000;
// The fixed manifest is approximately 4 MB. Bound both Git output and blob reads.
const maxGitOutputBytes = 8 * 1024 * 1024;

function readFixedBlob(git, ref, name) {
  const object = `${ref}:handoffs/game-0010/${name}`;
  const length = git('cat-file', '-s', object).toString('ascii').trim();
  if (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > maxGitOutputBytes) {
    stop('LS-07', `Invalid or excessive Git blob size for ${name}.`);
  }
  const bytes = git('cat-file', 'blob', object);
  if (bytes.length !== Number(length)) {
    stop('LS-07', `Incomplete Git blob read for ${name}.`);
  }
  return bytes;
}

function parseChanges(bytes) {
  const fields = bytes.toString('utf8').split('\0');
  const changes = [];
  while (fields[0]) {
    const header = /^:[0-7]{6} ([0-7]{6}) [a-f0-9]+ [a-f0-9]+ ([AMDT])$/u.exec(fields.shift());
    const path = fields.shift();
    if (!header || !path) stop('LS-02', 'Unrecognized Git change record.');
    const [, mode, action] = header;
    const operation = action === 'A' ? 'create' : action === 'M' ? 'modify' : 'unsupported';
    changes.push({path, operation, mode});
  }
  if (fields.length !== 1) stop('LS-02', 'Incomplete Git change record.');
  return changes;
}

function listChanges(git, fixed) {
  const raw = ['--raw', '-z', '--no-ext-diff', '--no-renames', '--no-abbrev'];
  const changes = parseChanges(git('diff', ...raw, fixed, '--'));
  // The staged view can differ from the final working tree and must be checked too.
  changes.push(...parseChanges(git('diff', '--cached', ...raw, fixed, '--')));
  for (const path of git('ls-files', '--others', '-z').toString('utf8').split('\0').filter(Boolean)) {
    changes.push({path, operation: 'create'});
  }
  return changes;
}

function runPreflight({root, grant, writerId, stage, isWriter, reopenedPaths, operation}) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['-C', root, ...args], {
        maxBuffer: maxGitOutputBytes,
        timeout: gitTimeoutMs,
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const reason = error.code ?? error.status ?? error.signal ?? 'unknown';
      stop('LS-07', `Git ${args[0]} failed (${reason}).`);
    }
  };
  if (!grant || !/^[a-f0-9]{40}$/u.test(grant.handoffCommitSha)) {
    stop('LS-08', 'The external grant must supply a fixed handoff commit.');
  }
  const ref = git('rev-parse', '--verify', `${grant.handoffCommitSha}^{commit}`).toString().trim();
  const base = git('rev-parse', '--verify', `${ref}^`).toString().trim();
  const branch = git('symbolic-ref', '--short', 'HEAD').toString().trim();
  const remote = git('remote', 'get-url', 'origin').toString().trim();
  const readFixed = name => readFixedBlob(git, ref, name);
  const policyBytes = readFixed('15_execution_policy.json');
  const pathsBytes = readFixed('19_allowed_paths.json');
  const policy = loadExecutionPolicy(policyBytes, grant.policyDigest);
  const repository = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)\/?(?:\.git)?$/u.exec(remote)?.[1];
  const actual = {repository, branch, writerId, stage, isWriter, baseCommitSha: base,
    handoffCommitSha: ref, policyDigest: digest(policyBytes), allowedPathsDigest: digest(pathsBytes)};
  validateAuthorization(policy, grant, actual, operation);
  try {
    git('merge-base', '--is-ancestor', ref, 'HEAD');
  } catch {
    stop('LS-07', 'Development HEAD does not descend from the fixed handoff.');
  }
  verifyFixedHandoff(readFixed, join(root, 'handoffs/game-0010'));
  validateChangeScope(root, JSON.parse(pathsBytes), stage, listChanges(git, ref), reopenedPaths);
  return actual;
}

module.exports = {runPreflight};
