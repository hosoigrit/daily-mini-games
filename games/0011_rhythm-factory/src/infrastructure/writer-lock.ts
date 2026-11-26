import type { Contracts, ErrorCode, LockControlPort, Result, WriterLease } from '../contracts/interface_contracts';

export const writerLockName = 'daily-mini-games.game0011.writer';

export interface WriterLock extends Pick<Contracts, 'acquireWriterLock'>, LockControlPort {
  readonly available: boolean;
  currentLease(): WriterLease | null;
  /** Invalidates outstanding acquisition and write permission immediately; the promise waits for native release. */
  invalidate(): Promise<void>;
}

interface WriterLockOptions {
  readonly locks: Pick<LockManager, 'request'> | undefined;
  readonly ownerId: string;
  readonly onLost?: (lease: WriterLease) => void;
}

function failure(code: ErrorCode, messageKey: string): Result<never> {
  return { ok: false, error: { code, severity: 'ERROR', recoverable: true, messageKey } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

interface LockRequest {
  lease: WriterLease | null;
  readonly acquired: ReturnType<typeof deferred<Result<WriterLease>>>;
  readonly hold: ReturnType<typeof deferred<void>>;
  completion: Promise<unknown>;
}

export function createWriterLock({ locks, ownerId, onLost }: WriterLockOptions): WriterLock {
  if (!ownerId) throw new RangeError('A writer lock needs a nonempty owner ID');

  let generation = 0;
  let current: LockRequest | null = null;
  let releasing: Promise<unknown> | null = null;

  function finishLost(request: LockRequest): void {
    if (request !== current) return;
    current = null;
    request.acquired.resolve(failure('ERR-011', 'lock.lost'));
    request.hold.resolve();
    if (request.lease) onLost?.(request.lease);
  }

  function acquireWriterLock(): Promise<Result<WriterLease>> {
    if (!locks) return Promise.resolve(failure('ERR-010', 'lock.unsupported'));
    if (current || releasing) return Promise.resolve(failure('ERR-009', 'lock.unavailable'));

    const request: LockRequest = {
      lease: null, acquired: deferred<Result<WriterLease>>(), hold: deferred<void>(), completion: Promise.resolve(),
    };
    current = request;
    try {
      request.completion = locks.request(writerLockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (current !== request) return;
        if (lock === null) {
          current = null;
          request.acquired.resolve(failure('ERR-009', 'lock.unavailable'));
          return;
        }
        if (lock.name !== writerLockName || lock.mode !== 'exclusive') {
          finishLost(request);
          return;
        }
        const lease = Object.freeze({ ownerId, generation: ++generation });
        request.lease = lease;
        request.acquired.resolve({ ok: true, value: lease });
        await request.hold.promise;
      }).then(() => finishLost(request), () => finishLost(request));
    } catch {
      finishLost(request);
    }
    return request.acquired.promise;
  }

  async function invalidate(): Promise<void> {
    const request = current;
    current = null;
    if (!request) {
      await releasing;
      return;
    }
    request.acquired.resolve(failure('ERR-011', 'lock.lost'));
    releasing = request.completion;
    request.hold.resolve();
    await releasing;
    releasing = null;
  }

  function isCurrent(lease: WriterLease): boolean {
    return current?.lease != null && current.lease === lease;
  }

  return {
    available: locks !== undefined,
    acquireWriterLock,
    currentLease: () => current?.lease ?? null,
    isCurrent,
    invalidate,
    async release(lease) {
      if (!isCurrent(lease)) return failure('ERR-011', 'lock.staleLease');
      await invalidate();
      return { ok: true, value: undefined };
    },
  };
}
