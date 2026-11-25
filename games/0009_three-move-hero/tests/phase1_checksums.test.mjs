import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const digest = v => createHash('sha256').update(v).digest('hex');
const baseline = JSON.parse(readFileSync(new URL('./fixtures/frozen_file_hashes_v0.9.json', import.meta.url), 'utf8'));
test('all 13 copied frozen artifacts exactly match approved source bytes', () => {
  assert.equal(baseline.alg, 'sha256');
  assert.equal(Object.keys(baseline.files).length, 13);
  for (const [path,expected] of Object.entries(baseline.files)) {
    assert.equal(digest(readFileSync(new URL('../'+path, import.meta.url))), expected, path);
  }
});
