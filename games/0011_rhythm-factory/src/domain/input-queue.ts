import type {
  Contracts, GameError, Gen, InputReceipt, NormalizedInput, Result, Us,
} from '../contracts/interface_contracts';

export const deliveryWaitUs = 50_000;

export function inputFailure(
  code: 'ERR-006' | 'ERR-007' | 'ERR-018', messageKey: string, sessionId: string,
): Result<never> {
  const error: GameError = { code, messageKey, sessionId, severity: 'ERROR', recoverable: false };
  return { ok: false, error };
}

const compareInputs = (left: NormalizedInput, right: NormalizedInput) =>
  left.judgeTimeUs - right.judgeTimeUs || left.sequence - right.sequence;

export interface InputQueue extends Pick<Contracts, 'enqueueInput' | 'drainBefore'> {
  readonly processedBeforeUs: Us;
  readonly delaysOver50Ms: number;
  readonly lateInputs: number;
  readonly stopError: GameError | null;
  openPause(boundary: Us): Result<void>;
  resumeGeneration(next: Gen): Result<void>;
  seal(): void;
}

export function createInputQueue(sessionId: string, generation: Gen, closeJudgeUs: Us, offsetUs = 0 as Us): InputQueue {
  let currentGeneration = generation;
  let pauseBoundary: Us | null = null;
  const previousBoundaries = new Map<Gen, Us | null>();
  let processedBeforeUs = Number.MIN_SAFE_INTEGER as Us;
  let resumeFloor = Number.MIN_SAFE_INTEGER;
  let delaysOver50Ms = 0;
  let lateInputs = 0;
  let sealed = false;
  let fault: GameError | null = null;
  let pending: NormalizedInput[] = [];
  const seen = new Set<string>();
  const pendingOrder = new Set<string>();
  const orderKey = (input: NormalizedInput) => `${input.judgeTimeUs}/${input.sequence}`;

  function halt(code: 'ERR-006' | 'ERR-007' | 'ERR-018', key: string) {
    const failure = inputFailure(code, key, sessionId);
    if (!failure.ok) fault = failure.error;
    return failure;
  }

  return {
    get processedBeforeUs() { return processedBeforeUs; },
    get delaysOver50Ms() { return delaysOver50Ms; },
    get lateInputs() { return lateInputs; },
    get stopError() { return fault; },
    enqueueInput(input) {
      if (!input || typeof input.sessionId !== 'string' || !input.sessionId.trim()
          || !Number.isSafeInteger(input.clockGeneration) || input.clockGeneration < 0) {
        return inputFailure('ERR-018', 'input.invalidContext', sessionId);
      }
      const receipt = (reason: InputReceipt['reason']): Result<InputReceipt> => ({
        ok: true, value: { eventId: input.eventId, accepted: reason === 'QUEUED', reason },
      });

      if (input.sessionId !== sessionId) return receipt('STALE_SESSION');
      const stale = input.clockGeneration !== currentGeneration;
      const oldBoundary = stale ? previousBoundaries.get(input.clockGeneration) : undefined;
      if (sealed) return receipt(stale ? 'STALE_SESSION' : 'IGNORED_STATE');
      if (seen.has(input.eventId)) return receipt(stale && oldBoundary === undefined ? 'STALE_SESSION' : 'DUPLICATE');
      if (stale && (oldBoundary === undefined || oldBoundary === null)) return receipt('STALE_SESSION');
      if (fault) return { ok: false, error: fault };
      if (typeof input.eventId !== 'string' || !input.eventId.trim()
          || typeof input.inputId !== 'string' || !input.inputId.trim()
          || !Number.isInteger(input.lane) || input.lane < 1 || input.lane > 4
          || (input.action !== 'DOWN' && input.action !== 'UP')
          || !Number.isSafeInteger(input.sequence) || input.sequence < 0
          || !Number.isFinite(input.eventPerformanceMs) || input.eventPerformanceMs < 0
          || !Number.isFinite(input.receivedPerformanceMs) || input.receivedPerformanceMs < input.eventPerformanceMs
          || !Number.isSafeInteger(input.songTimeUs) || !Number.isSafeInteger(input.judgeTimeUs)
          || input.songTimeUs - input.judgeTimeUs !== offsetUs) {
        return inputFailure('ERR-018', 'input.invalidEvent', sessionId);
      }
      if (input.judgeTimeUs > closeJudgeUs) return receipt('IGNORED_STATE');
      if (stale && oldBoundary !== undefined && oldBoundary !== null && input.judgeTimeUs > oldBoundary) {
        return receipt('STALE_SESSION');
      }
      if (pauseBoundary !== null && !stale && input.judgeTimeUs > pauseBoundary) return receipt('IGNORED_STATE');
      if (input.receivedPerformanceMs - input.eventPerformanceMs > deliveryWaitUs / 1000) delaysOver50Ms++;
      if (input.judgeTimeUs < processedBeforeUs) {
        if (!stale && previousBoundaries.size > 0 && input.judgeTimeUs < resumeFloor) return receipt('IGNORED_STATE');
        lateInputs++;
        return halt('ERR-007', 'input.lateEvent');
      }

      const key = orderKey(input);
      if (pendingOrder.has(key)) return halt('ERR-018', 'input.ambiguousSequence');
      pendingOrder.add(key);
      seen.add(input.eventId);
      pending.push(Object.freeze({ ...input }));
      return receipt('QUEUED');
    },
    drainBefore(watermark) {
      if (fault) return { ok: false, error: fault };
      if (sealed) return { ok: true, value: { processedBeforeUs, events: [] } };
      if (!Number.isSafeInteger(watermark) || watermark < processedBeforeUs) {
        return halt('ERR-006', 'input.invalidWatermark');
      }

      const events: NormalizedInput[] = [];
      const remaining: NormalizedInput[] = [];
      for (const input of pending) {
        if (input.judgeTimeUs < watermark) {
          pendingOrder.delete(orderKey(input));
          events.push(input);
        } else {
          remaining.push(input);
        }
      }
      pending = remaining;
      processedBeforeUs = watermark;
      return { ok: true, value: { processedBeforeUs, events: events.sort(compareInputs) } };
    },
    openPause(boundary) {
      if (fault) return { ok: false, error: fault };
      if (sealed || pauseBoundary !== null || !Number.isSafeInteger(boundary)
          || !Number.isSafeInteger(boundary + 1) || boundary + 1 < processedBeforeUs) {
        return halt('ERR-006', 'input.invalidPauseBoundary');
      }
      pauseBoundary = boundary;
      pending = pending.filter(input => {
        if (input.judgeTimeUs <= boundary) return true;
        pendingOrder.delete(orderKey(input));
        return false;
      });
      return { ok: true, value: undefined };
    },
    resumeGeneration(next) {
      if (fault) return { ok: false, error: fault };
      if (sealed || !Number.isSafeInteger(next) || next <= currentGeneration
          || (pauseBoundary === null ? processedBeforeUs !== Number.MIN_SAFE_INTEGER || pending.length > 0
            : processedBeforeUs !== pauseBoundary + 1 || pending.length > 0)) {
        return halt('ERR-006', 'input.invalidResume');
      }
      previousBoundaries.set(currentGeneration, pauseBoundary);
      resumeFloor = processedBeforeUs;
      pauseBoundary = null;
      currentGeneration = next;
      return { ok: true, value: undefined };
    },
    seal() {
      sealed = true;
      pending = [];
      pendingOrder.clear();
      seen.clear();
    },
  };
}
