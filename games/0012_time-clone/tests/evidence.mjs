import nodeAssert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();

function snapshot(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (entry === undefined) return { type: 'undefined' };
    if (entry instanceof RegExp) return { type: 'RegExp', source: entry.source, flags: entry.flags };
    if (entry instanceof Error) return { type: 'Error', name: entry.name, message: entry.message, code: entry.code };
    if (typeof entry === 'function') return { type: 'function', name: entry.name };
    if (typeof entry === 'bigint' || typeof entry === 'number' && !Number.isFinite(entry)) {
      return { type: typeof entry, value: String(entry) };
    }
    return entry;
  }));
}

function instrument(operator, original) {
  return function observed(...args) {
    const trace = context.getStore();
    if (!trace) return Reflect.apply(original, this, args);

    const location = {};
    Error.captureStackTrace(location, observed);
    const source = location.stack?.match(/\b(games\/0012_time-clone\/tests\/[^\s:]+:\d+:\d+)/)?.[1] ?? null;
    const compare = operator !== 'ok' && operator !== 'fail';
    let observation = args[0];
    let forwarded = args;
    if (operator === 'throws' && typeof args[0] === 'function') {
      observation = { threw: false };
      forwarded = [function (...params) {
        try {
          return Reflect.apply(args[0], this, params);
        } catch (error) {
          observation = { threw: true, error };
          throw error;
        }
      }, ...args.slice(1)];
    }
    const capture = (status, error) => {
      try {
        trace.assertions.push({
          operator, source, status,
          actual: snapshot(observation),
          expected: snapshot(compare ? args[1] : operator === 'ok' ? 'truthy' : undefined),
          ...(error ? { error: snapshot(error) } : {})
        });
      } catch (captureError) {
        trace.captureErrors.push({ operator, source, message: captureError.message });
      }
    };
    let value;
    try {
      value = Reflect.apply(original, this, forwarded);
    } catch (error) {
      capture('FAIL', error);
      throw error;
    }
    capture('PASS');
    return value;
  };
}

const assert = instrument('ok', nodeAssert);
for (const name of ['equal', 'deepEqual', 'notEqual', 'notDeepEqual', 'match', 'throws', 'fail']) {
  assert[name] = instrument(name, nodeAssert[name]);
}
export default assert;

export async function measure(run) {
  const trace = { assertions: [], captureErrors: [] };
  try {
    const detail = await context.run(trace, run);
    return { actual: { ...trace, ...(detail === undefined ? {} : { measurements: snapshot(detail) }) } };
  } catch (error) {
    return { actual: { ...trace, failure: snapshot(error) }, failed: true, stack: error?.stack };
  }
}
