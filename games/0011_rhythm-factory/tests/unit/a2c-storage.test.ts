import { describe, expect, it, vi } from 'vitest';
import type { FinalResult, Result, SaveDataV1, WriterLease } from '../../src/contracts/interface_contracts';
import { createSaveRules } from '../../src/domain/save-data';
import { createStorageCoordinator, saveStorageKey } from '../../src/infrastructure/storage-coordinator';
import { createWriterLock, writerLockName } from '../../src/infrastructure/writer-lock';
import { clearResult, failedResult, storageRecordedAt, storageTrialEntry } from '../fixtures/a2c-storage-data';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.messageKey}`);
  return result.value;
}

function expectError(result: Result<unknown>, code: string): void {
  expect(result).toMatchObject({ ok: false, error: { code } });
}

function lockHub() {
  let holding = false;
  const request = vi.fn(async (name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
    if (holding) return callback(null);
    holding = true;
    try {
      return await callback({ name, mode: options.mode ?? 'exclusive' });
    } finally {
      holding = false;
    }
  });
  const locks = { request } as unknown as Pick<LockManager, 'request'>;
  return { request, locks };
}

function memoryStorage() {
  const contents = new Map<string, string>([['outside-game', 'sentinel']]);
  const next = { writeFails: false, readbackFails: false, readFails: false };
  const storage = {
    getItem: vi.fn((key: string) => {
      if (next.readFails) {
        next.readFails = false;
        throw new DOMException('read denied', 'SecurityError');
      }
      return contents.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, raw: string) => {
      if (next.writeFails) {
        next.writeFails = false;
        throw new DOMException('write denied', 'QuotaExceededError');
      }
      contents.set(key, raw);
      if (next.readbackFails) {
        next.readbackFails = false;
        next.readFails = true;
      }
    }),
  };
  const currentSave = () => JSON.parse(contents.get(saveStorageKey) ?? 'null') as SaveDataV1 | null;
  return { storage, contents, next, currentSave };
}

function environment(available = true, digest?: Pick<SubtleCrypto, 'digest'>) {
  const memory = memoryStorage();
  const hub = lockHub();
  const lock = createWriterLock({ locks: available ? hub.locks : undefined, ownerId: 'tab-a' });
  const rules = createSaveRules([storageTrialEntry]);
  let epoch = 0;
  const state = createStorageCoordinator({ storage: memory.storage, lock, rules, createEpoch: () => `epoch-${++epoch}`,
    ...(digest === undefined ? {} : { digest }) });
  async function acquire() {
    const started = await state.pageShow();
    value(started.save);
    return value(started.lease);
  }
  const prepare = async (sealed: FinalResult, lease: WriterLease) =>
    value(await state.prepareCommit(sealed, value(state.beginFormal(sealed.sessionId, lease)), storageRecordedAt));
  return { state, ...memory, ...hub, lock, rules, acquire, prepare };
}

describe('Stage A-2c writer lease IF-17', () => {
  it('uses the fixed exclusive ifAvailable lock and releases actual ownership before handoff', async () => {
    const hub = lockHub();
    const a = createWriterLock({ locks: hub.locks, ownerId: 'a' });
    const b = createWriterLock({ locks: hub.locks, ownerId: 'b' });
    const lease = value(await a.acquireWriterLock());
    expect(hub.request.mock.calls[0]?.slice(0, 2)).toEqual([writerLockName, { mode: 'exclusive', ifAvailable: true }]);
    expect(Object.isFrozen(lease)).toBe(true);
    expect(a.isCurrent({ ...lease })).toBe(false);
    expectError(await b.acquireWriterLock(), 'ERR-009');
    expectError(await a.acquireWriterLock(), 'ERR-009');
    expect(b.currentLease()).toBeNull();

    const released = a.release(lease);
    expect(a.isCurrent(lease)).toBe(false);
    value(await released);
    const replacement = value(await b.acquireWriterLock());
    expect(replacement.ownerId).toBe('b');
    expectError(await a.release(lease), 'ERR-011');
    await b.invalidate();
    expect(value(await a.acquireWriterLock()).generation).toBe(lease.generation + 1);
    await a.invalidate();
  });

  it('denies unsupported browsers without an alternate lock', async () => {
    const lock = createWriterLock({ locks: undefined, ownerId: 'tab' });
    expect(lock.available).toBe(false);
    expectError(await lock.acquireWriterLock(), 'ERR-010');
    expect(lock.currentLease()).toBeNull();
    await lock.invalidate();
  });

  it('does not revive a lease when its pending native callback arrives after invalidation', async () => {
    let invoke!: () => Promise<void>;
    const request = (_name: string, _options: LockOptions, callback: (lock: Lock) => Promise<void>) => new Promise<void>((resolve) => {
      invoke = async () => { await callback({ name: writerLockName, mode: 'exclusive' }); resolve(); };
    });
    const lock = createWriterLock({ locks: { request } as unknown as Pick<LockManager, 'request'>, ownerId: 'a' });
    const acquiring = lock.acquireWriterLock();
    const releasing = lock.invalidate();
    expectError(await acquiring, 'ERR-011');
    await invoke();
    await releasing;
    expect(lock.currentLease()).toBeNull();
  });

  it('revokes a previously acquired lease if the native lifetime fails and notifies once', async () => {
    let nativeFailure!: () => void;
    const request = (_name: string, _options: LockOptions, callback: (lock: Lock) => Promise<void>) => new Promise<void>((_, decline) => {
      nativeFailure = () => decline(new DOMException('Lost native lock', 'AbortError'));
      void callback({ name: writerLockName, mode: 'exclusive' });
    });
    const onLost = vi.fn();
    const lock = createWriterLock({ locks: { request } as unknown as Pick<LockManager, 'request'>, ownerId: 'a', onLost });
    const lease = value(await lock.acquireWriterLock());
    nativeFailure();
    await Promise.resolve();
    expect(lock.isCurrent(lease)).toBe(false);
    expect(onLost).toHaveBeenCalledExactlyOnceWith(lease);
  });
});

describe('Stage A-2c LocalStorage persistence IF-13', () => {
  it('does not write initial data or progress in a non-owner tab, but permits read-only unlocked preview', async () => {
    const env = environment();
    const nonowner = createStorageCoordinator({ storage: env.storage, lock: createWriterLock({
      locks: env.locks, ownerId: 'tab-b',
    }), rules: env.rules, createEpoch: () => 'read-only-default' });
    const lease = await env.acquire();
    const view = await nonowner.pageShow();
    expectError(view.lease, 'ERR-009');
    expect(value(view.save)).toMatchObject({ revision: 0, progress: { unlockedMusicIds: ['music-01'] } });
    expect(nonowner.guard('VIEW').ok).toBe(true);
    expect(nonowner.guard('PREVIEW', undefined, 'music-01').ok).toBe(true);
    expectError(nonowner.guard('PREVIEW', undefined, 'music-02'), 'ERR-008');
    for (const operation of ['FORMAL', 'PRACTICE', 'CALIBRATION', 'WRITE'] as const) {
      expectError(nonowner.guard(operation), 'ERR-009');
    }
    expectError(nonowner.resetProgress(true, lease), 'ERR-011');
    expect(env.storage.setItem).toHaveBeenCalledTimes(1);
    await env.state.pageHide();

    const missing = environment(false);
    const unsupported = await missing.state.pageShow();
    expectError(unsupported.lease, 'ERR-010');
    expect(value(unsupported.save)).toMatchObject({ revision: 0 });
    expect(missing.storage.setItem).not.toHaveBeenCalled();
    expectError(missing.state.guard('WRITE'), 'ERR-010');
  });

  it('persists only the approved key and writes concurrent equal submissions once', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('parallel-clear');
    const pending = await env.prepare(sealed, lease);
    expect(pending).toMatchObject({ baseRevision: 0, leaseGeneration: lease.generation, recordedAt: storageRecordedAt });
    expect(pending.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(pending.result.counts)).toBe(true);
    expect(env.state.guard('PRACTICE', lease).ok).toBe(true);
    expect(env.state.guard('CALIBRATION', lease).ok).toBe(true);
    expectError(env.state.guard('FORMAL', lease), 'ERR-008');
    expectError(env.state.resetSettings(lease), 'ERR-008');
    expectError(env.state.resetProgress(true, lease), 'ERR-008');
    expectError(env.state.completePractice('TUT-01', lease), 'ERR-008');

    const first = env.state.commitResult(sealed, lease);
    const reordered = { ...Object.fromEntries(Object.entries(sealed).reverse()) } as unknown as FinalResult;
    const second = env.state.commitResult(reordered, lease);
    expect(second).toBe(first);
    expect(value(await first).receipt).toMatchObject({ revision: 1, resultDigest: pending.digest });
    expect(env.state.read()).toMatchObject({ saveStatus: 'SAVED', unresolved: false, pending: null });
    expect(env.currentSave()?.records['CHART-01-E']?.clear?.clearCount).toBe(1);
    expect(env.storage.setItem).toHaveBeenCalledTimes(2);
    expect(env.storage.setItem.mock.calls.map(([key]) => key)).toEqual([saveStorageKey, saveStorageKey]);
    expect(env.contents.get('outside-game')).toBe('sentinel');
    expectError(await env.state.commitResult(sealed, lease), 'ERR-018');
    await env.state.pageHide();
  });

  it('keeps CLEAR and FAILED records separate and refuses aborted or mismatched result requests', async () => {
    const env = environment();
    const lease = await env.acquire();
    const abort = value(env.state.beginFormal('abort', lease));
    expectError(await env.state.prepareCommit({ ...clearResult('abort'), outcome: 'ABORTED' } as unknown as FinalResult, abort, storageRecordedAt), 'ERR-018');
    env.state.abortFormal(abort);
    expect(env.state.read().pending).toBeNull();

    const clear = clearResult('clear');
    await env.prepare(clear, lease);
    value(await env.state.commitResult(clear, lease));
    const failure = failedResult('fail');
    await env.prepare(failure, lease);
    expectError(await env.state.commitResult({ ...failure, endJudgeTimeUs: 1 as FinalResult['endJudgeTimeUs'] }, lease), 'ERR-018');
    value(await env.state.commitResult(failure, lease));
    expect(env.currentSave()).toMatchObject({
      revision: 2, records: { 'CHART-01-E': { clear: { bestScore: 1_000_000, clearCount: 1 },
        failed: { bestScore: 0, failureCount: 1, bestProgressPermille: 61.728 } } },
      progress: { unlockedMusicIds: ['music-01', 'music-02'] }, commitReceipt: { sessionId: 'fail' },
    });
    await env.state.pageHide();
  });

  it('retains the same pending after a quota error and retries without changing the outcome', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('quota');
    const pending = await env.prepare(sealed, lease);
    const before = env.contents.get(saveStorageKey);
    env.next.writeFails = true;
    expectError(await env.state.commitResult(sealed, lease), 'ERR-013');
    expect(env.contents.get(saveStorageKey)).toBe(before);
    expect(env.state.read()).toMatchObject({ saveStatus: 'SAVE_ERROR', unresolved: true });
    expect(env.state.read().pending).toBe(pending);

    expect(value(await env.state.commitResult(sealed, lease)).status).toBe('SAVED');
    expect(env.currentSave()?.records['CHART-01-E']?.clear?.clearCount).toBe(1);
    await env.state.pageHide();
  });

  it('resolves a failed readback from its exact receipt, including after a later settings revision', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('readback');
    const pending = await env.prepare(sealed, lease);
    env.next.readbackFails = true;
    expectError(await env.state.commitResult(sealed, lease), 'ERR-016');
    expect(env.state.read().pending).toBe(pending);
    const current = env.currentSave()!;
    env.contents.set(saveStorageKey, JSON.stringify({ ...current, revision: 2, settings: { ...current.settings, musicVolume: 22 } }));
    expect(value(await env.state.commitResult(sealed, lease))).toMatchObject({ status: 'ALREADY_COMMITTED', receipt: { revision: 1 } });
    expect(env.storage.setItem).toHaveBeenCalledTimes(2);
    expect(env.state.read().data).toMatchObject({ revision: 2, settings: { musicVolume: 22 } });
    expect(env.currentSave()?.records['CHART-01-E']?.clear?.clearCount).toBe(1);
    await env.state.pageHide();
  });

  it.each(['retry', 'discard'] as const)('protects a schema-valid document whose matching receipt has the wrong result data on %s', async (action) => {
    const env = environment();
    const lease = await env.acquire();
    const initial = env.currentSave()!;
    const sealed = clearResult('conflicting-payload');
    const pending = await env.prepare(sealed, lease);
    env.next.readbackFails = true;
    expectError(await env.state.commitResult(sealed, lease), 'ERR-016');
    const committed = env.currentSave()!;
    // This receipt agrees with the exact pending identity, but the completed result was never reflected.
    const contradictory = { ...initial, revision: committed.revision, commitReceipt: committed.commitReceipt };
    expect(env.rules.validateSave(contradictory).ok).toBe(true);
    const raw = JSON.stringify(contradictory);
    env.contents.set(saveStorageKey, raw);

    const resolution = action === 'retry'
      ? await env.state.retrySave(lease)
      : env.state.discardResult(true, lease);
    expectError(resolution, 'ERR-016');
    expect(env.state.read()).toMatchObject({ pending, saveStatus: 'SAVE_ERROR', unresolved: true });
    expect(env.contents.get(saveStorageKey)).toBe(raw);
    expect(env.storage.setItem).toHaveBeenCalledTimes(2);
    await env.state.pageHide();
  });

  it('verifies equivalent stored result data in any object key order', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('reordered-payload');
    await env.prepare(sealed, lease);
    env.next.readbackFails = true;
    expectError(await env.state.commitResult(sealed, lease), 'ERR-016');
    const reordered = JSON.stringify(env.currentSave(), (_, value: unknown) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value);
    env.contents.set(saveStorageKey, reordered);

    expect(value(await env.state.retrySave(lease))).toMatchObject({ status: 'ALREADY_COMMITTED', receipt: { revision: 1 } });
    expect(env.contents.get(saveStorageKey)).toBe(reordered);
    expect(env.storage.setItem).toHaveBeenCalledTimes(2);
    await env.state.pageHide();
  });

  it('verifies an older receipt after another owner writes actual settings and tutorial changes', async () => {
    const env = environment();
    const original = await env.acquire();
    const sealed = clearResult('historical-payload');
    const pending = await env.prepare(sealed, original);
    env.next.readbackFails = true;
    expectError(await env.state.commitResult(sealed, original), 'ERR-016');
    await env.state.pageHide();
    const replacementTab = createStorageCoordinator({
      storage: env.storage, lock: createWriterLock({ locks: env.locks, ownerId: 'tab-b' }),
      rules: env.rules, createEpoch: () => 'unexpected',
    });
    const externalLease = value((await replacementTab.pageShow()).lease);
    const latest = replacementTab.read().data!;
    value(replacementTab.updateSettings({ ...latest.settings, musicVolume: 27 }, externalLease));
    value(replacementTab.completePractice('TUT-01', externalLease));
    await replacementTab.pageHide();

    const replacement = await env.acquire();
    const preserved = env.contents.get(saveStorageKey);
    expect(value(env.state.discardResult(true, replacement))).toBe('ALREADY_COMMITTED');
    expect(env.state.read().data).toMatchObject({
      revision: 3, settings: { musicVolume: 27 }, progress: { completedTutorialIds: ['TUT-01'] },
      commitReceipt: { revision: 1, resultDigest: pending.digest },
    });
    expect(env.contents.get(saveStorageKey)).toBe(preserved);
    expect(env.currentSave()?.records['CHART-01-E']?.clear?.clearCount).toBe(1);
    expect(env.storage.setItem).toHaveBeenCalledTimes(4);
    await env.state.pageHide();
  });

  it('preserves uncertainty on discard failure and cannot undo an already committed result', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('uncertain');
    const pending = await env.prepare(sealed, lease);
    env.next.readbackFails = true;
    expectError(await env.state.commitResult(sealed, lease), 'ERR-016');
    expectError(env.state.discardResult(false, lease), 'ERR-008');
    env.next.readFails = true;
    expectError(env.state.discardResult(true, lease), 'ERR-016');
    expect(env.state.read().pending).toBe(pending);
    const stored = env.contents.get(saveStorageKey);

    expect(value(env.state.discardResult(true, lease))).toBe('ALREADY_COMMITTED');
    expect(env.contents.get(saveStorageKey)).toBe(stored);
    expect(env.state.read()).toMatchObject({ saveStatus: 'SAVED', pending: null, unresolved: false });
    await env.state.pageHide();
  });

  it('can discard a verified unsaved result, but refuses another revision with no matching receipt', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('conflict');
    const pending = await env.prepare(sealed, lease);
    const baseline = env.contents.get(saveStorageKey)!;
    env.contents.set(saveStorageKey, JSON.stringify({ ...env.currentSave()!, revision: 2 }));
    expectError(await env.state.commitResult(sealed, lease), 'ERR-016');
    expectError(env.state.discardResult(true, lease), 'ERR-016');
    expect(env.state.read().pending).toBe(pending);
    expect(env.storage.setItem).toHaveBeenCalledTimes(1);

    env.contents.set(saveStorageKey, baseline);
    expect(value(env.state.discardResult(true, lease))).toBe('DISCARDED');
    expect(env.state.read()).toMatchObject({ saveStatus: 'DISCARDED', pending: null, unresolved: false });
    await env.state.pageHide();
  });

  it('protects raw corrupt text and future versions from overwrite or automatic reset', async () => {
    for (const [raw, code] of [['{broken', 'ERR-012'], ['{"schemaVersion":999}', 'ERR-014']] as const) {
      const env = environment();
      env.contents.set(saveStorageKey, raw);
      const result = await env.state.pageShow();
      expectError(result.save, code);
      const lease = value(result.lease);
      expectError(env.state.resetProgress(true, lease), code);
      expectError(env.state.beginFormal('still-blocked', lease), code);
      expect(env.contents.get(saveStorageKey)).toBe(raw);
      expect(env.storage.setItem).not.toHaveBeenCalled();
      await env.state.pageHide();
    }
  });

  it('retains the last receipt during settings/practice writes, then rotates epoch for a confirmed reset', async () => {
    const env = environment();
    const lease = await env.acquire();
    const sealed = clearResult('settings');
    await env.prepare(sealed, lease);
    const { receipt } = value(await env.state.commitResult(sealed, lease));
    const settings = { ...env.currentSave()!.settings, musicVolume: 13 };
    const update = value(env.state.updateSettings(settings, lease));
    expect(update).toMatchObject({ revision: 2, commitReceipt: receipt, settings: { musicVolume: 13 } });
    value(env.state.resetSettings(lease));
    value(env.state.updateSettings(settings, lease));
    const prepared = value(env.state.completePractice('TUT-01', lease));
    value(env.state.completePractice('TUT-01', lease));
    expect(env.currentSave()?.revision).toBe(prepared.revision);
    expectError(env.state.resetProgress(false, lease), 'ERR-008');
    const reset = value(env.state.resetProgress(true, lease));
    expect(reset).toMatchObject({ revision: 0, settings: { musicVolume: 13 }, records: {}, collection: {},
      achievements: [], progress: { unlockedMusicIds: ['music-01'], completedTutorialIds: [] }, commitReceipt: null });
    expect(reset.saveEpoch).not.toBe(receipt.saveEpoch);
    expectError(await env.state.commitResult(sealed, lease), 'ERR-018');
    expect(env.contents.get('outside-game')).toBe('sentinel');
    await env.state.pageHide();
  });

  it('preserves the exact result and time when digest creation fails and safely retries', async () => {
    const digest = vi.fn(globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle));
    digest.mockRejectedValueOnce(new DOMException('Controlled hash failure', 'OperationError'));
    const env = environment(true, { digest });
    const lease = await env.acquire();
    const sealed = clearResult('digest-retry');
    const binding = value(env.state.beginFormal(sealed.sessionId, lease));
    const attempt = env.state.prepareCommit(sealed, binding, storageRecordedAt);
    expect(env.state.read()).toMatchObject({ pending: null, preparingResult: sealed, saveStatus: 'PENDING_SAVE', unresolved: true });
    expectError(await attempt, 'ERR-017');
    expect(env.state.read()).toMatchObject({ pending: null, preparingResult: sealed, saveStatus: 'SAVE_ERROR', unresolved: true });
    expectError(await env.state.prepareCommit(failedResult(sealed.sessionId), binding, storageRecordedAt), 'ERR-018');
    expectError(env.state.guard('WRITE', lease), 'ERR-008');
    expect(env.storage.setItem).toHaveBeenCalledTimes(1);

    expect(value(await env.state.retrySave(lease))).toMatchObject({ status: 'SAVED', receipt: { sessionId: sealed.sessionId, revision: 1 } });
    expect(env.currentSave()?.achievements.every(({ unlockedAt }) => unlockedAt === storageRecordedAt)).toBe(true);
    expect(env.state.read()).toMatchObject({ pending: null, preparingResult: null, saveStatus: 'SAVED', unresolved: false });
    expect(digest).toHaveBeenCalledTimes(2);
    await env.state.pageHide();
  });

  it('permits only confirmed discard after failed digest preparation, preserving raw storage', async () => {
    const env = environment(true, { digest: vi.fn().mockRejectedValue(new DOMException('Controlled hash failure')) });
    const lease = await env.acquire();
    const result = clearResult('digest-discard');
    const initial = env.contents.get(saveStorageKey);
    const binding = value(env.state.beginFormal(result.sessionId, lease));
    expectError(await env.state.prepareCommit(result, binding, storageRecordedAt), 'ERR-017');
    expectError(env.state.discardResult(false, lease), 'ERR-008');
    expect(env.state.read().preparingResult).not.toBeNull();
    expect(value(env.state.discardResult(true, lease))).toBe('DISCARDED');
    expect(env.state.read()).toMatchObject({ preparingResult: null, pending: null, saveStatus: 'DISCARDED', unresolved: false });
    expect(env.contents.get(saveStorageKey)).toBe(initial);
    expect(env.storage.setItem).toHaveBeenCalledTimes(1);
    await env.state.pageHide();
  });

  it('cannot initialize a save when native acquisition arrives after pageshow was interrupted', async () => {
    let deliver!: () => Promise<void>;
    const request = (_name: string, _options: LockOptions, callback: (lock: Lock) => Promise<void>) => new Promise<void>((resolve) => {
      deliver = async () => { await callback({ name: writerLockName, mode: 'exclusive' }); resolve(); };
    });
    const memory = memoryStorage();
    const lock = createWriterLock({ locks: { request } as unknown as Pick<LockManager, 'request'>, ownerId: 'a' });
    const state = createStorageCoordinator({ storage: memory.storage, lock,
      rules: createSaveRules([storageTrialEntry]), createEpoch: () => 'lost' });
    const showing = state.pageShow();
    await Promise.resolve();
    const hiding = state.pageHide();
    await deliver();
    await hiding;
    const result = await showing;
    expectError(result.lease, 'ERR-011');
    expectError(result.save, 'ERR-011');
    expect(lock.currentLease()).toBeNull();
    expect(memory.storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps a pending result after independent lease invalidation and reports the actual stale owner', async () => {
    const env = environment();
    const original = await env.acquire();
    const sealed = clearResult('independent-lease-loss');
    const pending = await env.prepare(sealed, original);
    const raw = env.contents.get(saveStorageKey);
    await env.lock.invalidate();
    expectError(await env.state.commitResult(sealed, { ...original }), 'ERR-011');
    expect(env.state.read()).toMatchObject({ pending, saveStatus: 'PENDING_SAVE', unresolved: true });

    expectError(await env.state.commitResult(sealed, original), 'ERR-011');
    expect(env.state.read()).toMatchObject({ pending, saveStatus: 'SAVE_ERROR', unresolved: true, error: { code: 'ERR-011' } });
    expect(env.contents.get(saveStorageKey)).toBe(raw);
    expect(env.storage.setItem).toHaveBeenCalledTimes(1);
    const replacement = await env.acquire();
    expect(value(env.state.discardResult(true, replacement))).toBe('DISCARDED');
    await env.state.pageHide();
  });

  it('protects a committed receipt after pagehide, preserving the record under replacement authority', async () => {
    const env = environment();
    const original = await env.acquire();
    const sealed = clearResult('committed-before-pagehide');
    const pending = await env.prepare(sealed, original);
    env.next.readbackFails = true;
    expectError(await env.state.commitResult(sealed, original), 'ERR-016');
    const committed = env.contents.get(saveStorageKey);
    await env.state.pageHide();
    const replacement = await env.acquire();
    expect(replacement.generation).toBe(original.generation + 1);
    expect(env.state.read()).toMatchObject({ pending, saveStatus: 'SAVE_ERROR', unresolved: true, data: { revision: 1 } });
    expectError(await env.state.retrySave(replacement), 'ERR-018');
    expect(value(env.state.discardResult(true, replacement))).toBe('ALREADY_COMMITTED');
    expect(env.state.read()).toMatchObject({ pending: null, saveStatus: 'SAVED', unresolved: false });
    expect(env.contents.get(saveStorageKey)).toBe(committed);
    expect(env.currentSave()?.records['CHART-01-E']?.clear?.clearCount).toBe(1);
    expect(env.storage.setItem).toHaveBeenCalledTimes(2);
    await env.state.pageHide();
  });

  it('stops an in-flight queued commit on pagehide and cannot use an old lease after a fresh read', async () => {
    const env = environment();
    const original = await env.acquire();
    const sealed = clearResult('page-lease');
    const pending = await env.prepare(sealed, original);
    const work = env.state.commitResult(sealed, original);
    const hiding = env.state.pageHide();
    expect(env.lock.isCurrent(original)).toBe(false);
    const showing = env.state.pageShow();
    expect(env.state.pageShow()).toBe(showing);
    expectError(await work, 'ERR-011');
    await hiding;
    const relaunched = await showing;
    const replacement = value(relaunched.lease);
    expect(replacement.generation).toBe(original.generation + 1);
    expect(value(relaunched.save).revision).toBe(0);

    expectError(await env.state.commitResult(sealed, original), 'ERR-011');
    expectError(await env.state.commitResult(sealed, replacement), 'ERR-018');
    expect(env.state.read().pending).toBe(pending);
    expect(value(env.state.discardResult(true, replacement))).toBe('DISCARDED');
    expect(env.storage.setItem).toHaveBeenCalledTimes(1);
    await env.state.pageHide();
  });
});
