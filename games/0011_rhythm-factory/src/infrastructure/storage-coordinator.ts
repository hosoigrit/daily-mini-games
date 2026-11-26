import type {
  Contracts, ErrorCode, FinalResult, GameError, GameSettings, MusicId, PendingCommit,
  RecordUpdate, Result, SaveCommitResult, SaveDataV1, SaveReceipt, SaveStatus, TutorialId, WriterLease,
} from '../contracts/interface_contracts';
import type { WriterLock } from './writer-lock';

export const saveStorageKey = 'daily-mini-games.game0011.save.v1';

type Failure = Extract<Result<never>, { ok: false }>;
type SaveAction = 'VIEW' | 'PREVIEW' | 'FORMAL' | 'PRACTICE' | 'CALIBRATION' | 'WRITE';

export interface StorageRules {
  createInitialSave(epoch: string): Result<SaveDataV1>;
  parseSave(raw: string): Result<SaveDataV1>;
  validateSave(value: unknown): Result<SaveDataV1>;
  buildRecordUpdate(save: SaveDataV1, result: FinalResult, recordedAt: string): Result<RecordUpdate>;
  updateSettings(save: SaveDataV1, settings: GameSettings): Result<SaveDataV1>;
  resetSettings(save: SaveDataV1): Result<SaveDataV1>;
  resetProgress(save: SaveDataV1, newEpoch: string): Result<SaveDataV1>;
  completePractice(save: SaveDataV1, tutorialId: TutorialId): Result<SaveDataV1>;
}

interface StorageCoordinatorOptions {
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  readonly lock: WriterLock;
  readonly rules: StorageRules;
  readonly createEpoch: () => string;
  readonly digest?: Pick<SubtleCrypto, 'digest'>;
}

export interface FormalSaveSession {
  readonly sessionId: string;
  readonly saveEpoch: string;
  readonly baseRevision: number;
  readonly lease: WriterLease;
}

export interface StorageSnapshot {
  readonly data: SaveDataV1 | null;
  readonly pending: PendingCommit | null;
  readonly preparingResult: FinalResult | null;
  readonly saveStatus: SaveStatus;
  readonly error: GameError | null;
  readonly unresolved: boolean;
}

interface SavedDocument { readonly raw: string; readonly data: SaveDataV1 }
interface StagedResult {
  readonly result: FinalResult;
  readonly binding: FormalSaveSession;
  readonly baseline: SavedDocument;
  readonly canonical: string;
  readonly recordedAt: string;
}
interface PendingDocument { readonly commit: PendingCommit; readonly baseline: SavedDocument; readonly canonical: string; readonly lease: WriterLease }

const ok = <T>(value: T): Result<T> => ({ ok: true, value });

function fail(code: ErrorCode, messageKey: string): Failure {
  return { ok: false, error: { code, messageKey, severity: 'ERROR', recoverable: true } };
}

function frozenData(data: SaveDataV1): SaveDataV1 {
  const freeze = (value: unknown) => {
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(data);
  return data;
}

function canonicalResult(result: FinalResult): string | null {
  if (!result || (result.outcome !== 'CLEAR' && result.outcome !== 'FAILED') || !result.counts) return null;
  const { counts } = result;
  const text = [result.sessionId, result.musicId, result.chartId, result.difficulty, result.outcome, result.rank];
  const numbers = [
    result.score, counts.perfect, counts.great, counts.good, counts.miss, counts.unplayed, counts.ghost,
    result.totalJudgements, result.maxCombo, result.remainingLifeUnits, result.endJudgeTimeUs, result.durationUs,
  ];
  if (text.some((value) => typeof value !== 'string') || numbers.some((value) => !Number.isSafeInteger(value))) return null;
  return JSON.stringify([...text, ...numbers]);
}

function matchingReceipt(save: SaveDataV1, pending: PendingCommit): SaveReceipt | null {
  const receipt = save.commitReceipt;
  if (receipt?.sessionId !== pending.result.sessionId || receipt.saveEpoch !== pending.saveEpoch
      || receipt.resultDigest !== pending.digest || receipt.revision !== pending.baseRevision + 1) return null;
  return receipt;
}

export function createStorageCoordinator({ storage, lock, rules, createEpoch, digest }: StorageCoordinatorOptions) {
  let data: SaveDataV1 | null = null;
  let persisted: SavedDocument | null = null;
  let readError: GameError | null = null;
  let saveError: GameError | null = null;
  let saveStatus: SaveStatus = 'IDLE';
  let formal: { binding: FormalSaveSession; baseline: SavedDocument } | null = null;
  let staged: StagedResult | null = null;
  let hashing: StagedResult | null = null;
  let pending: PendingDocument | null = null;
  let committing: Promise<Result<SaveCommitResult>> | null = null;
  let pageSequence = 0;
  let pageRelease: Promise<void> | null = null;
  let showing: { sequence: number; promise: Promise<{ lease: Result<WriterLease>; save: Result<SaveDataV1> }> } | null = null;

  function readLatest(): Result<SavedDocument | null> {
    if (!storage) return fail('ERR-016', 'storage.unavailable');
    let raw: string | null;
    try {
      raw = storage.getItem(saveStorageKey);
    } catch {
      return fail('ERR-016', 'storage.readFailed');
    }
    if (raw === null) return ok(null);
    const parsed = rules.parseSave(raw);
    return parsed.ok ? ok({ raw, data: frozenData(parsed.value) }) : parsed;
  }

  function readFailure(result: Failure): Result<never> {
    readError = result.error;
    data = null;
    return result;
  }

  function remember(document: SavedDocument): SaveDataV1 {
    persisted = document;
    data = document.data;
    readError = null;
    return data;
  }

  function permission(lease?: WriterLease): Result<void> {
    if (!lock.available) return fail('ERR-010', 'lock.unsupported');
    if (lease === undefined) return fail('ERR-009', 'lock.unavailable');
    if (!lock.isCurrent(lease)) return fail('ERR-011', 'lock.staleLease');
    return ok(undefined);
  }

  function writeDocument(value: SaveDataV1, lease: WriterLease): Result<SavedDocument> {
    const valid = rules.validateSave(value);
    if (!valid.ok) return valid;
    const authority = permission(lease);
    if (!authority.ok) return authority;
    if (!storage) return fail('ERR-013', 'storage.unavailable');
    const intended = JSON.stringify(valid.value);
    try {
      storage.setItem(saveStorageKey, intended);
    } catch {
      return fail('ERR-013', 'storage.writeFailed');
    }
    const actual = readLatest();
    if (!actual.ok || actual.value?.raw !== intended) return fail('ERR-016', 'storage.readbackUnconfirmed');
    if (!lock.isCurrent(lease)) return fail('ERR-011', 'lock.staleLease');
    return ok(actual.value);
  }

  function load(lease?: WriterLease): Result<SaveDataV1> {
    if (lease !== undefined) {
      const authority = permission(lease);
      if (!authority.ok) return authority;
    }
    const latest = readLatest();
    if (!latest.ok) return readFailure(latest);
    if (latest.value) return ok(remember(latest.value));
    if (persisted || pending || staged) return readFailure(fail('ERR-016', 'storage.missingExistingSave'));

    if (lease === undefined && data) return ok(data);
    const initial = rules.createInitialSave(createEpoch());
    if (!initial.ok) return readFailure(initial);
    if (lease === undefined) {
      data = frozenData(initial.value);
      readError = null;
      return ok(data);
    }
    const stored = writeDocument(initial.value, lease);
    return stored.ok ? ok(remember(stored.value)) : readFailure(stored);
  }

  function read(): StorageSnapshot {
    return Object.freeze({ data, pending: pending?.commit ?? null, preparingResult: staged?.result ?? null, saveStatus,
      error: readError ?? saveError, unresolved: pending !== null || staged !== null || readError !== null });
  }

  function guard(action: SaveAction, lease?: WriterLease, musicId?: MusicId): Result<void> {
    if (action === 'VIEW') return ok(undefined);
    if (action === 'PREVIEW') {
      if (readError) return { ok: false, error: readError };
      return musicId && data?.progress.unlockedMusicIds.includes(musicId)
        ? ok(undefined) : fail('ERR-008', 'storage.previewLocked');
    }
    const authority = permission(lease);
    if (!authority.ok) return authority;
    if (readError) return { ok: false, error: readError };
    if (!persisted) return fail('ERR-016', 'storage.notLoaded');
    if ((action === 'FORMAL' || action === 'WRITE') && (pending || staged || formal)) {
      return fail('ERR-008', (pending || staged) ? 'storage.pendingUnresolved' : 'storage.formalInProgress');
    }
    return ok(undefined);
  }

  function unchanged(baseline: SavedDocument): Result<SavedDocument> {
    const latest = readLatest();
    if (!latest.ok) return latest;
    if (latest.value?.raw !== baseline.raw) return fail('ERR-016', 'storage.changedUnexpectedly');
    return ok(latest.value);
  }

  function beginFormal(sessionId: string, lease: WriterLease): Result<FormalSaveSession> {
    const ready = guard('FORMAL', lease);
    if (!ready.ok) return ready;
    if (!sessionId) return fail('ERR-018', 'storage.invalidSession');
    const current = unchanged(persisted!);
    if (!current.ok) return readFailure(current);
    const { saveEpoch, revision } = current.value.data;
    if (current.value.data.commitReceipt?.sessionId === sessionId) return fail('ERR-018', 'storage.reusedSession');
    const binding = Object.freeze({ sessionId, saveEpoch, baseRevision: revision, lease });
    formal = { binding, baseline: current.value };
    saveStatus = 'IDLE';
    saveError = null;
    return ok(binding);
  }

  function abortFormal(binding: FormalSaveSession): void {
    if (formal?.binding === binding) formal = null;
  }

  function prepareCommit(result: FinalResult, binding: FormalSaveSession, recordedAt: string): Promise<Result<PendingCommit>> {
    const authority = permission(binding.lease);
    if (!authority.ok) return Promise.resolve(authority);
    if (!formal || formal.binding !== binding || pending || staged || result?.sessionId !== binding.sessionId) {
      return Promise.resolve(fail('ERR-018', 'storage.invalidFormalResult'));
    }
    const canonical = canonicalResult(result);
    if (!canonical) return Promise.resolve(fail('ERR-018', 'storage.invalidFormalResult'));
    const solidResult = Object.freeze({ ...result, counts: Object.freeze({ ...result.counts }) });
    const baseline = formal.baseline;
    const verified = rules.buildRecordUpdate(baseline.data, solidResult, recordedAt);
    if (!verified.ok) return Promise.resolve(verified);

    staged = Object.freeze({ result: solidResult, binding, baseline, canonical, recordedAt });
    formal = null;
    return hashStaged(staged, binding.lease);
  }

  async function hashStaged(subject: StagedResult, lease: WriterLease): Promise<Result<PendingCommit>> {
    const authority = permission(lease);
    if (!authority.ok) return authority;
    if (subject.binding.lease !== lease || hashing === subject) return fail('ERR-018', 'storage.invalidPending');
    hashing = subject;
    saveStatus = 'PENDING_SAVE';
    saveError = null;
    try {
      const source = digest ?? globalThis.crypto?.subtle;
      if (!source) return commitFailure(fail('ERR-017', 'storage.digestUnavailable'));
      const hash = await source.digest('SHA-256', new TextEncoder().encode(subject.canonical));
      if (staged !== subject) return fail('ERR-018', 'storage.invalidPending');
      if (!lock.isCurrent(lease)) return commitFailure(fail('ERR-011', 'lock.staleLease'));
      if (hash.byteLength !== 32) return commitFailure(fail('ERR-017', 'storage.digestUnavailable'));
      const resultDigest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const commit = Object.freeze({
        result: subject.result, saveEpoch: subject.binding.saveEpoch, baseRevision: subject.binding.baseRevision,
        digest: resultDigest, leaseGeneration: lease.generation, recordedAt: subject.recordedAt,
      });
      pending = { commit, baseline: subject.baseline, canonical: subject.canonical, lease };
      staged = null;
      return ok(commit);
    } catch {
      if (staged !== subject) return fail('ERR-018', 'storage.invalidPending');
      return commitFailure(lock.isCurrent(lease)
        ? fail('ERR-017', 'storage.digestUnavailable')
        : fail('ERR-011', 'lock.staleLease'));
    } finally {
      if (hashing === subject) hashing = null;
    }
  }

  function retryPreparation(lease: WriterLease): Promise<Result<PendingCommit>> {
    if (!staged || saveStatus !== 'SAVE_ERROR') return Promise.resolve(fail('ERR-008', 'storage.retryUnavailable'));
    return hashStaged(staged, lease);
  }

  function commitFailure(result: Failure): Result<never> {
    saveStatus = 'SAVE_ERROR';
    saveError = result.error;
    return result;
  }

  function completeCommit(document: SavedDocument): void {
    remember(document);
    pending = null;
    saveStatus = 'SAVED';
    saveError = null;
  }

  function writePending(document: PendingDocument, lease: WriterLease): Result<SaveCommitResult> {
    const authority = permission(lease);
    if (!authority.ok) return commitFailure(authority);
    if (pending !== document) return fail('ERR-018', 'storage.invalidPending');
    const { commit, baseline } = document;
    const latest = readLatest();
    if (!latest.ok) return commitFailure(latest);
    if (latest.value) {
      const matching = matchingReceipt(latest.value.data, commit);
      if (matching) {
        completeCommit(latest.value);
        return ok({ status: 'ALREADY_COMMITTED', receipt: matching });
      }
    }

    if (latest.value?.raw !== baseline.raw || latest.value.data.saveEpoch !== commit.saveEpoch
        || latest.value.data.revision !== commit.baseRevision || !Number.isSafeInteger(commit.baseRevision + 1)) {
      return commitFailure(fail('ERR-016', 'storage.changedUnexpectedly'));
    }
    const update = rules.buildRecordUpdate(baseline.data, commit.result, commit.recordedAt);
    if (!update.ok) return commitFailure(update);
    const receipt: SaveReceipt = {
      sessionId: commit.result.sessionId, saveEpoch: commit.saveEpoch,
      revision: commit.baseRevision + 1, resultDigest: commit.digest,
    };
    const stored = writeDocument({ ...update.value.data, revision: receipt.revision, commitReceipt: receipt }, lease);
    if (!stored.ok) return commitFailure(stored);
    const verified = matchingReceipt(stored.value.data, commit);
    if (!verified) return commitFailure(fail('ERR-016', 'storage.readbackUnconfirmed'));
    completeCommit(stored.value);
    return ok({ status: 'SAVED', receipt: verified });
  }

  const commitResult: Contracts['commitResult'] = (result, lease) => {
    const document = pending;
    const authority = permission(lease);
    if (!authority.ok) return Promise.resolve(authority);
    if (document?.lease !== lease || document.commit.leaseGeneration !== lease.generation
        || canonicalResult(result) !== document.canonical) {
      return Promise.resolve(fail('ERR-018', 'storage.invalidPending'));
    }
    if (committing) return committing;
    saveStatus = 'SAVING';
    const operation = Promise.resolve().then(() => writePending(document, lease)).finally(() => { committing = null; });
    committing = operation;
    return operation;
  };

  async function retrySave(lease: WriterLease): Promise<Result<SaveCommitResult>> {
    if (saveStatus !== 'SAVE_ERROR') return fail('ERR-008', 'storage.retryUnavailable');
    if (staged) {
      const prepared = await retryPreparation(lease);
      if (!prepared.ok) return prepared;
      return commitResult(prepared.value.result, lease);
    }
    return pending ? commitResult(pending.commit.result, lease) : fail('ERR-008', 'storage.retryUnavailable');
  }

  function discardResult(confirmed: boolean, lease: WriterLease): Result<'DISCARDED' | 'ALREADY_COMMITTED'> {
    const authority = permission(lease);
    if (!authority.ok) return authority;
    const before = (pending ?? staged)?.baseline;
    if (!confirmed || !before || saveStatus !== 'SAVE_ERROR' || committing) return fail('ERR-008', 'storage.discardUnavailable');
    const latest = readLatest();
    if (!latest.ok) return commitFailure(latest);
    if (pending && latest.value && matchingReceipt(latest.value.data, pending.commit)) {
      completeCommit(latest.value);
      return ok('ALREADY_COMMITTED');
    }
    if (latest.value?.raw !== before.raw) return commitFailure(fail('ERR-016', 'storage.discardUnconfirmed'));
    remember(latest.value);
    staged = null;
    pending = null;
    saveStatus = 'DISCARDED';
    saveError = null;
    return ok('DISCARDED');
  }

  function mutate(lease: WriterLease, update: (current: SaveDataV1) => Result<SaveDataV1>, resetEpoch = false): Result<SaveDataV1> {
    const ready = guard('WRITE', lease);
    if (!ready.ok) return ready;
    const latest = unchanged(persisted!);
    if (!latest.ok) return readFailure(latest);
    const previous = latest.value.data;
    const proposal = update(previous);
    if (!proposal.ok || proposal.value === previous) return proposal;
    const revision = previous.revision + 1;
    if (!resetEpoch && !Number.isSafeInteger(revision)) return fail('ERR-016', 'storage.revisionExhausted');
    const next = resetEpoch ? proposal.value : { ...proposal.value, revision, commitReceipt: previous.commitReceipt };
    const stored = writeDocument(next, lease);
    if (stored.ok) {
      saveError = null;
      return ok(remember(stored.value));
    }
    if (stored.error.code === 'ERR-016') return readFailure(stored);
    saveError = stored.error;
    return stored;
  }

  async function pageHide(): Promise<void> {
    pageSequence++;
    formal = null;
    const release = lock.invalidate();
    pageRelease = release;
    if (pending || staged) commitFailure(fail('ERR-011', 'lock.staleLease'));
    await release;
    if (pageRelease === release) pageRelease = null;
  }

  function pageShow(): Promise<{ lease: Result<WriterLease>; save: Result<SaveDataV1> }> {
    if (showing?.sequence === pageSequence) return showing.promise;
    const sequence = ++pageSequence;
    const lost = fail('ERR-011', 'lock.staleLease');
    const show = async () => {
      await pageRelease;
      if (sequence !== pageSequence) return { lease: lost, save: lost };
      const current = lock.currentLease();
      const lease = current ? ok(current) : await lock.acquireWriterLock();
      if (sequence !== pageSequence) return { lease: lost, save: lost };
      return { lease, save: load(lease.ok ? lease.value : undefined) };
    };
    const promise = show().finally(() => { if (showing?.sequence === sequence) showing = null; });
    showing = { sequence, promise };
    return promise;
  }

  return {
    load, read, guard, beginFormal, abortFormal, prepareCommit, retryPreparation, commitResult, retrySave, discardResult,
    updateSettings: (settings: GameSettings, lease: WriterLease) => mutate(lease, (save) => rules.updateSettings(save, settings)),
    resetSettings: (lease: WriterLease) => mutate(lease, rules.resetSettings),
    completePractice: (tutorialId: TutorialId, lease: WriterLease) => mutate(lease, (save) => rules.completePractice(save, tutorialId)),
    resetProgress: (confirmed: boolean, lease: WriterLease) => !confirmed
      ? fail('ERR-008', 'storage.resetUnconfirmed')
      : mutate(lease, (save) => rules.resetProgress(save, createEpoch()), true),
    pageHide, pageShow,
  };
}
