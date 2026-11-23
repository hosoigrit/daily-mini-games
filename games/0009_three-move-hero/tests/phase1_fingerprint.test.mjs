import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const source = JSON.parse(readFileSync(new URL('../data/game0009_stage_manifest_v0.9.json', import.meta.url), 'utf8'));
const vectors = fixture('game0009_ruleset_fingerprint_vectors_v1.json');
const reference = readFileSync(new URL('./fixtures/game0009_ruleset_canonical_payload_v1.json', import.meta.url));
const sha256 = input => createHash('sha256').update(input).digest('hex');
const sortKeys = value => Array.isArray(value) ? value.map(sortKeys) :
  value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])])) : value;
function buildPayload(m) {
  const withoutPresentation = catalog => Object.fromEntries(Object.entries(catalog).map(([id, def]) => [id, Object.fromEntries(Object.entries(def).filter(([k]) => !['name', 'description'].includes(k)))]));
  const fields=['stageId','group','order','heroMaxHp','enemyMaxHp','hand','enemyActions','passives','rating','unlockAfter'];
  return {
    cardCatalog: withoutPresentation(m.cardCatalog),
    combatRules: m.combatRules,
    enemyActionCatalog: withoutPresentation(m.enemyActionCatalog),
    passiveCatalog: withoutPresentation(m.passiveCatalog),
    progression: m.progression,
    stages: [...m.stages].sort((a,b)=>a.stageId.localeCompare(b.stageId,'en')).map(s => Object.fromEntries(fields.filter(k => Object.hasOwn(s,k)).map(k => [k,s[k]])))
  };
}
function fingerprint(m){ const payload = JSON.stringify(sortKeys(buildPayload(m))); return {text:payload,hash:sha256(Buffer.from(payload,'utf8'))}; }

test('frozen canonical file has correct exact digest and byte length', () => {
  assert.equal(reference.at(-1), 10, 'reference fixture expected one terminal LF');
  const canonical=reference.subarray(0,-1);
  assert.equal(canonical.byteLength, 7658);
  assert.equal(sha256(canonical), vectors.canonicalRulesetFingerprint);
});

test('manifest produces the same bytes and digest as independently frozen reference', () => {
  const result=fingerprint(source);
  assert.equal(Buffer.byteLength(result.text,'utf8'),vectors.canonicalPayloadBytesWithoutTerminalNewline);
  assert.equal(result.text,reference.subarray(0,-1).toString('utf8'));
  assert.equal(result.hash,vectors.canonicalRulesetFingerprint);
});

test('presentation and hint changes do not change fingerprint', () => {
  const changed=structuredClone(source);
  changed.displayName='別の表示名';
  changed.stages[0].title='テスト用ステージ名';
  changed.stages[0].hints.level1='説明変更のみ';
  changed.stages[0].tutorial='チュートリアルだけの変更';
  assert.equal(fingerprint(changed).hash, vectors.sameFingerprintAfterPresentationOrHintChange);
});

test('first stage enemy HP change matches frozen divergence vector', () => {
  const changed=structuredClone(source);
  changed.stages.find(s=>s.stageId==='extra-01').enemyMaxHp += 1;
  assert.equal(fingerprint(changed).hash,vectors.differentFingerprintAfterFirstStageAlphabeticallyEnemyHpPlus1);
});
