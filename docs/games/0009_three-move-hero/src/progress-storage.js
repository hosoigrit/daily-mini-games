import { canonicalRuleset, createRulesetRegistry } from './ruleset-fingerprint.js';
import { browserDependency, createSettingsStorage, exactFields, GAME_ID, validPreferences } from './settings-storage.js';

export const PROGRESS_KEY = 'daily-mini-games:0009:progress:v2';
export const LEGACY_KEY = 'daily-mini-games:0009:v1';
export const PROGRESS_LOCK = PROGRESS_KEY;
export const LEGACY_FINGERPRINT = 'f2dcadaca004693a4c186c30f55513f6300437953885486aa343a4492dff11c6';
const LEGACY_LABEL = 'design-v0.7.0 historical';
const idPattern = /^(main|extra)-0[1-8](?![\s\S])/;
const fingerprintPattern = /^[a-f0-9]{64}(?![\s\S])/;
const defaultRegistry = createRulesetRegistry();
const starFields = ['maxStars', 'bestNoHintStars'];
const blankStars = () => ({ maxStars: 0, bestNoHintStars: 0 });
const emptyProgress = () => ({ saveSchemaVersion: 2, gameId: GAME_ID, revision: 0, rulesets: {} });
const state = (status, reason) => ({ status, ...(reason ? { reason } : {}) });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const labelValid = value => typeof value === 'string' && [...value].length >= 1 && [...value].length <= 80;
const dominates = (actual, requested) => actual?.maxStars >= requested.maxStars &&
  actual?.bestNoHintStars >= requested.bestNoHintStars;

function validStars(record, legacy = false) {
  return exactFields(record, legacy ? [...starFields, 'clearCount'] : starFields) &&
    Number.isInteger(record.maxStars) && record.maxStars >= 1 && record.maxStars <= 3 &&
    Number.isInteger(record.bestNoHintStars) && record.bestNoHintStars >= 0 &&
    record.bestNoHintStars <= record.maxStars &&
    (!legacy || (Number.isInteger(record.clearCount) && record.clearCount >= 1));
}

function validProgress(progress, legacy = false) {
  return object(progress) && Object.entries(progress).every(([id, record]) =>
    idPattern.test(id) && validStars(record, legacy));
}

function parse(raw) {
  try { return JSON.parse(raw); } catch { return undefined; }
}

function readLegacy(raw) {
  const data = parse(raw);
  if (!exactFields(data, ['saveSchemaVersion', 'gameId', 'rulesetVersion', 'progress', 'settings']) ||
      data.saveSchemaVersion !== 1 || data.gameId !== GAME_ID || data.rulesetVersion !== '0.7.0' ||
      !validProgress(data.progress, true) || !validPreferences(data.settings)) return undefined;
  return {
    progress: Object.fromEntries(Object.entries(data.progress).map(([id, { maxStars, bestNoHintStars }]) =>
      [id, { maxStars, bestNoHintStars }])),
    settings: data.settings,
  };
}

function merge(data, fingerprint, label, progress) {
  const ruleset = data.rulesets[fingerprint];
  const prior = ruleset?.progress ?? {};
  if (Object.entries(progress).every(([id, stars]) => dominates(prior[id], stars))) return data;
  const merged = { ...prior };
  for (const [id, stars] of Object.entries(progress)) {
    merged[id] = {
      maxStars: Math.max(prior[id]?.maxStars ?? 0, stars.maxStars),
      bestNoHintStars: Math.max(prior[id]?.bestNoHintStars ?? 0, stars.bestNoHintStars),
    };
  }
  return {
    ...data,
    rulesets: { ...data.rulesets, [fingerprint]: { label: ruleset?.label ?? label, progress: merged } },
  };
}

function includesProgress(actual, expected) {
  return Object.entries(expected.rulesets).every(([fp, { progress }]) =>
    Object.entries(progress).every(([id, stars]) => dominates(actual.rulesets[fp]?.progress[id], stars)));
}

export async function createProgressStorage({
  manifest,
  label = 'design-v0.9.0',
  storage = browserDependency(() => globalThis.localStorage),
  locks = browserDependency(() => globalThis.navigator?.locks),
  registry = defaultRegistry,
}) {
  if (!labelValid(label)) throw new TypeError('Invalid ruleset label');
  const fingerprint = await registry.register(canonicalRuleset(manifest));
  const stages = manifest.stages.map(({ stageId, unlockAfter }) => ({ stageId, unlockAfter }));
  const stageIds = new Set(stages.map(stage => stage.stageId));
  const confirmations = new WeakMap();
  let pending;

  const collision = fp => registry.hasCollision(fp);
  const currentCollision = () => !fingerprintPattern.test(fingerprint) ||
    fingerprint === LEGACY_FINGERPRINT || collision(fingerprint);

  function inspect(raw) {
    if (currentCollision()) return state('blocked', 'fingerprint_collision');
    if (raw === null) return { status: 'empty', data: emptyProgress() };
    const data = parse(raw);
    if (!exactFields(data, ['saveSchemaVersion', 'gameId', 'revision', 'rulesets']) ||
        data.gameId !== GAME_ID || data.saveSchemaVersion !== 2 ||
        !Number.isSafeInteger(data.revision) || data.revision < 0 || !object(data.rulesets)) {
      return state('blocked', 'invalid_save');
    }
    for (const [fp, ruleset] of Object.entries(data.rulesets)) {
      if (collision(fp)) return state('blocked', 'fingerprint_collision');
      if (!fingerprintPattern.test(fp) || !exactFields(ruleset, ['label', 'progress']) ||
          !labelValid(ruleset.label) || !validProgress(ruleset.progress)) {
        return state('blocked', 'invalid_records');
      }
    }
    return { status: 'saved', data };
  }

  function load() {
    try { return inspect(storage.getItem(PROGRESS_KEY)); }
    catch { return state('not_saved', 'read_failed'); }
  }

  function stageProgress(data = emptyProgress()) {
    const cleared = new Set(Object.values(data.rulesets).flatMap(({ progress }) => Object.keys(progress)));
    const current = data.rulesets[fingerprint]?.progress ?? {};
    return stages.map(({ stageId, unlockAfter }) => ({
      stageId, unlocked: stageId === 'main-01' || cleared.has(unlockAfter),
      ...(current[stageId] ?? blankStars()),
    }));
  }

  async function locked(action, signal, retry = false) {
    const unavailable = reason => state(retry ? 'unverified' : 'not_saved', reason);
    if (typeof locks?.request !== 'function') return unavailable('locks_unavailable');
    if (signal?.aborted) return unavailable('cancelled');
    try {
      return await locks.request(PROGRESS_LOCK, { mode: 'exclusive', ...(signal ? { signal } : {}) },
        lock => lock && !signal?.aborted ? action() : unavailable('lock_unavailable'));
    } catch {
      return unavailable(signal?.aborted ? 'cancelled' : 'lock_failed');
    }
  }

  function backup(key, raw) {
    if (raw === null) return true;
    try {
      // Never replace a backup of different bytes.
      for (let index = 0; ; index++) {
        const target = `${key}:backup:${index}`;
        const existing = storage.getItem(target);
        if (existing === raw) return true;
        if (existing !== null) continue;
        storage.setItem(target, raw);
        return storage.getItem(target) === raw;
      }
    } catch { return false; }
  }

  function write(data, operation) {
    if (data.revision >= Number.MAX_SAFE_INTEGER) return state('blocked', 'revision_exhausted');
    const next = { ...data, revision: data.revision + 1 };
    try { storage.setItem(PROGRESS_KEY, JSON.stringify(next)); }
    catch (error) {
      if (['QuotaExceededError', 'SecurityError'].includes(error?.name)) return state('not_saved', 'write_failed');
      pending = operation;
      return state('unverified', 'write_outcome_unknown');
    }
    const checked = load();
    if (checked.data && checked.data.revision >= next.revision && includesProgress(checked.data, next)) {
      return { status: 'saved', data: checked.data };
    }
    pending = operation;
    return state('unverified', 'readback_failed');
  }

  function apply(operation, retry = false) {
    if (pending && !retry) return state('unverified', 'recheck_required');
    let raw;
    try { raw = storage.getItem(PROGRESS_KEY); }
    catch { return state(retry ? 'unverified' : 'not_saved', 'read_failed'); }
    const latest = inspect(raw);
    const result = operation(latest, raw, retry);
    if (result.status !== 'unverified' && retry) pending = undefined;
    return result;
  }

  async function save(result, { signal } = {}) {
    const { stageId, stars, usedHint } = result ?? {};
    if (!stageIds.has(stageId) || !idPattern.test(stageId) || typeof usedHint !== 'boolean' ||
        !Number.isInteger(stars) || stars < 1 || stars > 3) return state('blocked', 'invalid_result');
    const progress = { [stageId]: { maxStars: stars, bestNoHintStars: usedHint ? 0 : stars } };
    function operation(latest) {
      if (!latest.data) return latest;
      const next = merge(latest.data, fingerprint, label, progress);
      return next === latest.data ? { status: 'saved', data: next } : write(next, operation);
    }
    return locked(() => apply(operation), signal);
  }

  function recheck({ signal } = {}) {
    if (!pending) return state('not_saved', 'no_pending_save');
    return locked(() => pending ? apply(pending, true) : state('not_saved', 'no_pending_save'), signal, true);
  }

  function previewRecovery() {
    let raw;
    try { raw = storage.getItem(PROGRESS_KEY); }
    catch { return state('not_saved', 'read_failed'); }
    const checked = inspect(raw);
    if (checked.status !== 'blocked') return state('blocked', 'recovery_not_needed');
    const data = parse(raw);
    if (checked.reason === 'fingerprint_collision' ||
        (object(data) && (data.saveSchemaVersion !== 2 || data.gameId !== GAME_ID))) {
      return { ...checked, exportRaw: raw };
    }
    const candidate = emptyProgress();
    if (Number.isSafeInteger(data?.revision) && data.revision >= 0) candidate.revision = data.revision;
    for (const [fp, value] of Object.entries(object(data?.rulesets) ? data.rulesets : {})) {
      if (!fingerprintPattern.test(fp) || !labelValid(value?.label) || !object(value?.progress)) continue;
      if (collision(fp)) return { status: 'blocked', reason: 'fingerprint_collision', exportRaw: raw };
      const progress = Object.fromEntries(Object.entries(value.progress).filter(([id, record]) =>
        idPattern.test(id) && validStars(record)));
      candidate.rulesets[fp] = { label: value.label, progress };
    }
    const preview = { status: 'preview', exportRaw: raw, candidate: structuredClone(candidate) };
    confirmations.set(preview, { type: 'recovery', raw, candidate });
    return preview;
  }

  function recover(preview, { confirmed, signal } = {}) {
    const proposal = confirmations.get(preview);
    if (confirmed !== true || proposal?.type !== 'recovery') return state('not_saved', 'confirmation_required');
    function operation(latest, raw, retry) {
      if (retry && latest.status === 'saved' && latest.data.revision > proposal.candidate.revision &&
          includesProgress(latest.data, proposal.candidate)) return latest;
      if (raw !== proposal.raw || latest.reason === 'fingerprint_collision') return state('blocked', 'source_changed');
      if (!backup(PROGRESS_KEY, raw)) return state('not_saved', 'backup_failed');
      return write(proposal.candidate, operation);
    }
    return locked(() => apply(operation), signal);
  }

  function previewMigration() {
    try {
      const raw = storage.getItem(LEGACY_KEY);
      if (raw === null) return state('not_saved', 'legacy_missing');
      const legacy = readLegacy(raw);
      if (!legacy) return { ...state('blocked', 'invalid_legacy'), exportRaw: raw };
      const preview = { status: 'preview', historicalFingerprint: LEGACY_FINGERPRINT, ...structuredClone(legacy) };
      confirmations.set(preview, { type: 'migration', raw, legacy });
      return preview;
    } catch { return state('not_saved', 'read_failed'); }
  }

  function migrate(preview, { confirmed, signal } = {}) {
    const proposal = confirmations.get(preview);
    if (confirmed !== true || proposal?.type !== 'migration') return state('not_saved', 'confirmation_required');
    function operation(latest, raw, retry) {
      if (!latest.data) return latest;
      try {
        if (storage.getItem(LEGACY_KEY) !== proposal.raw) return state('blocked', 'source_changed');
      } catch { return state(retry ? 'unverified' : 'not_saved', 'read_failed'); }
      if (collision(LEGACY_FINGERPRINT)) return state('blocked', 'fingerprint_collision');
      const next = merge(latest.data, LEGACY_FINGERPRINT, LEGACY_LABEL, proposal.legacy.progress);
      if (next === latest.data) return { status: 'saved', data: next };
      if (!backup(LEGACY_KEY, proposal.raw) || !backup(PROGRESS_KEY, raw)) return state('not_saved', 'backup_failed');
      return write(next, operation);
    }
    return locked(() => apply(operation), signal);
  }

  function migrateSettings(preview, { confirmed, signal } = {}) {
    const proposal = confirmations.get(preview);
    if (confirmed !== true || proposal?.type !== 'migration') return state('not_saved', 'confirmation_required');
    return locked(() => {
      try {
        if (storage.getItem(LEGACY_KEY) !== proposal.raw) return state('blocked', 'source_changed');
      } catch { return state('not_saved', 'read_failed'); }
      return createSettingsStorage(storage).save(proposal.legacy.settings, { onlyIfAbsent: true });
    }, signal);
  }

  return { fingerprint, load, stageProgress, save, recheck, previewRecovery, recover, previewMigration, migrate, migrateSettings };
}
