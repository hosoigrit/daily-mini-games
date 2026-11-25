import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProgressStorage, LEGACY_FINGERPRINT, LEGACY_KEY, PROGRESS_KEY, PROGRESS_LOCK } from '../src/progress-storage.js';
import { canonicalRuleset, createRulesetRegistry, fingerprintRuleset } from '../src/ruleset-fingerprint.js';
import { createSettingsStorage, SETTINGS_KEY } from '../src/settings-storage.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixture = name => read(`./fixtures/game0009_${name}.json`);
const manifest = JSON.parse(read('../data/game0009_stage_manifest_v0.9.json'));
const vector = JSON.parse(fixture('ruleset_fingerprint_vectors_v1'));
const FP = vector.canonicalRulesetFingerprint;
const legacyRaw = fixture('save_example_v0.7');
const old = JSON.parse(legacyRaw);
const prefs = { reducedMotion: true, battleSpeed: 'fast' };
const stars = (maxStars, bestNoHintStars = maxStars) => ({ maxStars, bestNoHintStars });
const rules = progress => ({ label: 'test', progress });
const progress = (rulesets = {}, revision = 1) => ({ gameId: manifest.gameId, saveSchemaVersion: 2, revision, rulesets });
const result = (stars = 3, stageId = 'main-01', usedHint = false) => ({ stars, stageId, usedHint });
const confirmed = { confirmed: true };
const ok = (value, status = 'saved') => assert.equal(value.status, status);
const assertRecord = (store, expected, stageId = 'main-01', fp = FP) =>
  assert.deepEqual(store.load().data.rulesets[fp].progress[stageId], expected);

function fakeStorage() {
  const values = new Map();
  const writes = [];
  return {
    values, writes,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, raw) { writes.push(key); values.set(key, raw); },
  };
}

function fakeLocks() {
  let tail = Promise.resolve();
  return {
    active: false,
    request(name, { mode, signal }, work) {
      assert.equal(name, PROGRESS_LOCK);
      assert.equal(mode, 'exclusive');
      let abort;
      const job = tail.then(async () => {
        if (signal?.aborted) throw signal.reason;
        signal?.removeEventListener('abort', abort);
        this.active = true;
        try { return await work({ name }); } finally { this.active = false; }
      });
      tail = job.catch(() => {});
      if (!signal) return job;
      const cancel = new Promise((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
      });
      return Promise.race([job, cancel]).finally(() => signal.removeEventListener('abort', abort));
    },
  };
}

async function setup({ value, legacy, noLocks = false, registry, stageManifest = manifest } = {}) {
  const storage = fakeStorage();
  const locks = fakeLocks();
  if (value !== undefined) storage.values.set(PROGRESS_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  if (legacy !== undefined) storage.values.set(LEGACY_KEY, legacy);
  const set = storage.setItem.bind(storage);
  storage.setItem = (key, raw) => {
    if (key === PROGRESS_KEY || key.includes(':backup:')) assert.equal(locks.active, true);
    set(key, raw);
  };
  const attach = () => createProgressStorage({ manifest: stageManifest, storage, locks: noLocks ? {} : locks, registry });
  return { storage, locks, attach, store: await attach() };
}

const legacySetup = options => setup({ legacy: legacyRaw, ...options });

async function assertMigration(store, storage) {
  const preview = store.previewMigration();
  ok(preview, 'preview');
  ok(await store.migrate(preview, confirmed));
  assertRecord(store, stars(3, 2), 'main-01', LEGACY_FINGERPRINT);
  assertRecord(store, stars(1, 0), 'main-02', LEGACY_FINGERPRINT);
  assert.ok(!storage.getItem(PROGRESS_KEY).includes('clearCount'));
  assert.equal(storage.getItem(LEGACY_KEY), legacyRaw);
  assert.equal(store.load().data.rulesets[FP]?.progress['main-02'], undefined);
}

async function corruptBlocked(value) {
  const { store, storage } = await setup({ value });
  const before = storage.getItem(PROGRESS_KEY);
  ok(store.load(), 'blocked');
  ok(await store.save(result()), 'blocked');
  assert.equal(storage.getItem(PROGRESS_KEY), before);
  assert.deepEqual(storage.writes, []);
  return { store, storage };
}

async function uncertain() {
  const env = await setup();
  const { store, storage } = env;
  const get = storage.getItem.bind(storage);
  storage.getItem = key => {
    if (key === PROGRESS_KEY && storage.writes.length === 1) throw new Error('readback');
    return get(key);
  };
  ok(await store.save(result()), 'unverified');
  storage.getItem = get;
  return env;
}

test('SAVE-01 initial startup unlocks only main-01', async () => {
  const { store, storage } = await setup();
  const initial = store.load();
  ok(initial, 'empty');
  assert.deepEqual(initial.data.rulesets, {});
  assert.deepEqual(store.stageProgress(initial.data).filter(s => s.unlocked).map(s => s.stageId), ['main-01']);
  assert.deepEqual(storage.writes, []);
});
test('SAVE-02 replay cannot reduce current or no-hint stars', async () => {
  const { store } = await setup();
  ok(await store.save(result()));
  ok(await store.save(result(1)));
  assertRecord(store, stars(3));
});
test('SAVE-03 historical stars are separate and still unlock stages', async () => {
  const { store } = await setup({ value: progress({ [LEGACY_FINGERPRINT]: rules({ 'main-01': stars(3) }) }) });
  const { data } = store.load();
  assert.deepEqual(store.stageProgress(data)[0], { stageId: 'main-01', unlocked: true, ...stars(0) });
  assert.equal(store.stageProgress(data)[1].unlocked, true);
  assertRecord(store, stars(3), 'main-01', LEGACY_FINGERPRINT);
});
test('SAVE-04 cosmetic changes keep stars in the current ruleset', async () => {
  const changed = structuredClone(manifest);
  changed.cardCatalog.slash.description = '別の説明';
  changed.stages[0].hints.level1 = '別のヒント';
  const { store } = await setup({ stageManifest: changed, value: progress({ [FP]: rules({ 'main-01': stars(3) }) }) });
  assert.equal(store.fingerprint, FP);
  assert.equal(store.stageProgress(store.load().data)[0].maxStars, 3);
});
test('SAVE-05 changing a star condition separates records', async () => {
  const changed = structuredClone(manifest);
  changed.stages.find(s => s.stageId === 'extra-01').rating.star3.minHp++;
  const { store } = await setup({ stageManifest: changed, value: progress({ [FP]: rules({ 'extra-01': stars(3) }) }) });
  assert.notEqual(store.fingerprint, FP);
  assert.equal(store.stageProgress(store.load().data).find(s => s.stageId === 'extra-01').maxStars, 0);
  assertRecord(store, stars(3), 'extra-01');
});
test('SAVE-06 explicitly migrates the approved synthetic v1 source', async () => {
  const { store, storage } = await legacySetup({ value: progress({ [FP]: rules({ 'main-01': stars(1) }) }) });
  await assertMigration(store, storage);
  assertRecord(store, stars(1));
  assert.equal(storage.getItem(SETTINGS_KEY), null);
});
test('SAVE-07 future schema is read-only', async () => {
  const { store } = await corruptBlocked({ ...progress(), saveSchemaVersion: 3 });
  ok(store.previewRecovery(), 'blocked');
});
test('SAVE-08 inconsistent stars only offer an explicit recovery', async () => {
  const { store } = await corruptBlocked(progress({ [FP]: rules({ 'main-01': stars(2, 3) }) }));
  const preview = store.previewRecovery();
  ok(preview, 'preview');
  assert.deepEqual(preview.candidate.rulesets[FP].progress, {});
  ok(await store.recover(preview), 'not_saved');
});
test('SAVE-09 malformed JSON can be exported before confirmed recovery', async () => {
  const { store, storage } = await corruptBlocked('{bad');
  const preview = store.previewRecovery();
  assert.equal(preview.exportRaw, '{bad');
  ok(await store.recover(preview), 'not_saved');
  assert.equal(storage.getItem(PROGRESS_KEY), '{bad');
  ok(await store.recover(preview, confirmed));
  assert.equal(storage.getItem(`${PROGRESS_KEY}:backup:0`), '{bad');
});
test('SAVE-10 partial recovery previews two records and backs up before writing', async () => {
  const { store, storage } = await corruptBlocked(progress({ [FP]: rules({
    'main-01': stars(2), 'main-02': stars(3), 'main-03': stars(0),
  }) }));
  const raw = storage.getItem(PROGRESS_KEY);
  const preview = store.previewRecovery();
  assert.deepEqual(Object.keys(preview.candidate.rulesets[FP].progress), ['main-01', 'main-02']);
  ok(await store.recover(preview, confirmed));
  assert.deepEqual(storage.writes, [`${PROGRESS_KEY}:backup:0`, PROGRESS_KEY]);
  assert.equal(storage.getItem(`${PROGRESS_KEY}:backup:0`), raw);
  assertRecord(store, stars(3), 'main-02');
});
test('SAVE-11 backup failure preserves original bytes and export', async () => {
  const { store, storage } = await corruptBlocked('bad');
  const preview = store.previewRecovery();
  storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  assert.equal((await store.recover(preview, confirmed)).reason, 'backup_failed');
  assert.equal(storage.getItem(PROGRESS_KEY), preview.exportRaw);
});
test('SAVE-12 simultaneous same-stage saves merge maxima', async () => {
  const { store, attach } = await setup();
  const tab = await attach();
  (await Promise.all([store.save(result()), tab.save(result(2, 'main-01', true))])).forEach(x => ok(x));
  assertRecord(store, stars(3));
});
test('SAVE-13 separate tabs retain both stages and old history despite stale reads', async () => {
  const { store, attach } = await setup({ value: progress({ [LEGACY_FINGERPRINT]: rules({ 'main-08': stars(3) }) }, 7) });
  const tab = await attach();
  assert.equal(tab.load().data.revision, 7);
  (await Promise.all([store.save(result(2, 'main-02')), tab.save(result(3, 'main-03'))])).forEach(x => ok(x));
  assert.equal(tab.load().data.revision, 9);
  assertRecord(tab, stars(2), 'main-02');
  assertRecord(tab, stars(3), 'main-03');
  assertRecord(tab, stars(3), 'main-08', LEGACY_FINGERPRINT);
});
test('SAVE-14 retry is idempotent without clearCount', async () => {
  const { store, storage } = await setup();
  ok(await store.save(result()));
  const before = storage.getItem(PROGRESS_KEY);
  ok(await store.save(result()));
  assert.equal(storage.getItem(PROGRESS_KEY), before);
  assert.deepEqual(storage.writes, [PROGRESS_KEY]);
  assert.ok(!before.includes('clearCount'));
});
test('SAVE-15 unsupported Web Locks returns a memory-mode outcome without writing', async () => {
  const { store, storage } = await setup({ noLocks: true });
  assert.deepEqual(await store.save(result()), { status: 'not_saved', reason: 'locks_unavailable' });
  assert.deepEqual(storage.writes, []);
  ok(store.load(), 'empty');
});
test('SAVE-16 cancelling a queued request never writes', async () => {
  const { store, storage, locks } = await setup();
  let release;
  const hold = locks.request(PROGRESS_LOCK, { mode: 'exclusive' }, () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const controller = new AbortController();
  const waiting = store.save(result(), { signal: controller.signal });
  controller.abort();
  assert.equal((await waiting).reason, 'cancelled');
  release();
  await hold;
  await locks.request(PROGRESS_LOCK, { mode: 'exclusive' }, () => {});
  assert.deepEqual(storage.writes, []);
});
test('SAVE-17 quota and security errors do not claim success or erase prior stars', async () => {
  const { store, storage } = await setup({ value: progress({ [FP]: rules({ 'main-01': stars(2) }) }) });
  const before = storage.getItem(PROGRESS_KEY);
  for (const name of ['QuotaExceededError', 'SecurityError']) {
    storage.setItem = () => { throw new DOMException('write rejected', name); };
    ok(await store.save(result()), 'not_saved');
    assert.equal(storage.getItem(PROGRESS_KEY), before);
  }
});
test('SAVE-18 reload restores stars without any in-progress battle data', async () => {
  const { store, storage, attach } = await setup();
  ok(await store.save({ ...result(), heroHp: 1, plan: ['slash'], log: [{}] }));
  const reloaded = await attach();
  assertRecord(reloaded, stars(3));
  assert.equal(reloaded.stageProgress(reloaded.load().data)[0].stageId, 'main-01');
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(PROGRESS_KEY)).rulesets[FP].progress['main-01']), ['maxStars', 'bestNoHintStars']);
});
test('SAVE-19 old main-08 completion unlocks extra-01 without current stars', async () => {
  const { store } = await setup({ value: progress({ [LEGACY_FINGERPRINT]: rules({ 'main-08': stars(3) }) }) });
  assert.deepEqual(store.stageProgress(store.load().data).find(s => s.stageId === 'extra-01'),
    { stageId: 'extra-01', unlocked: true, ...stars(0) });
});
test('SAVE-20 invalid stage ID cannot unlock any stage', async () => {
  const { store } = await corruptBlocked(progress({ [FP]: rules({ 'extra-09': stars(3) }) }));
  assert.deepEqual(store.previewRecovery().candidate.rulesets[FP].progress, {});
  assert.equal(store.stageProgress().filter(s => s.unlocked).length, 1);
});
test('SAVE-21 conflicting ruleset bindings block writes', async () => {
  const registry = createRulesetRegistry(async () => FP);
  const { store, storage } = await setup({ registry });
  ok(await store.save(result(1)));
  const before = storage.getItem(PROGRESS_KEY);
  await registry.register('different rules');
  ok(await store.save(result()), 'blocked');
  assert.equal(storage.getItem(PROGRESS_KEY), before);
});
test('SAVE-22 feature detection and refused lock protect mock storage; devices deferred', async () => {
  for (const locks of [null, {}, { request: async () => { throw Error('denied'); } }]) {
    const storage = fakeStorage();
    const store = await createProgressStorage({ manifest, storage, locks });
    ok(await store.save(result()), 'not_saved');
    assert.deepEqual(storage.writes, []);
  }
});
test('SAVE-23 display settings are last-write-wins and separate from progress', async () => {
  const { store, storage } = await setup();
  ok(await store.save(result()));
  const before = storage.getItem(PROGRESS_KEY);
  ok(createSettingsStorage(storage).save(prefs));
  ok(createSettingsStorage(storage).save({ reducedMotion: false, battleSpeed: 'instant' }));
  assert.equal(createSettingsStorage(storage).load().preferences.battleSpeed, 'instant');
  assert.equal(storage.getItem(PROGRESS_KEY), before);
});
test('SAVE-24 migration uses a synthetic fixture only and does not auto-detect into v2', async () => {
  const { store, storage } = await legacySetup();
  ok(store.load(), 'empty');
  ok(store.previewMigration(), 'preview');
  assert.equal(storage.writes.length, 0);
  await assertMigration(store, storage);
});
test('SAVE-25 names, explanations and hints preserve canonical bytes', async () => {
  const changed = structuredClone(manifest);
  changed.displayName = '表示';
  changed.stages[0].title = '題名';
  changed.stages[0].hints.level2.cardId = 'heal';
  changed.cardCatalog.slash.name = '表示用';
  assert.equal(canonicalRuleset(changed), canonicalRuleset(manifest));
  assert.equal(await fingerprintRuleset(canonicalRuleset(changed)), vector.sameFingerprintAfterPresentationOrHintChange);
});
test('SAVE-26 changed HP yields frozen divergence and preserves old record', async () => {
  const changed = structuredClone(manifest);
  changed.stages.find(s => s.stageId === 'extra-01').enemyMaxHp++;
  const { store } = await setup({ stageManifest: changed, value: progress({ [FP]: rules({ 'main-01': stars(3) }) }) });
  assert.equal(store.fingerprint, vector.differentFingerprintAfterFirstStageAlphabeticallyEnemyHpPlus1);
  ok(await store.save(result(1)));
  assertRecord(store, stars(1), 'main-01', store.fingerprint);
  assertRecord(store, stars(3));
});
test('SAVE-27 canonical payload bytes and all fingerprint-bearing expectations agree', async () => {
  const payload = fixture('ruleset_canonical_payload_v1');
  assert.equal(payload.endsWith('\n'), true);
  assert.equal(canonicalRuleset(manifest), payload.slice(0, -1));
  assert.equal(await fingerprintRuleset(payload.slice(0, -1)), FP);
  assert.equal(FP, '56a8502f8ac2b90597bedf90b940ff5536b6cf231f541a5b1e6c87ff21bfc620');
  for (const name of ['full_960_expected_v0.9', 'golden_tests_v0.9']) {
    assert.equal(JSON.parse(fixture(name)).rulesFingerprint, FP);
  }
});
test('E3-01 double save writes once without clearCount', async () => {
  const { store, storage } = await setup();
  (await Promise.all([store.save(result()), store.save(result())])).forEach(x => ok(x));
  assert.equal(store.load().data.revision, 1);
  assert.deepEqual(storage.writes, [PROGRESS_KEY]);
  assert.ok(!storage.getItem(PROGRESS_KEY).includes('clearCount'));
});
test('E3-02 late low and hinted wins cannot lower either star field', async () => {
  const { store, storage } = await setup();
  ok(await store.save(result(2)));
  ok(await store.save(result(3, 'main-01', true)));
  ok(await store.save(result(1)));
  assertRecord(store, stars(3, 2));
  assert.ok(!storage.getItem(PROGRESS_KEY).includes('clearCount'));
});
test('E3-03 frozen legacy sample is preview-only until explicitly confirmed', async () => {
  const schema = JSON.parse(fixture('save_schema_v0.7'));
  const { store, storage } = await legacySetup();
  assert.deepEqual(Object.keys(old).sort(), [...schema.required].sort());
  assert.equal(old.saveSchemaVersion, schema.properties.saveSchemaVersion.const);
  const preview = store.previewMigration();
  ok(preview, 'preview');
  assert.deepEqual(preview.progress, { 'main-01': stars(3, 2), 'main-02': stars(1, 0) });
  ok(await store.migrate(preview), 'not_saved');
  ok(await store.migrate({ ...preview }, confirmed), 'not_saved');
  assert.equal(storage.getItem(LEGACY_KEY), legacyRaw);
  assert.deepEqual(storage.writes, []);
});
test('E3-04 confirmed migration writes only historical stars and keeps both sources', async () => {
  const { store, storage } = await legacySetup({ value: progress({ [FP]: rules({ 'main-01': stars(2) }) }) });
  const before = storage.getItem(PROGRESS_KEY);
  await assertMigration(store, storage);
  assertRecord(store, stars(2));
  assert.equal(storage.getItem(`${PROGRESS_KEY}:backup:0`), before);
  assert.equal(storage.getItem(`${LEGACY_KEY}:backup:0`), legacyRaw);
});
test('E3-05 existing v2 stars are never lowered and re-migration does not rewrite', async () => {
  const { store, storage } = await legacySetup({ value: progress({ [LEGACY_FINGERPRINT]: rules({ 'main-02': stars(3) }) }) });
  const preview = store.previewMigration();
  ok(await store.migrate(preview, confirmed));
  assertRecord(store, stars(3), 'main-02', LEGACY_FINGERPRINT);
  const before = storage.getItem(PROGRESS_KEY);
  const writes = storage.writes.length;
  ok(await store.migrate(preview, confirmed));
  assert.equal(storage.getItem(PROGRESS_KEY), before);
  assert.equal(storage.writes.length, writes);
});
test('E3-06 invalid or inaccessible legacy source is protected', async () => {
  for (const raw of ['{bad', ...[
    { ...old, rulesetVersion: '0.8.0' },
    { ...old, saveSchemaVersion: 9 },
    { ...old, progress: { 'main-01': { ...stars(1, 3), clearCount: 2 } } },
  ].map(x => JSON.stringify(x))]) {
    const { store, storage } = await legacySetup({ legacy: raw });
    ok(store.previewMigration(), 'blocked');
    assert.equal(storage.getItem(LEGACY_KEY), raw);
    assert.deepEqual(storage.writes, []);
  }
  const { store, storage } = await legacySetup();
  const preview = store.previewMigration();
  const get = storage.getItem.bind(storage);
  storage.getItem = key => { if (key === LEGACY_KEY) throw Error('read'); return get(key); };
  ok(await store.migrate(preview, confirmed), 'not_saved');
  assert.deepEqual(storage.writes, []);
  storage.getItem = get;
  assert.equal(storage.getItem(LEGACY_KEY), legacyRaw);
});
test('E3-07 migration failures before progress write preserve both main keys', async () => {
  for (const mode of ['no-lock', 'cancel', 'backup', 'quota']) {
    const { store, storage } = await legacySetup({ value: progress(), noLocks: mode === 'no-lock' });
    const preview = store.previewMigration();
    const before = storage.getItem(PROGRESS_KEY);
    const set = storage.setItem.bind(storage);
    const controller = new AbortController();
    if (mode === 'cancel') controller.abort();
    storage.setItem = (key, raw) => {
      if ((mode === 'backup' && key.includes(':backup:')) || (mode === 'quota' && key === PROGRESS_KEY)) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      set(key, raw);
    };
    ok(await store.migrate(preview, { ...confirmed, signal: controller.signal }), 'not_saved');
    assert.equal(storage.getItem(PROGRESS_KEY), before);
    assert.equal(storage.getItem(LEGACY_KEY), legacyRaw);
    assert.ok(!storage.writes.includes(PROGRESS_KEY));
  }
});
test('E3-08 settings consent is separate and existing settings win', async () => {
  const { store, storage } = await legacySetup();
  const preview = store.previewMigration();
  ok(await store.migrate(preview, confirmed));
  ok(await store.migrateSettings(preview), 'not_saved');
  assert.equal(storage.getItem(SETTINGS_KEY), null);
  ok(await store.migrateSettings(preview, confirmed));
  assert.deepEqual(createSettingsStorage(storage).load().preferences, old.settings);
  ok(createSettingsStorage(storage).save(prefs));
  ok(await store.migrateSettings(preview, confirmed));
  assert.deepEqual(createSettingsStorage(storage).load().preferences, prefs);
  assert.equal(storage.getItem(LEGACY_KEY), legacyRaw);
});
test('E3-09 readback uncertainty never reports saved or rolls back', async () => {
  const { storage, store } = await uncertain();
  assert.deepEqual(storage.writes, [PROGRESS_KEY]);
  assertRecord(store, stars(3));
  ok(await store.save(result(1)), 'unverified');
  assert.deepEqual(storage.writes, [PROGRESS_KEY]);
});
test('E3-10 confirmed recheck performs no second write or revision change', async () => {
  const { store, storage } = await uncertain();
  const get = storage.getItem.bind(storage);
  storage.getItem = () => { throw Error('still unreadable'); };
  ok(await store.recheck(), 'unverified');
  storage.getItem = get;
  ok(await store.recheck());
  assert.equal(store.load().data.revision, 1);
  assert.deepEqual(storage.writes, [PROGRESS_KEY]);
});
test('E3-11 recheck merges missing stars with the latest data', async () => {
  const { store, storage } = await uncertain();
  storage.values.set(PROGRESS_KEY, JSON.stringify(progress({ [FP]: rules({
    'main-01': stars(2), 'main-02': stars(3),
  }) }, 4)));
  ok(await store.recheck());
  assertRecord(store, stars(3));
  assertRecord(store, stars(3), 'main-02');
  assert.equal(store.load().data.revision, 5);
  assert.deepEqual(storage.writes, [PROGRESS_KEY, PROGRESS_KEY]);
});
test('E3-12 corrupt and incompatible data block recheck without losing source', async () => {
  for (const raw of ['bad', JSON.stringify({ ...progress(), saveSchemaVersion: 3 })]) {
    const { store, storage } = await uncertain();
    storage.values.set(PROGRESS_KEY, raw);
    ok(await store.recheck(), 'blocked');
    assert.equal(storage.getItem(PROGRESS_KEY), raw);
    assert.deepEqual(storage.writes, [PROGRESS_KEY]);
  }
  const registry = createRulesetRegistry(async () => FP);
  const { store, storage } = await setup({ registry });
  const set = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { set(key, value); throw Error('unknown write outcome'); };
  ok(await store.save(result()), 'unverified');
  const raw = storage.getItem(PROGRESS_KEY);
  await registry.register('conflicting bytes');
  ok(await store.recheck(), 'blocked');
  assert.equal(storage.getItem(PROGRESS_KEY), raw);
  assert.deepEqual(storage.writes, [PROGRESS_KEY]);
});
test('E3-13 newer separate-tab update survives safe verification', async () => {
  const { store, storage, attach } = await uncertain();
  const tab = await attach();
  ok(await tab.save(result(2, 'main-02')));
  ok(await store.recheck());
  assertRecord(store, stars(3));
  assertRecord(store, stars(2), 'main-02');
  assert.equal(store.load().data.revision, 2);
  assert.deepEqual(storage.writes, [PROGRESS_KEY, PROGRESS_KEY]);
});
test('settings do not claim success on post-write readback exception', () => {
  const storage = fakeStorage();
  const get = storage.getItem.bind(storage);
  storage.getItem = key => { if (storage.writes.length) throw Error('readback'); return get(key); };
  ok(createSettingsStorage(storage).save(prefs), 'unverified');
  assert.equal(JSON.parse(storage.values.get(SETTINGS_KEY)).battleSpeed, 'fast');
});
