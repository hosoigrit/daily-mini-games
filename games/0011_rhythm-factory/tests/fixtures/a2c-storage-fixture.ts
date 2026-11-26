import type { Result, WriterLease } from '../../src/contracts/interface_contracts';
import { createSaveRules } from '../../src/domain/save-data';
import { createStorageCoordinator, saveStorageKey } from '../../src/infrastructure/storage-coordinator';
import { createWriterLock } from '../../src/infrastructure/writer-lock';
import { clearResult, storageRecordedAt, storageTrialEntry } from './a2c-storage-data';

function createIsolatedProbe() {
  const lock = createWriterLock({ locks: navigator.locks, ownerId: crypto.randomUUID() });
  let failReadback = false;
  let failRead = false;
  let previousLease: WriterLease | undefined;
  const storage = {
    getItem(key: string) {
      if (failRead) {
        failRead = false;
        throw new DOMException('Controlled readback failure', 'SecurityError');
      }
      return localStorage.getItem(key);
    },
    setItem(key: string, value: string) {
      localStorage.setItem(key, value);
      if (failReadback) {
        failReadback = false;
        failRead = true;
      }
    },
  };
  const coordinator = createStorageCoordinator({ storage, lock,
    rules: createSaveRules([storageTrialEntry]), createEpoch: () => crypto.randomUUID() });
  window.addEventListener('pagehide', () => { void coordinator.pageHide(); });

  function current<T>(withLease: (lease: WriterLease) => Result<T>): Result<T> {
    const lease = lock.currentLease();
    if (lease) return withLease(lease);
    return { ok: false, error: { code: 'ERR-009', severity: 'ERROR', messageKey: 'lock.unavailable', recoverable: true } };
  }

  return {
    writerSupported: lock.available,
    async show() {
      const res = await coordinator.pageShow();
      if (res.lease.ok) previousLease = res.lease.value;
      return res;
    },
    hide: coordinator.pageHide,
    snapshot: coordinator.read,
    readRaw: () => localStorage.getItem(saveStorageKey),
    guard() {
      const lease = lock.currentLease() ?? undefined;
      return {
        view: coordinator.guard('VIEW'),
        preview: coordinator.guard('PREVIEW', lease, 'music-01'),
        formal: coordinator.guard('FORMAL', lease),
        practice: coordinator.guard('PRACTICE', lease),
        calibration: coordinator.guard('CALIBRATION', lease),
        write: coordinator.guard('WRITE', lease),
      };
    },
    setVolume(musicVolume: number) {
      return current((lease) => {
        const stored = coordinator.read().data!;
        return coordinator.updateSettings({ ...stored.settings, musicVolume }, lease);
      });
    },
    setVolumeWithPreviousLease(musicVolume: number) {
      const stored = coordinator.read().data!;
      return coordinator.updateSettings({ ...stored.settings, musicVolume }, previousLease!);
    },
    async saveClear(sessionId: string, injectReadbackFailure: boolean) {
      const lease = lock.currentLease()!;
      const binding = coordinator.beginFormal(sessionId, lease);
      if (!binding.ok) return binding;
      const sealed = clearResult(sessionId);
      const staged = await coordinator.prepareCommit(sealed, binding.value, storageRecordedAt);
      if (!staged.ok) return staged;
      failReadback = injectReadbackFailure;
      return coordinator.commitResult(sealed, lease);
    },
    retryClear(sessionId: string) {
      return coordinator.commitResult(clearResult(sessionId), lock.currentLease()!);
    },
  };
}

export type A2cStorageProbe = ReturnType<typeof createIsolatedProbe>;
declare global { interface Window { a2cStorageProbe?: A2cStorageProbe } }

// Do not create a coordinator when navigating to these fixture bytes without the isolated test option.
if (new URLSearchParams(location.search).get('isolated') === 'playwright') window.a2cStorageProbe = createIsolatedProbe();
