'use strict';

const {lstatSync, realpathSync} = require('node:fs');
const {isAbsolute, join, relative, resolve} = require('node:path');
const {stop} = require('./policy.js');

function verifyPath(root, path) {
  const components = typeof path === 'string' ? path.split('/') : [];
  if (!components.length || isAbsolute(path)
    || components.some(part => !part || part === '.' || part === '..' || /[\\\0]/u.test(part))) {
    stop('LS-02', `Invalid repository path: ${path}`);
  }
  let current = root;
  for (const part of components) {
    current = join(current, part);
    const entry = lstatSync(current, {throwIfNoEntry: false});
    if (entry?.isSymbolicLink()) stop('LS-02', `Symbolic link in ${path}.`);
  }
  return current;
}

function validateChangeScope(root, contract, stage, changes, reopenedPaths = new Set()) {
  const repositoryRoot = realpathSync(root);
  const candidates = new Map(contract.candidatePaths.map(entry => [entry.path, entry]));
  for (const change of changes) {
    const {path, operation, mode} = change;
    const candidate = candidates.get(path);
    if (!candidate || !candidate.operations.includes(operation)
      || !['create', 'modify'].includes(operation)
      || (mode !== undefined && !['100644', '100755'].includes(mode))) {
      stop('LS-02', `Change outside the frozen path contract: ${operation} ${path}.`);
    }
    if (operation === 'create' && !candidate.initialCreateStagesCandidate.includes(stage)) {
      stop('LS-02', `Initial creation of ${path} is not allowed during ${stage}.`);
    }
    if (operation === 'modify' && !reopenedPaths.has(path)) {
      stop('LS-02', `Modification of ${path} has no approved reopening.`);
    }
    const current = verifyPath(repositoryRoot, path);
    if (relative(repositoryRoot, resolve(current)) !== path) {
      stop('LS-02', `Path resolves outside its approved spelling: ${path}.`);
    }
  }
  return true;
}

module.exports = {validateChangeScope, verifyPath};
