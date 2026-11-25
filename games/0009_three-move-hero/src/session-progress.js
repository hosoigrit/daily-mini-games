const zero = { maxStars: 0, bestNoHintStars: 0 };

function combine(a = zero, b = zero) {
  return { maxStars: Math.max(a.maxStars, b.maxStars), bestNoHintStars: Math.max(a.bestNoHintStars, b.bestNoHintStars) };
}

export function createSessionProgress(manifest, storage, canPersist = true) {
  let disk;
  let status;
  let reason;
  let pending;
  let inFlight;
  const session = new Map();
  const queue = new Map();

  function observe(response) {
    if (response.data) disk = response.data;
    if (response.status === 'blocked') disk = undefined;
    ({ status, reason } = response);
    return response;
  }

  function load() {
    const response = storage.load();
    observe(response);
    if (!canPersist && ['empty', 'saved'].includes(response.status)) observe({ status: 'not_saved', reason: 'locks_unavailable' });
    if (response.status === 'blocked' && response.reason === 'invalid_save') {
      const raw = storage.previewRecovery().exportRaw;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Object.hasOwn(parsed, 'saveSchemaVersion') && parsed.saveSchemaVersion !== 2) {
            reason = 'unsupported_schema';
          }
        } catch { reason = 'invalid_json'; }
      }
    }
    return response;
  }

  function stages() {
    const written = new Map(storage.stageProgress(disk).map(item => [item.stageId, item]));
    return manifest.stages.map(stage => {
      const persisted = written.get(stage.stageId);
      const local = session.get(stage.stageId) ?? zero;
      const waiting = pending?.stageId === stage.stageId || inFlight?.stageId === stage.stageId || queue.has(stage.stageId);
      return {
        ...stage, persisted, local,
        unlocked: persisted.unlocked || session.has(stage.unlockAfter),
        unlockSource: persisted.unlocked ? 'persistent' : session.has(stage.unlockAfter) ? 'session' : 'locked',
        historicalUnlock: persisted.unlocked && stage.unlockAfter !== null &&
          !written.get(stage.unlockAfter)?.maxStars,
        waiting,
        sessionOnly: local.maxStars > persisted.maxStars || local.bestNoHintStars > persisted.bestNoHintStars,
      };
    });
  }

  async function write(request) {
    if (pending || inFlight) {
      queue.set(request.stageId, combine(queue.get(request.stageId), request));
      return { status: 'queued', reason: 'awaiting_earlier_save' };
    }
    inFlight = request;
    let response;
    try {
      response = await storage.save({ stageId: request.stageId, stars: request.stars, usedHint: request.usedHint });
    } catch {
      // An unexpected transport failure does not establish the result of a write.
      response = { status: 'unverified', reason: 'save_interrupted' };
    } finally { inFlight = undefined; }
    if (response.status === 'unverified') pending = request;
    return observe(response);
  }

  async function win({ stageId, stars, usedHint }) {
    const record = { maxStars: stars, bestNoHintStars: usedHint ? 0 : stars };
    session.set(stageId, combine(session.get(stageId), record));
    const response = await write({ stageId, stars, usedHint, ...record });
    if (response.status === 'saved' && !pending && !inFlight) await drain();
    if (response.status === 'not_saved' || response.status === 'blocked') queue.clear();
    return response;
  }

  async function recheck() {
    if (!pending || inFlight) return { status, reason };
    const request = pending;
    inFlight = request;
    let response;
    try { response = await storage.recheck(); }
    catch { response = { status: 'unverified', reason: 'read_failed' }; }
    finally { inFlight = undefined; }
    observe(response);
    if (response.status === 'blocked' || response.reason === 'no_pending_save') {
      pending = undefined;
      queue.clear(); // Session stars remain available. No automatic replay after an unsafe recheck.
    }
    if (response.status !== 'saved') return response;
    pending = undefined;
    return (await drain()) ?? response;
  }

  async function drain() {
    let response;
    for (const [stageId, record] of queue) {
      queue.delete(stageId);
      // Separate the two records only when a hinted win has the larger value.
      const first = record.bestNoHintStars || record.maxStars;
      const attempt = { stageId, stars: first, usedHint: !record.bestNoHintStars, maxStars: first,
        bestNoHintStars: record.bestNoHintStars };
      response = await write(attempt);
      if (record.maxStars > first) {
        if (response.status === 'saved') {
          response = await write({ stageId, stars: record.maxStars, usedHint: true,
            maxStars: record.maxStars, bestNoHintStars: 0 });
        } else if (response.status === 'unverified') {
          queue.set(stageId, combine(queue.get(stageId), record));
        }
      }
      if (response.status !== 'saved') {
        if (response.status !== 'unverified') queue.clear();
        break;
      }
    }
    return response;
  }

  function manage(response) {
    if (response.status === 'unverified') pending = {};
    return observe(response);
  }

  return { load, stages, win, recheck, manage, get pending() { return Boolean(pending); },
    get busy() { return Boolean(inFlight); }, get status() { return status; }, get reason() { return reason; } };
}
