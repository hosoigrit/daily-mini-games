import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const manifest = data('game0009_stage_manifest_v0.9.json');
const expected = fixture('game0009_full_960_expected_v0.9.json');
const vectors = fixture('game0009_ruleset_fingerprint_vectors_v1.json');
const stageIds = new Set(manifest.stages.map(s => s.stageId));
const cardIds = new Set(Object.keys(manifest.cardCatalog));

// PHASE 1 ONLY: contract and oracle integrity, never a self-fulfilling battle implementation.
test('frozen manifests contain 16 uniquely identified stages and six cards', () => {
  assert.equal(stageIds.size, 16);
  assert.equal(cardIds.size, 6);
  assert.equal(manifest.stages.filter(s => s.group === 'main').length, 8);
  assert.equal(manifest.stages.filter(s => s.group === 'extra').length, 8);
  for (const s of manifest.stages) {
    assert.equal(s.hand.length, 5, s.stageId);
    assert.equal(new Set(s.hand).size, 5, s.stageId);
    assert.equal(s.enemyActions.length, 3, s.stageId);
    assert.ok(s.hand.every(c => cardIds.has(c)), s.stageId);
    assert.ok(s.rating.star3.minHp >= s.rating.star2MinHp, s.stageId);
    assert.ok(s.unlockAfter === null || stageIds.has(s.unlockAfter), s.stageId);
  }
  assert.equal(manifest.stages.find(s => s.stageId === 'extra-01').rating.star3.objective.cardId, 'magic');
});

test('all 960 ordered original plans are present exactly once', () => {
  assert.equal(expected.originalPlanCases, 960);
  assert.equal(expected.cases.length, 960);
  assert.equal(expected.rulesFingerprint, vectors.canonicalRulesetFingerprint);
  const keys = new Set();
  for (const s of manifest.stages) {
    const cases = expected.cases.filter(v => v.stageId === s.stageId);
    assert.equal(cases.length, 60, s.stageId);
    for (const c of cases) {
      assert.equal(c.plan.length, 3);
      assert.equal(new Set(c.plan).size, 3);
      assert.ok(c.plan.every(id => s.hand.includes(id)));
      assert.ok(c.expected.executed.length <= 3);
      assert.deepEqual(c.expected.executed, c.plan.slice(0, c.expected.executed.length));
      assert.equal(c.expected.turns, c.expected.executed.length);
      const key = `${c.stageId}:${c.plan.join(',')}`;
      assert.ok(!keys.has(key), `duplicate ${key}`);
      keys.add(key);
    }
  }
});

test('frozen unique victory sequence and star distributions are consistent', () => {
  const unique = new Map();
  for (const c of expected.cases.filter(c => c.expected.outcome === 'win')) {
    assert.ok(c.expected.stars >= 1 && c.expected.stars <= 3);
    const id = `${c.stageId}:${c.expected.executed.join(',')}`;
    if (unique.has(id)) assert.deepEqual(unique.get(id), c.expected);
    else unique.set(id, c.expected);
  }
  const counts = { '1': 0, '2': 0, '3': 0 };
  for (const r of unique.values()) counts[String(r.stars)]++;
  assert.equal(unique.size, 112);
  assert.deepEqual(counts, {'1':45,'2':45,'3':22});
  assert.deepEqual(counts, expected.uniqueWinStars);
  for (const s of manifest.stages) {
    const seen = new Set(Array.from(unique.entries()).filter(([id]) => id.startsWith(`${s.stageId}:`)).map(([,r])=>r.stars));
    assert.deepEqual([...seen].sort(), [1,2,3], s.stageId);
  }
});

test('golden vectors match full plan oracle exactly', () => {
  const golden = fixture('game0009_golden_tests_v0.9.json');
  assert.equal(golden.namedVectors.length, 64);
  assert.equal(Object.keys(golden.perStageCounts).length, 16);
  for (const g of golden.namedVectors) {
    const found = expected.cases.find(c => c.stageId === g.stageId && c.plan.join(',') === g.plan.join(','));
    assert.ok(found, g.id);
    assert.deepEqual(g.expected, found.expected, g.id);
  }
  assert.equal(golden.totals.plannedCases, 960);
  assert.equal(golden.totals.star3DistinctExecutedSequences, 20);
});

test('every second-level hint starts one verified 3-star winning plan', () => {
  for (const s of manifest.stages) {
    assert.equal(s.hints.level2.type,'firstCard');
    const hasWitness = expected.cases.some(c => c.stageId === s.stageId && c.expected.stars === 3 && c.expected.executed[0] === s.hints.level2.cardId);
    assert.ok(hasWitness, `${s.stageId} has invalid hint`);
  }
});

test('frozen edge and storage test catalogs have expected cardinality', () => {
  const edge=fixture('game0009_edge_expected_v0.9.json');
  const storage=fixture('game0009_storage_acceptance_v0.9.json');
  assert.equal(edge.cases.length,14);
  assert.equal(storage.cases.length,27);
  assert.equal(new Set(edge.cases.map(x=>x.testId)).size,14);
  assert.equal(new Set(storage.cases.map(x=>x.id)).size,27);
});
