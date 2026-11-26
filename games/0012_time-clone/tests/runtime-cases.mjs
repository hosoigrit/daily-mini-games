import assert from './evidence.mjs';
import { transition } from '../src/domain.mjs';
import { InputQueue, Session } from '../src/runtime.mjs';
import { golden, stage1 } from './adapter.mjs';
import { stages } from '../src/stages.mjs';

export class VirtualTime {
  now = () => this.elapsed;
  elapsed = 0;
  next = null;
  set = (callback, delay) => {
    assert.equal(this.next, null, 'one scheduled clock callback');
    this.next = { callback, due: this.elapsed + delay };
    return this.next;
  };
  clear = pending => {
    if (pending === this.next) this.next = null;
  };
  fire(lag = 0) {
    const job = this.next;
    assert(job, 'expected scheduled clock callback');
    this.next = null;
    this.elapsed = job.due + lag;
    job.callback();
  }

  wait(ms) {
    this.elapsed += ms;
    assert(!this.next || this.next.due > this.elapsed, 'test must explicitly execute due callbacks');
  }
}

const key = code => 'key:' + code;
const right = key('ArrowRight'), left = key('ArrowLeft'), up = key('ArrowUp');
function scenario({ stage = stage1, recording = true } = {}) {
  const t = new VirtualTime(), journal = [];
  const s = new Session(stage, { time: t, onChange: change => journal.push(change) });
  s.command('START_RECORD');
  if (!recording) {
    s.command('FINISH_RECORD');
    s.command('START_REPLAY');
  }
  const tap = (id, dir) => {
    const result = s.press(id, dir);
    s.input.release(id);
    return result;
  };
  const actions = () => journal.filter(x => x.type === 'TICK').map(x => x.audit.action);
  const ticks = (n, lag = 0) => {
    for (let i = 0; i < n; i++) t.fire(lag);
  };
  return { s, t, tap, ticks, actions, journal };
}

function fullQueue() {
  const f = scenario();
  f.tap(right, 'R');
  f.tap(up, 'U');
  assert.equal(f.s.press('pointer:5', 'L'), 'INPUT_REJECTED_FULL');
  return f;
}

function quarantineAt(tick, recording = true) {
  const f = scenario({ recording });
  f.s.press(right, 'R');
  f.ticks(tick);
  f.s.pause();
  f.s.visibility(false);
  return f;
}

const paused = (f, tick) => {
  assert.equal(f.s.logicalTick, tick);
  assert.equal(f.s.resumeRequired, true);
  assert.equal(f.s.canMove, false);
  assert.equal(f.t.next, null);
};

export function registerCorrectionRuntime(add) {
  const stops = [
    ['USER', f => f.s.pause('USER')],
    ['HIDDEN', f => f.s.visibility(true)],
    ['PERFORMANCE', f => f.t.fire(1000)],
    ['COMBINED', f => { f.t.fire(1000); f.s.pause('USER'); f.s.visibility(true); }],
    ['RESUME-PENDING', f => { f.s.visibility(true); f.s.visibility(false); }]
  ];
  for (const [reason, stop] of stops) {
    add('R01-F01-' + reason, () => {
      const f = scenario();
      f.tap(right, 'R');
      f.t.fire();
      f.s.command('FINISH_RECORD');
      f.s.command('START_REPLAY');
      f.tap(right, 'R');
      f.t.fire();
      stop(f);
      const record = f.s.state.ghostRecord;
      const state = f.s.state;
      const snapshot = () => ({
        state: f.s.state, tick: f.s.logicalTick, reasons: [...f.s.reasons],
        resumeRequired: f.s.resumeRequired, timer: f.t.next, now: f.t.now(),
        input: f.s.input.snapshot(), notifications: f.journal.length
      });
      const prior = structuredClone(snapshot());
      const rejected = [];
      for (const command of ['RETRY', 'RERECORD', 'START_REPLAY']) {
        rejected.push(f.s.command(command));
        assert.equal(rejected.at(-1), false);
        assert.equal(f.s.state, state);
        assert.equal(f.s.state.ghostRecord, record);
        assert.deepEqual(snapshot(), prior);
      }
      if (f.s.reasons.has('HIDDEN')) {
        assert.equal(f.s.resume(), false);
        assert.deepEqual(snapshot(), prior);
        f.s.visibility(false);
        assert.equal(f.s.command('RERECORD'), false);
        assert.equal(f.s.state.ghostRecord, record);
      }
      assert.equal(f.s.resume(), true);
      assert.equal(f.t.next.due, f.t.now() + 500);
      assert.equal(f.s.command('RETRY').state.phase, 'RECORDED');
      assert.equal(f.s.state.ghostRecord, record);
      assert.equal(f.s.command('RERECORD').state.phase, 'RECORDING');
      assert.equal(f.s.state.ghostRecord, null);
      return { before: prior, rejected, afterResume: { phase: f.s.state.phase, tick: f.s.logicalTick } };
    });
  }

  add('R01-F02-REJECTED-CANCEL-NODE', () => {
    const f = scenario();
    const pointer = 'pointer:1';
    assert.equal(f.tap(pointer, 'R'), 'ACCEPTED');
    assert.equal(f.tap(up, 'U'), 'ACCEPTED');
    const accepted = f.s.input.snapshot().queue;
    assert.equal(f.s.press(pointer, 'L'), 'INPUT_REJECTED_FULL');
    const rejected = f.s.input.snapshot().held[0];
    assert.notEqual(rejected.sequence, accepted[0].sequence);
    f.s.input.release(pointer, { cancelled: true });
    assert.deepEqual(f.s.input.snapshot().queue, accepted);
    f.ticks(3);
    assert.deepEqual(f.actions(), ['R', 'U', '.']);
    assert.deepEqual(f.s.state.playerPosition, [2, 1]);
    return { accepted, rejected, consumed: f.actions(), player: f.s.state.playerPosition };
  });

  add('R01-F02-ACCEPTED-CANCEL-NODE', () => {
    const queue = new InputQueue();
    assert.equal(queue.press('pointer:1', 'R'), 'ACCEPTED');
    queue.release('pointer:1');
    assert.equal(queue.press('pointer:1', 'L'), 'ACCEPTED');
    const before = queue.snapshot();
    queue.release('pointer:1', { cancelled: true });
    const after = queue.snapshot();
    assert.deepEqual(after.queue, [before.queue[0]]);
    assert.deepEqual(after.held, []);
    assert.deepEqual([queue.take(), queue.take()], ['R', '.']);
    return { before, after };
  });
}

export function registerRuntime(add) {
  for (const [id, source] of [['INP-01', 'pointer:1'], ['INP-02', right]]) {
    add(id, () => {
      const f = scenario();
      assert.equal(f.tap(source, 'R'), 'ACCEPTED');
      assert.deepEqual(f.s.input.snapshot().queue.map(x => x.direction), ['R']);
      f.ticks(2);
      assert.deepEqual(f.actions(), ['R', '.']);
      assert.deepEqual(f.s.state.playerPosition, [2, 1]);
    });
  }
  add('INP-03', () => {
    const f = scenario();
    f.s.press(right, 'R');
    f.ticks(3);
    assert.deepEqual(f.actions(), ['R', 'R', 'R']);
    assert.deepEqual(f.journal.filter(x => x.type === 'TICK').map(x => x.state.recordMoves), [1, 2, 3]);
  });
  add('INP-04', () => {
    const f = scenario();
    f.s.press(right, 'R');
    for (let i = 0; i < 10; i++) assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    assert.equal(f.s.input.snapshot().queue.length, 1);
    f.ticks(1);
    assert.equal(f.s.state.recordMoves, 1);
  });
  add('INP-05', () => {
    const f = scenario();
    f.s.press(right, 'R');
    f.ticks(1);
    f.tap(up, 'U');
    f.ticks(1);
    assert.deepEqual(f.actions(), ['R', 'U']);
    assert.deepEqual(f.s.state.playerPosition, [2, 1]);
  });
  add('INP-06', () => {
    const f = scenario();
    f.tap(right, 'R');
    f.tap(up, 'U');
    f.ticks(2);
    assert.deepEqual(f.actions(), ['R', 'U']);
    assert.equal(f.s.state.recordMoves, 1);
  });
  add('INP-07', () => {
    const f = fullQueue();
    const input = f.s.input.snapshot();
    assert.deepEqual(input.queue.map(x => x.direction), ['R', 'U']);
    assert.equal(input.held[0].accepted, false);
    assert.equal(f.journal.at(-1).type, 'INPUT_REJECTED_FULL');
  });
  add('INP-08', () => {
    const f = fullQueue();
    f.ticks(3);
    assert.deepEqual(f.actions(), ['R', 'U', '.']);
    assert.equal(f.s.input.snapshot().held[0].accepted, false);
    assert.deepEqual(f.s.state.playerPosition, [2, 1]);
  });
  add('INP-09', () => {
    const f = fullQueue();
    f.ticks(3);
    f.s.input.release('pointer:5');
    assert.equal(f.s.press('pointer:5', 'L'), 'ACCEPTED');
    assert.equal(f.s.input.snapshot().queue.length, 1);
    f.t.fire();
    assert.equal(f.actions().at(-1), 'L');
    assert.deepEqual(f.s.state.playerPosition, [1, 1]);
  });
  add('INP-10', () => {
    const f = scenario();
    f.s.press(right, 'R');
    f.s.press(up, 'U');
    f.ticks(3);
    assert.deepEqual(f.actions(), ['R', 'U', 'U']);
    f.s.input.release(up);
    f.t.fire();
    assert.equal(f.actions().at(-1), 'R');
  });
  add('INP-11', () => {
    const f = scenario();
    f.s.press(right, 'R');
    f.s.press(key('KeyD'), 'R');
    f.s.input.release(key('KeyD'));
    f.ticks(3);
    assert.deepEqual(f.actions(), ['R', 'R', 'R']);
    assert.deepEqual(f.s.input.snapshot().held.map(x => x.sourceId), [right]);
  });
  add('INP-12', () => {
    const f = scenario();
    f.s.press('pointer:2', 'R');
    f.s.input.release('pointer:2', { cancelled: true });
    assert.deepEqual(f.s.input.snapshot(), { queue: [], held: [], suppressed: [] });
    f.ticks(2);
    assert.deepEqual(f.actions(), ['.', '.']);
  });
  add('INP-14', () => {
    const f = scenario();
    f.tap(right, 'R');
    f.tap(up, 'U');
    f.s.pause('USER');
    assert.deepEqual(f.s.input.snapshot().queue, []);
    assert.equal(f.s.resume(), true);
    f.t.fire();
    assert.equal(f.s.state.recordTick, 1);
    assert.deepEqual(f.actions(), ['.']);
  });
  add('INP-15', () => {
    const f = scenario();
    f.tap(right, 'R');
    f.tap(up, 'U');
    f.s.command('FINISH_RECORD');
    f.s.command('START_REPLAY');
    f.t.fire();
    assert.deepEqual(f.actions(), ['.']);
    assert.deepEqual(f.s.state.playerPosition, stage1.start);
  });
  add('INP-16', () => {
    const f = scenario();
    f.t.fire();
    f.s.press(right, 'R');
    const first = f.s.state;
    f.t.fire();
    assert.deepEqual(f.actions(), ['.', 'R']);
    assert.deepEqual(first.playerPosition, stage1.start);
    assert.deepEqual(f.s.state.playerPosition, [2, 1]);
  });
  add('INP-17', () => {
    const f = scenario();
    f.s.press(up, 'U');
    f.ticks(3);
    assert.deepEqual(f.actions(), ['U', 'U', 'U']);
    assert.deepEqual(f.s.state.playerPosition, stage1.start);
    assert.equal(f.s.state.recordMoves, 0);
    assert(f.journal.filter(x => x.type === 'TICK').every(x => x.audit.blocked));
  });
  add('INP-18', () => {
    const f = scenario({ stage: stages[1] });
    const steps = golden[1].recordActions;
    for (const action of steps) {
      f.tap('input', action);
      f.t.fire();
    }
    f.s.command('FINISH_RECORD');
    f.s.command('START_REPLAY');
    f.s.press(right, 'R');
    f.ticks(8);
    const stepsFromFour = f.journal.filter(x => x.type === 'TICK' && x.state.phase === 'REPLAYING').slice(3);
    assert.deepEqual(stepsFromFour.map(x => x.audit.blocked), [true, true, true, true, false]);
    assert.deepEqual(stepsFromFour.map(x => x.state.replayMoves), [3, 3, 3, 3, 4]);
    assert.equal(stepsFromFour[3].state.doorStates.D, 'OPEN');
    assert.deepEqual(f.s.state.playerPosition, [5, 3]);
  });
  add('INP-19', () => {
    const f = scenario();
    f.s.press(right, 'R');
    f.s.command('FINISH_RECORD');
    f.s.command('START_REPLAY');
    assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    assert.deepEqual(f.s.input.snapshot().suppressed, [right]);
    f.t.fire();
    assert.equal(f.actions().at(-1), '.');
    f.s.input.release(right);
    assert.equal(f.s.press(right, 'R'), 'ACCEPTED');
    f.t.fire();
    assert.equal(f.actions().at(-1), 'R');
  });
  add('INP-20', () => {
    const f = quarantineAt(1);
    assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    f.t.wait(10000);
    paused(f, 1);
    assert.deepEqual(f.s.input.snapshot().suppressed, [right]);
    assert.equal(f.s.resume(), true);
    f.t.fire();
    assert.equal(f.actions().at(-1), '.');
  });
  add('INP-21', () => {
    const f = quarantineAt(3);
    assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    paused(f, 3);
    assert.deepEqual(f.s.input.snapshot(), { queue: [], held: [], suppressed: [right] });
  });
  add('INP-22', () => {
    const f = quarantineAt(2);
    for (let i = 0; i < 10; i++) assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    assert.deepEqual(f.s.input.snapshot(), { queue: [], held: [], suppressed: [right] });
    paused(f, 2);
  });
  add('INP-24', () => {
    const f = quarantineAt(1);
    f.s.rearm();
    assert.equal(f.s.resume(), true);
    assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    assert.equal(f.s.press(right, 'R'), 'ACCEPTED');
    assert.equal(f.s.input.snapshot().queue.length, 1);
    f.t.fire();
    assert.equal(f.actions().at(-1), 'R');
    assert.equal(f.s.state.recordMoves, 2);
  });
  add('INP-25', () => {
    for (const cancel of [false, true]) {
      const f = scenario();
      f.s.press('pointer:6', 'R');
      if (cancel) f.s.input.release('pointer:6', { cancelled: true });
      else f.s.visibility(true);
      if (!cancel) {
        assert.equal(f.s.command('FINISH_RECORD'), false);
        assert.deepEqual(f.s.input.snapshot().suppressed, ['pointer:6']);
        f.s.visibility(false);
        assert.equal(f.s.command('FINISH_RECORD'), false);
        assert.equal(f.s.resume(), true);
      }
      f.s.command('FINISH_RECORD');
      f.s.command('START_REPLAY');
      if (!cancel) assert.deepEqual(f.s.input.snapshot().suppressed, ['pointer:6']);
      f.s.input.release('pointer:6');
      f.t.fire();
      assert.deepEqual(f.actions(), ['.']);
      assert.equal(f.s.press('pointer:6', 'R'), 'ACCEPTED');
      f.t.fire();
      assert.equal(f.actions().at(-1), 'R');
    }
  });

  add('TIM-01', () => {
    const f = scenario();
    f.t.fire();
    assert.equal(f.s.logicalTick, 1);
    assert.equal(f.t.next.due, 1000);
    assert.equal(f.actions().length, 1);
  });
  for (const [id, tick] of [['TIM-02', 1], ['TIM-03', 3]]) {
    add(id, () => {
      const f = scenario();
      f.t.fire();
      const previous = f.s.state, copy = structuredClone(previous);
      assert.throws(() => transition(stage1, previous, 'R', tick), { message: 'ERR_TICK_INVALID' });
      assert.deepEqual(f.s.state, copy);
    });
  }
  add('TIM-04', () => {
    const f = scenario();
    f.t.fire(20);
    assert.equal(f.s.logicalTick, 1);
    assert.equal(f.t.next.due, 1020);
    assert.equal(f.actions().length, 1);
  });
  add('TIM-05', () => {
    const f = scenario();
    const before = f.s.state;
    f.t.fire(1000);
    assert(f.s.reasons.has('PERFORMANCE'));
    assert.equal(f.s.state, before);
    paused(f, 0);
  });
  add('TIM-06', () => {
    const f = scenario({ recording: false });
    f.ticks(3);
    const before = f.s.state;
    f.s.pause('USER');
    f.t.wait(10000);
    paused(f, 3);
    assert.equal(f.s.state, before);
  });
  for (const id of ['TIM-07', 'TIM-20']) add(id, () => {
    const f = scenario();
    f.ticks(3);
    f.s.press(right, 'R');
    f.t.fire(1000);
    paused(f, 3);
    f.t.wait(10000);
    assert.equal(f.s.resume(), true);
    assert.equal(f.t.next.due, f.t.elapsed + 500);
    f.t.fire();
    assert.equal(f.s.logicalTick, 4);
    assert.deepEqual(f.actions(), ['.', '.', '.', '.']);
    assert.equal(f.journal.at(-1).timing.cumulativeLagMs, 0);
  });
  add('TIM-08', () => {
    const f = scenario();
    f.ticks(2);
    f.s.pause('USER');
    f.t.wait(5000);
    paused(f, 2);
    assert.deepEqual([...f.s.reasons], ['USER']);
  });
  add('TIM-09', () => {
    const f = scenario();
    f.ticks(2);
    f.s.visibility(true);
    f.s.visibility(false);
    paused(f, 2);
    assert.deepEqual([...f.s.reasons], []);
  });
  add('TIM-10', () => {
    const f = scenario();
    f.s.press(right, 'R');
    f.t.fire(1000);
    assert(f.s.reasons.has('PERFORMANCE'));
    assert.deepEqual(f.s.input.snapshot(), { queue: [], held: [], suppressed: [right] });
  });
  for (const id of ['TIM-11', 'PSE-01', 'PSE-05']) add(id, () => {
    const f = scenario({ recording: false });
    f.ticks(2);
    f.s.pause('USER');
    f.s.visibility(true);
    assert.deepEqual([...f.s.reasons], ['USER', 'HIDDEN']);
    f.s.visibility(false);
    if (id === 'PSE-05') f.s.rearm();
    assert.deepEqual([...f.s.reasons], ['USER']);
    paused(f, 2);
  });
  add('TIM-12', () => {
    const f = scenario();
    f.ticks(2);
    f.s.pause('USER');
    assert.equal(f.s.press(right, 'R'), 'IGNORED');
    assert.deepEqual(f.s.input.snapshot().queue, []);
    f.t.wait(5000);
    assert.equal(f.s.resume(), true);
    f.t.fire();
    assert.equal(f.actions().at(-1), '.');
    assert.equal(f.s.state.recordMoves, 0);
  });

  for (const [id, lags, count, cumulative, elapsed, reasons] of [
    ['TIM-13', Array(4).fill(200), 3, 600, 2800, ['CUMULATIVE_LAG']],
    ['TIM-14', Array(4).fill(20), 4, 80, 2080, []],
    ['TIM-15', Array(16).fill(20), 16, 320, 8320, []],
    ['TIM-16', Array(8).fill(100), 7, 700, 4800, ['CUMULATIVE_LAG']],
    ['TIM-17', [400, 400], 1, 400, 1800, ['CUMULATIVE_LAG']],
    ['TIM-18', [1000], 0, 0, 1500, ['SINGLE_LAG', 'CUMULATIVE_LAG']],
    ['TIM-19', [...Array(7).fill(100), 50], 7, 700, 4750, ['CUMULATIVE_LAG']]
  ]) add(id, () => {
    const f = scenario();
    for (const lag of lags) f.t.fire(lag);
    const progress = f.journal.filter(x => x.type === 'TICK');
    const stops = f.journal.filter(x => x.type === 'PAUSE');
    const measurement = f.journal.at(-1).timing;
    assert.equal(f.s.state.recordTick, count);
    assert.equal(progress.length, count);
    assert.deepEqual(progress.map(x => x.checkpoint.recordTick), Array.from({ length: count }, (_, i) => i + 1));
    assert.equal(measurement.cumulativeLagMs, cumulative);
    assert.equal(measurement.activeElapsedMs, elapsed);
    assert.deepEqual(measurement.triggerReasons, reasons);
    assert.equal(stops.length, Number(Boolean(reasons.length)));
    if (reasons.length) {
      assert.equal(stops[0].reason, 'PERFORMANCE');
      paused(f, count);
      f.t.wait(10000);
      assert.equal(f.s.logicalTick, count);
      assert.deepEqual(f.s.state.playerPosition, stage1.start);
    }
    return { logicalTicks: count, timing: f.journal.filter(x => x.timing).map(x => x.timing) };
  });
  add('PSE-02', () => {
    const f = scenario({ recording: false });
    f.ticks(2);
    f.s.visibility(true);
    assert.equal(f.s.resume(), false);
    assert.deepEqual([...f.s.reasons], ['HIDDEN']);
    paused(f, 2);
  });
  add('PSE-03', () => {
    const f = scenario({ recording: false });
    f.ticks(2);
    f.t.fire(1000);
    f.s.pause('USER');
    assert.deepEqual([...f.s.reasons], ['PERFORMANCE', 'USER']);
    f.s.visibility(true);
    assert.equal(f.s.resume(), false);
    f.s.visibility(false);
    assert.equal(f.s.resume(), true);
    assert.equal(f.s.reasons.size, 0);
    assert.equal(f.t.next.due, f.t.elapsed + 500);
    f.t.fire();
    assert.equal(f.s.logicalTick, 3);
  });
  add('PSE-04', () => {
    const f = quarantineAt(2, false);
    paused(f, 2);
    assert.deepEqual([...f.s.reasons], []);
    assert.equal(f.s.press(right, 'R', { repeat: true }), 'IGNORED');
    assert.deepEqual(f.s.input.snapshot().suppressed, [right]);
  });
}
