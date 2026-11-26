import { activePhase, directions, initialState, transition } from './domain.mjs';

export const TICK_MS = 500;
export const INPUT_CAPACITY = 2;
export const SINGLE_LAG_MS = 1000;
export const CUMULATIVE_LAG_MS = 750;
export const keyboardDirections = Object.freeze({
  ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D',
  ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R'
});

export class InputQueue {
  #sources = new Map();
  #queue = [];
  #suppressed = new Set();
  #sequence = 0;

  press(sourceId, direction, { repeat = false, enabled = true } = {}) {
    if (!Object.hasOwn(directions, direction) || direction === '.' || repeat ||
        this.#sources.has(sourceId) || this.#suppressed.has(sourceId)) return 'IGNORED';
    if (!enabled) {
      this.#suppressed.add(sourceId);
      return 'IGNORED';
    }
    const accepted = this.#queue.length < INPUT_CAPACITY;
    const item = { sourceId, direction, accepted, sequence: ++this.#sequence };
    this.#sources.set(sourceId, item);
    if (!accepted) return 'INPUT_REJECTED_FULL';
    this.#queue.push(item);
    return 'ACCEPTED';
  }

  release(sourceId, { cancelled = false } = {}) {
    this.#sources.delete(sourceId);
    this.#suppressed.delete(sourceId);
    if (cancelled) this.#queue = this.#queue.filter(item => item.sourceId !== sourceId);
  }

  take() {
    const pending = this.#queue.shift();
    if (pending) return pending.direction;
    const held = [...this.#sources.values()].findLast(item => item.accepted);
    return held?.direction ?? '.';
  }

  quarantine() {
    for (const sourceId of this.#sources.keys()) this.#suppressed.add(sourceId);
    this.#sources.clear();
    this.#queue = [];
  }

  reset() {
    this.#sources.clear();
    this.#queue = [];
    this.#suppressed.clear();
  }

  snapshot() {
    return {
      queue: this.#queue.map(x => ({ ...x })),
      held: [...this.#sources.values()].map(x => ({ ...x })),
      suppressed: [...this.#suppressed]
    };
  }
}

export const browserTime = {
  now: () => performance.now(),
  set: (callback, delay) => setTimeout(callback, delay),
  clear: id => clearTimeout(id)
};

export class LogicalClock {
  #timer;
  #generation = 0;
  #start;
  #sum;

  constructor(time, tick, onDelay) {
    this.time = time;
    this.tick = tick;
    this.onDelay = onDelay;
  }

  start() {
    this.stop();
    this.#sum = 0;
    this.#start = this.time.now();
    this.#schedule(this.#start + TICK_MS, this.#generation);
  }

  stop() {
    this.#generation++;
    if (this.#timer !== undefined) this.time.clear(this.#timer);
    this.#timer = undefined;
  }

  #schedule(scheduledAt, generation) {
    this.#timer = this.time.set(() => {
      if (generation !== this.#generation) return;
      this.#timer = undefined;
      const actualNow = this.time.now();
      if (actualNow < scheduledAt) {
        this.#schedule(scheduledAt, generation);
        return;
      }
      const lagMs = actualNow - scheduledAt;
      const pendingLagMs = this.#sum + lagMs;
      const triggerReasons = [];
      if (lagMs >= SINGLE_LAG_MS) triggerReasons.push('SINGLE_LAG');
      if (pendingLagMs >= CUMULATIVE_LAG_MS) triggerReasons.push('CUMULATIVE_LAG');
      const timing = {
        scheduledAt, actualNow, lagMs, pendingLagMs,
        cumulativeLagMs: triggerReasons.length ? this.#sum : pendingLagMs,
        activeElapsedMs: actualNow - this.#start, triggerReasons
      };
      if (triggerReasons.length) {
        this.stop();
        this.onDelay(timing);
        return;
      }
      this.#sum = pendingLagMs;
      if (this.tick(timing) && generation === this.#generation) {
        this.#schedule(this.time.now() + TICK_MS, generation);
      }
    }, Math.max(0, scheduledAt - this.time.now()));
  }
}

export class Session {
  constructor(stage, { time = browserTime, onChange = () => {}, onClear = () => {} } = {}) {
    this.stage = stage;
    this.state = initialState(stage);
    this.input = new InputQueue();
    this.reasons = new Set();
    this.resumeRequired = false;
    this.onChange = onChange;
    this.onClear = onClear;
    this.clock = new LogicalClock(time, timing => this.#tick(timing), timing => {
      this.pause('PERFORMANCE', timing);
    });
  }

  get canMove() {
    return activePhase(this.state.phase) && !this.resumeRequired && this.reasons.size === 0;
  }

  get logicalTick() {
    return this.state.phase === 'RECORDING' ? this.state.recordTick : this.state.replayTick;
  }

  command(command) {
    const next = transition(this.stage, this.state, command);
    this.clock.stop();
    this.input.quarantine();
    this.state = next.state;
    if (this.canMove) this.clock.start();
    this.onChange({ type: 'COMMAND', command, ...next });
    return next;
  }

  #tick(timing) {
    if (!this.canMove) return false;
    const before = this.state;
    const logicalTick = this.logicalTick + 1;
    const next = transition(this.stage, before, this.input.take(), logicalTick);
    this.state = next.state;
    if (before.phase !== this.state.phase) this.input.quarantine();
    if (this.state.clearResult) this.onClear(this.state.clearResult);
    this.onChange({ type: 'TICK', ...next, before, timing: { ...timing, logicalTick } });
    return this.canMove;
  }

  press(source, direction, options = {}) {
    const status = this.input.press(source, direction, { ...options, enabled: this.canMove });
    if (status === 'INPUT_REJECTED_FULL') this.onChange({ type: status });
    return status;
  }

  pause(reason = null, timing = null) {
    if (reason) this.reasons.add(reason);
    this.resumeRequired = true;
    this.clock.stop();
    this.input.quarantine();
    const clockStop = timing && { ...timing, logicalTick: this.logicalTick, pauseReason: reason, error: 'ERR_CLOCK_DELAY' };
    this.onChange({ type: 'PAUSE', reason, timing: clockStop });
  }

  visibility(hidden) {
    if (hidden) {
      this.pause('HIDDEN');
    } else {
      this.reasons.delete('HIDDEN');
      this.onChange({ type: 'VISIBLE' });
    }
  }

  rearm() {
    if (!this.resumeRequired) this.pause();
    this.input.reset();
    this.onChange({ type: 'INPUT_RESET' });
  }

  resume() {
    if (this.reasons.has('HIDDEN') || !this.resumeRequired) return false;
    this.reasons.clear();
    this.resumeRequired = false;
    if (this.canMove) this.clock.start();
    this.onChange({ type: 'RESUME' });
    return true;
  }

  dispose() {
    this.clock.stop();
    this.input.reset();
  }
}
