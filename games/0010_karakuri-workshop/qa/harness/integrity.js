'use strict';

const {lstatSync, readFileSync, readdirSync} = require('node:fs');
const {join} = require('node:path');
const {digest, stop} = require('./policy.js');

function verifyProtectedAssets(expectedEntries, actualEntries) {
  if (expectedEntries.size !== actualEntries.size) stop('LS-09', 'Protected file inventory changed.');
  for (const [path, original] of expectedEntries) {
    const actual = actualEntries.get(path);
    if (!actual || original.mode !== actual.mode || original.sha256 !== actual.sha256) {
      stop('LS-09', `Protected asset differs: ${path}.`);
    }
  }
  return true;
}

function verifyFixedHandoff(readFixed, directory) {
  const sums = readFixed('SHA256SUMS.txt').toString('utf8').replace(/\r\n/gu, '\n').trimEnd();
  const digests = new Map();
  for (const line of sums.split('\n')) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/u.exec(line);
    if (!match || match[2] === 'SHA256SUMS.txt' || digests.has(match[2])) {
      stop('LS-09', 'Invalid entry in the fixed SHA256SUMS.');
    }
    digests.set(match[2], match[1]);
  }
  if (digests.size !== 21) stop('LS-09', 'The fixed handoff must describe exactly 21 content hashes.');
  const actual = readdirSync(directory);
  if (actual.length !== 22) stop('LS-09', 'Expected precisely 22 handoff files.');
  for (const file of actual) {
    const path = join(directory, file);
    if (!lstatSync(path).isFile()) stop('LS-09', `Handoff path is not a regular file: ${file}.`);
    const fixed = readFixed(file);
    const verified = file === 'SHA256SUMS.txt' || digests.get(file) === digest(fixed);
    if (!verified || !fixed.equals(readFileSync(path))) {
      stop('LS-09', `Handoff file changed or failed its fixed digest: ${file}.`);
    }
  }
  return true;
}

module.exports = {verifyProtectedAssets, verifyFixedHandoff};
