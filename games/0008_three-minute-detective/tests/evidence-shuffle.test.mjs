import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS } from '../case-data.mjs';
import { shuffledEvidenceIds, evaluateProof } from '../engine.mjs';

test('every investigation presents all evidence cards exactly once, including duplicates of facts', () => {
  for (const variant of VARIANTS) {
    const original = variant.evidence.map(e => e.id);
    for (const seed of [0, 0.12, 0.5, 0.9999, Number.NaN]) {
      const display = shuffledEvidenceIds(variant, () => seed);
      assert.equal(display.length, original.length, variant.id);
      assert.deepEqual([...display].sort(), [...original].sort(), variant.id);
      assert.equal(new Set(display).size, original.length, variant.id);
      // The source catalog must stay untouched.
      assert.deepEqual(variant.evidence.map(e => e.id), original, variant.id);
    }
  }
});

test('display order is no longer always equivalent to proof order', () => {
  for (const variant of VARIANTS) {
    const original = variant.evidence.map(e => e.id);
    const shuffled = shuffledEvidenceIds(variant, () => 0);
    assert.notDeepEqual(shuffled, original, `${variant.id} remained unshuffled`);
    const valid = variant.evidence.filter(e => e.facts.length).slice(0,4).map(e => e.id);
    // The order of evidence shown to a player cannot affect proof evaluation.
    assert.deepEqual(evaluateProof(variant,variant.culprit,valid),evaluateProof(variant,variant.culprit,[...valid].reverse()));
  }
});

test('shuffle uses RNG only for display; varying RNG changes visual layout', () => {
  for(const variant of VARIANTS) {
    assert.notDeepEqual(shuffledEvidenceIds(variant,()=>0),shuffledEvidenceIds(variant,()=>0.99999));
  }
});

test('bad source catalog is rejected', () => {
  assert.throws(()=>shuffledEvidenceIds(null),TypeError);
  assert.throws(()=>shuffledEvidenceIds({evidence:null}),TypeError);
});
