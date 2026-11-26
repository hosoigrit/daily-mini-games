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
  seal(): void;
}

export function createInputQueue(sessionId: string, generation: Gen, closeJudgeUs: Us, offsetUs = 0 as Us): InputQueue {
  let processedBeforeUs = Number.MIN_SAFE_INTEGER as Us;
  let delaysOver50Ms = 0;
  let lateInputs = 0;
  let sealed = false;
  let fault: GameError | null = null;
  let pending: NormalizedInput[] = [];
  const seen = new Set<string>();
  const pendingOrder = new Set<string>();
  const orderKey = (input: NormalizedInput) => `${input.judgeTimeUs}/${input.sequence}`;

  function halt(code: 'ERR-006' | 'ERR-007', key: string) {
    const failure = inputFailure(code, key, sessionId);
    if (!failure.ok) fault = failure.error;
    return failure;
  }

  return {
    get processedBeforeUs() { return processedBeforeUs; },
    get delaysOver50Ms() { return delaysOver50Ms; },
    get lateInputs() { return lateInputs; },
    enqueueInput(input) {
      if (!input || typeof input.sessionId !== 'string' || !input.sessionId.trim()
          || !Number.isSafeInteger(input.clockGeneration) || input.clockGeneration < 0) {
        return inputFailure('ERR-018', 'input.invalidContext', sessionId);
      }
      const receipt = (reason: InputReceipt['reason']): Result<InputReceipt> => ({
        ok: true, value: { eventId: input.eventId, accepted: reason === 'QUEUED', reason },
      });

      if (input.sessionId !== sessionId || input.clockGeneration !== generation) return receipt('STALE_SESSION');
      if (sealed) return receipt('IGNORED_STATE');
      if (seen.has(input.eventId)) return receipt('DUPLICATE');
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
      if (input.receivedPerformanceMs - input.eventPerformanceMs > deliveryWaitUs / 1000) delaysOver50Ms++;
      if (input.judgeTimeUs < processedBeforeUs) {
        lateInputs++;
        return halt('ERR-007', 'input.lateEvent');
      }

      const key = orderKey(input);
      if (pendingOrder.has(key)) return inputFailure('ERR-018', 'input.ambiguousSequence', sessionId);
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
    seal() {
      sealed = true;
      pending = [];
      pendingOrder.clear();
      seen.clear();
    },
  };
}
