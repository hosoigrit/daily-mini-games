import assert from './evidence.mjs';
import { defineStage, directions, initialState, move, score, transition, validateRecord } from '../src/domain.mjs';
import { stages } from '../src/stages.mjs';
import { Session } from '../src/runtime.mjs';
import { VirtualTime } from './runtime-cases.mjs';
import { fixtures, fixtureStage, golden, runCase, runFixture, stage1, TestAdapter, variant, verifyGolden } from './adapter.mjs';
import { verifyH01 } from './verify-h01.mjs';

const basic = () => new TestAdapter(stage1);
const fixture = i => runFixture(fixtures[i]);
const corridor = () => new TestAdapter(fixtureStage(fixtures[0]));
const padded = actions => {
  const a = basic();
  a.record(actions);
  return a;
};
const from = (i, n) => runCase(i, n).adapter;
const bad = (f, code) => assert.throws(f, { message: code });

function checkEarly(actions) {
  const a = basic();
  a.execute('START_RECORD');
  const real = [...actions].map(input => a.step(input));
  a.execute('FINISH_RECORD');
  const record = a.state.ghostRecord, moves = Math.min(actions.length, 2);
  assert.equal(a.state.phase, 'RECORDED');
  assert.equal(record.recordCompletedTicks, actions.length);
  assert.equal(record.positions.length, 17);
  assert.equal(record.recordedMoveCount, moves);
  const actual = [stage1.start, ...real.map(x => x.checkpoint.playerPosition)];
  assert.deepEqual(actual, Array.from({ length: actual.length }, (_, tick) => [1 + Math.min(tick, 2), 1]));
  assert.deepEqual(record.positions.slice(0, actual.length), actual);
  assert(record.positions.slice(actual.length).every(p => p === actual.at(-1)));
  assert.equal(real.length, actions.length);
  assert.equal(a.state.recordMoves, moves);
}

export function registerDomain(add) {
  add('T1-H01', verifyH01);
  golden.forEach((c, i) => add(c.caseId, () => verifyGolden(i)));
  for (const [index, actions] of ['', 'R', 'RR.....', 'RR.............'].entries()) {
    add('REC-0' + (index + 1), () => checkEarly(actions));
  }
  add('REC-05', () => {
    const a = padded('RR' + '.'.repeat(14));
    assert.equal(a.state.phase, 'RECORDED');
    assert.equal(a.state.ghostRecord.recordCompletedTicks, 16);
    assert.equal(a.state.ghostRecord.positions.length, 17);
    assert.equal(a.state.recordMoves, 2);
    bad(() => a.step('.'), 'ERR_PHASE_INVALID');
  });
  add('REC-06', () => {
    const a = basic();
    a.execute('START_RECORD');
    const step = a.step('L');
    assert.equal(step.state.recordTick, 1);
    assert.deepEqual(step.state.positions, [[1, 1], [1, 1]]);
    assert.equal(step.state.recordMoves, 0);
    assert.equal(step.audit.blocked, true);
  });
  add('REC-07', () => {
    const a = new TestAdapter(fixtureStage(fixtures[2]));
    const trace = a.record('R'.repeat(16));
    assert.deepEqual(trace.at(-1).checkpoint.playerPosition, a.stage.goal);
    assert.equal(trace.at(-1).checkpoint.recordTick, 16);
    assert.equal(a.state.phase, 'RECORDED');
    assert.equal(a.state.ghostRecord.positions.length, 17);
    assert(trace.every(step => !step.events.includes('CLEARED')));
  });
  add('REC-08', () => {
    const a = padded('RR');
    assert.equal(a.state.phase, 'RECORDED');
    assert.deepEqual(a.state.playerPosition, stage1.start);
    assert.equal(a.state.ghostPosition, null);
    assert.equal(a.state.doorStates.D, 'CLOSED');
    assert.deepEqual(a.state.ghostRecord.positions[16], [3, 1]);
    assert.equal(a.state.recordMoves, 2);
  });
  add('REC-09', () => {
    const a = from(0, 3), preserved = a.state.ghostRecord;
    a.execute('RETRY');
    assert.equal(a.state.phase, 'RECORDED');
    assert.equal(a.state.ghostRecord, preserved);
    assert.equal(a.state.recordMoves, 2);
    assert.equal(a.state.replayMoves, 0);
    assert.deepEqual(a.state.playerPosition, stage1.start);
    assert.equal(a.state.doorStates.D, 'CLOSED');
  });
  add('REC-10', () => {
    const a = padded('RR');
    a.execute('RERECORD');
    a.step('U');
    assert.equal(a.state.phase, 'RECORDING');
    assert.equal(a.state.recordTick, 1);
    assert.equal(a.state.ghostRecord, null);
    assert.equal(a.state.recordMoves, 0);
    assert.deepEqual(a.state.positions, [[1, 1], [1, 1]]);
  });
  add('GHO-01', () => {
    golden.forEach((_, i) => {
      const { replay, ghostRecord } = runCase(i);
      for (const step of replay) {
        const t = step.state.replayTick;
        if (t < 16 || (t === 16 && step.state.phase === 'CLEARED')) {
          assert.deepEqual(step.state.ghostPosition, ghostRecord.positions[t]);
        } else if (t === 16) {
          assert.deepEqual(step.audit.ghostBeforeDisappearance, ghostRecord.positions[t]);
          assert.equal(step.state.ghostPosition, null);
        }
      }
    });
  });
  add('GHO-02', () => {
    const { state } = from(0, 1);
    assert.deepEqual(state.playerPosition, [2, 1]);
    assert.deepEqual(state.ghostPosition, state.playerPosition);
  });
  add('GHO-03', () => {
    const a = new TestAdapter(fixtureStage(variant));
    a.record(variant.record.actions);
    assert.deepEqual(a.state.ghostRecord.positions, variant.record.positions);
    const step = a.replay(variant.replay.actions).at(-1);
    const { atTick16, ghostBeforeDisappearance } = variant.replay.assertions;
    assert.deepEqual(step.state.playerPosition, atTick16.player);
    assert.deepEqual(step.state.ghostPosition, atTick16.ghost);
    assert.equal(step.state.phase, atTick16.phase);
    assert.equal(Boolean(step.state.clearResult), atTick16.cleared);
    assert.deepEqual(step.audit.ghostBeforeDisappearance, ghostBeforeDisappearance);
    assert.deepEqual(step.events, ['GHOST_DISAPPEARED']);
  });
  add('GHO-04', () => {
    const { replay } = runCase(5, 16);
    const { state, events, audit } = replay[16];
    assert.equal(state.ghostPosition, null);
    assert.equal(state.phase, 'SOLO_CONTINUE');
    assert.deepEqual(events, ['GHOST_DISAPPEARED', 'SW_b_OFF', 'DOOR_B_CLOSED']);
    assert.deepEqual(state.playerPosition, audit.playerBeforeDisappearance);
    assert.deepEqual(state.playerPosition, [golden[5].replaySnapshots[16].player.x, golden[5].replaySnapshots[16].player.y]);
  });
  add('GHO-05', () => {
    const a = from(5, 16);
    assert.equal(a.state.phase, 'SOLO_CONTINUE');
    for (const direction of 'UUUR') {
      const step = a.step(direction);
      assert.equal(step.state.ghostPosition, null);
    }
    assert.equal(a.state.replayTick, 20);
    assert.equal(a.state.phase, 'CLEARED');
    assert.deepEqual(a.state.playerPosition, a.stage.goal);
  });
  add('GHO-06', () => {
    const a = new TestAdapter(fixtureStage(fixtures[2]));
    a.record('.'.repeat(16));
    const step = a.replay('R'.repeat(16)).at(-1);
    assert.equal(step.state.replayTick, 16);
    assert.equal(step.state.phase, 'CLEARED');
    assert.deepEqual(step.state.ghostPosition, a.stage.start);
    assert.deepEqual(step.events, ['CLEARED']);
  });
  add('GHO-07', () => {
    const { adapter, replay, ghostRecord } = runCase(0, 4);
    const a = adapter;
    a.execute('RETRY');
    assert.equal(a.state.ghostRecord, ghostRecord);
    assert.equal(a.state.replayMoves, 0);
    const initial = a.execute('START_REPLAY');
    const newRun = [initial, ...[...'RRRR'].map(dir => a.step(dir))];
    assert.deepEqual(newRun.map(x => x.state.ghostPosition), replay.map(x => x.state.ghostPosition));
  });

  add('MEC-01', () => {
    const a = corridor();
    a.execute('START_RECORD');
    const step = a.step('U');
    assert.deepEqual(step.state.playerPosition, [1, 1]);
    assert.equal(step.state.recordMoves, 0);
    assert.deepEqual(step.events, ['MOVE_BLOCKED']);
  });
  add('MEC-02', () => {
    const a = corridor();
    a.execute('START_RECORD');
    assert.deepEqual(a.step('L').state.playerPosition, [1, 1]);
    const edge = defineStage({ id: 'edge', mapRows: ['SG'], doorRules: {}, goldThreshold: 1, silverThreshold: 2 });
    const e = new TestAdapter(edge);
    e.execute('START_RECORD');
    const step = e.step('L');
    assert.deepEqual(step.state.playerPosition, [0, 0]);
    assert.equal(step.state.recordMoves, 0);
    assert.equal(step.audit.blocked, true);
  });
  add('MEC-03', () => assert.deepEqual(move(corridor().stage, [2, 1], { D: 'CLOSED' }, 'R'), { position: [2, 1], blocked: true, moved: false }));
  add('MEC-04', () => {
    const a = corridor();
    a.execute('START_RECORD');
    assert.equal(a.step('R').state.doorStates.D, 'OPEN');
    const step = a.step('R');
    assert.deepEqual(step.state.playerPosition, [3, 1]);
    assert.equal(step.state.recordMoves, 2);
  });
  add('MEC-05', () => {
    const a = corridor();
    a.execute('START_RECORD');
    const step = a.step('R');
    assert.equal(step.state.switchStates.a, true);
    assert.equal(step.state.doorStates.D, 'OPEN');
    assert.deepEqual(step.events, ['SW_a_ON', 'DOOR_D_OPEN']);
  });
  add('MEC-06', () => {
    const { state } = fixture(0).replay[0];
    assert.equal(state.switchStates.a, true);
    assert.deepEqual(state.playerPosition, [1, 1]);
    assert.equal(state.doorStates.D, 'OPEN');
  });
  add('MEC-07', () => {
    const { replay } = runCase(0, 2);
    const step = replay[2];
    assert.equal(step.state.switchStates.a, true);
    assert.deepEqual(step.state.playerPosition, step.state.ghostPosition);
    assert.deepEqual(step.events, ['SW_a_ON', 'DOOR_D_OPEN']);
  });
  add('MEC-08', () => {
    const step = fixture(0).replay[1];
    assert.equal(step.state.switchStates.a, false);
    assert.equal(step.state.doorStates.D, 'CLOSED');
    assert.deepEqual(step.events, ['SW_a_OFF', 'DOOR_D_CLOSED']);
  });
  add('MEC-09', () => {
    const a = from(2, 3);
    const step = a.step('.');
    assert.deepEqual(step.events, ['SW_a_ON', 'LATCH_L_UNLOCK', 'DOOR_L_OPEN']);
    assert.equal(step.state.unlockFlags.L, true);
  });
  add('MEC-10', () => {
    const a = from(2, 4);
    a.step('U');
    for (let tick = 6; tick <= 16; tick++) a.step('.');
    assert.deepEqual(a.state.switchStates, { a: false, b: false });
    assert.equal(a.state.unlockFlags.L, true);
    assert.equal(a.state.doorStates.L, 'OPEN');
  });
  add('MEC-11', () => {
    const a = from(2, 4);
    a.execute('RETRY');
    assert.equal(a.state.unlockFlags.L, false);
    assert.equal(a.state.doorStates.L, 'CLOSED');
    assert.deepEqual(a.state.playerPosition, a.stage.start);
  });
  add('MEC-12', () => {
    const step = fixture(1).replay[1];
    assert.deepEqual(step.state.playerPosition, [3, 1]);
    assert.equal(step.state.doorStates.D, 'HELD_OPEN');
  });
  add('MEC-13', () => {
    const step = fixture(1).replay[3];
    assert.deepEqual(step.state.playerPosition, [4, 1]);
    assert.equal(step.state.doorStates.D, 'CLOSED');
  });
  add('MEC-14', () => {
    for (const command of ['.', 'U']) {
      const a = corridor();
      a.record('RRR');
      a.replay('RR');
      const step = a.step(command);
      assert.deepEqual(step.state.playerPosition, [3, 1]);
      assert.equal(step.state.doorStates.D, 'HELD_OPEN');
    }
  });
  add('MEC-15', () => {
    const step = fixture(0).replay[1];
    assert.deepEqual(step.state.ghostPosition, [3, 1]);
    assert.equal(step.state.doorStates.D, 'CLOSED');
    assert(!step.events.some(event => event.endsWith('_HELD_OPEN')));
  });
  add('MEC-16', () => assert.deepEqual(move(corridor().stage, [2, 1], { D: 'HELD_OPEN' }, 'R'), { position: [2, 1], moved: false, blocked: true }));
  add('MEC-17', () => {
    const a = from(1, 6);
    const opening = a.step('R');
    assert.deepEqual(opening.state.playerPosition, [4, 3]);
    assert.equal(opening.audit.blocked, true);
    assert.equal(opening.state.doorStates.D, 'OPEN');
    assert.deepEqual(a.step('R').state.playerPosition, [5, 3]);
  });

  add('PHS-01', () => {
    const a = basic();
    assert.equal(a.state.phase, 'READY');
    a.execute('START_RECORD');
    assert.equal(a.state.phase, 'RECORDING');
    assert.equal(a.state.recordTick, 0);
    assert.deepEqual(a.state.positions, [stage1.start]);
  });
  add('PHS-02', () => {
    const { state } = padded('RR');
    assert.equal(state.phase, 'RECORDED');
    assert.deepEqual(state.playerPosition, stage1.start);
    assert.equal(state.doorStates.D, 'CLOSED');
    assert.equal(state.ghostRecord.positions.length, 17);
  });
  add('PHS-03', () => {
    const a = padded('RR');
    a.execute('START_REPLAY');
    assert.equal(a.state.phase, 'REPLAYING');
    assert.deepEqual(a.state.ghostPosition, stage1.start);
    assert.equal(a.state.replayTick, 0);
  });
  add('PHS-04', () => {
    const a = from(5, 15);
    const step = a.step(golden[5].replayActions[15]);
    assert.equal(step.state.phase, 'SOLO_CONTINUE');
    assert.equal(step.state.ghostPosition, null);
    assert.equal(step.state.doorStates.B, 'CLOSED');
    assert.deepEqual(step.events, ['GHOST_DISAPPEARED', 'SW_b_OFF', 'DOOR_B_CLOSED']);
  });
  add('PHS-05', () => {
    const a = from(0, 5);
    const step = a.step('R');
    assert.equal(step.state.phase, 'CLEARED');
    assert.equal(step.state.clearResult.totalMoves, 8);
    bad(() => a.step('.'), 'ERR_PHASE_INVALID');
    assert.equal(a.state.replayTick, 6);
  });
  add('PHS-06', () => {
    const a = from(5, 19);
    assert.equal(a.state.phase, 'SOLO_CONTINUE');
    a.step('R');
    assert.equal(a.state.phase, 'CLEARED');
    assert.equal(a.state.ghostPosition, null);
  });
  add('PHS-07', () => {
    const a = from(0, 3), before = a.state.ghostRecord;
    a.execute('RETRY');
    assert.equal(a.state.phase, 'RECORDED');
    assert.equal(a.state.ghostRecord, before);
    assert(Object.isFrozen(before) && Object.isFrozen(before.positions) && before.positions.every(Object.isFrozen));
    assert.equal(a.state.recordMoves, 2);
    assert.equal(a.state.replayMoves, 0);
  });
  add('PHS-08', () => {
    const a = from(0, 3);
    a.execute('RERECORD');
    assert.equal(a.state.phase, 'RECORDING');
    assert.equal(a.state.ghostRecord, null);
    assert.equal(a.state.recordMoves, 0);
  });
  add('PHS-09', () => {
    const a = basic(), before = a.state;
    bad(() => a.execute('START_REPLAY'), 'ERR_PHASE_INVALID');
    assert.equal(a.state, before);
  });
  add('PHS-10', () => {
    const a = from(0, 6), before = a.state;
    bad(() => a.step('R'), 'ERR_PHASE_INVALID');
    bad(() => a.execute('RETRY'), 'ERR_PHASE_INVALID');
    bad(() => a.execute('RERECORD'), 'ERR_PHASE_INVALID');
    assert.equal(a.state, before);
  });
  add('PHS-11', () => {
    const a = new TestAdapter(fixtureStage(fixtures[2]));
    a.record('');
    a.replay('R'.repeat(15));
    assert.equal(a.state.phase, 'REPLAYING');
    const step = a.step('R');
    assert.equal(step.state.phase, 'CLEARED');
    assert.deepEqual(step.events, ['CLEARED']);
  });
  add('PHS-12', () => {
    const a = from(2, 4);
    assert.equal(a.state.unlockFlags.L, true);
    a.execute('RETRY');
    assert.equal(a.state.unlockFlags.L, false);
    assert.equal(a.state.doorStates.L, 'CLOSED');
    assert.deepEqual(a.state.playerPosition, a.stage.start);
  });

  const defs = { id: '1', mapRows: stage1.mapRows, doorRules: golden[0].doorRules, goldThreshold: 8, silverThreshold: 10 };
  add('DAT-01', () => {
    assert.deepEqual(stages.map(x => [x.width, x.height]), [[9, 3], [11, 5], [11, 6], [15, 5], [15, 9], [15, 7]]);
    for (const c of golden) {
      const s = stages[c.stage - 1];
      assert.deepEqual(s.mapRows, c.mapRows);
      assert.deepEqual(Object.fromEntries(s.doors.map(d => [d.id, { type: d.type, requiredSwitchIds: d.requiredSwitchIds }])), c.doorRules);
    }
  });
  for (const [id, patch] of [
    ['DAT-02', { mapRows: ['#########', '#SaD.G#', '#########'] }],
    ['DAT-03', { mapRows: ['#########', '#SSa.D.G#', '#########'] }],
    ['DAT-04', { mapRows: ['#########', '#S?a.D.G#', '#########'] }],
    ['DAT-05', { doorRules: { D: { type: 'PRESSURE', requiredSwitchIds: ['z'] } } }],
    ['DAT-06', { doorRules: { D: { type: 'PRESSURE', requiredSwitchIds: ['a'], position: [3, 1] } } }]
  ]) add(id, () => bad(() => defineStage({ ...defs, ...patch }), 'ERR_STAGE_INVALID'));
  for (const [id, damage] of [
    ['DAT-07', r => r.positions.pop()],
    ['DAT-08', r => { r.positions[1] = [0, 1]; }],
    ['DAT-09', r => { r.positions[1] = [4, 1]; }],
    ['DAT-10', r => { r.recordedMoveCount = 1; }]
  ]) add(id, () => {
    const a = padded('RR');
    const good = a.state.ghostRecord;
    validateRecord(stage1, good);
    const invalid = structuredClone(good);
    damage(invalid);
    bad(() => validateRecord(stage1, invalid), 'ERR_RECORD_INVALID');
    assert.equal(a.state.ghostRecord, good);
  });
  add('SCO-01', () => assert.equal(from(0, 1).state.replayMoves, 1));
  add('SCO-02', () => {
    const a = from(0, 0);
    assert.equal(a.step('.').state.replayMoves, 0);
    assert.equal(a.step('U').state.replayMoves, 0);
  });
  add('SCO-03', () => {
    const a = from(0, 2);
    assert.deepEqual(a.state.ghostPosition, [3, 1]);
    assert.deepEqual([a.state.recordMoves, a.state.replayMoves], [2, 2]);
    assert.equal(score(a.stage, a.state.recordMoves, a.state.replayMoves).totalMoves, 4);
  });
  add('SCO-04', () => {
    const a = from(0, 3);
    a.execute('RETRY');
    a.replay('R');
    assert.deepEqual([a.state.recordMoves, a.state.replayMoves], [2, 1]);
  });
  for (const [id, moves, stars] of [['SCO-05', 8, 3], ['SCO-06', 9, 2], ['SCO-07', 11, 1]]) {
    add(id, () => assert.equal(score(stage1, 2, moves - 2).stars, stars));
  }
  add('SCO-08', () => {
    const time = new VirtualTime(), awards = [];
    const session = new Session(stage1, { time, onClear: result => awards.push(result) });
    session.command('START_RECORD');
    session.command('FINISH_RECORD');
    session.command('START_REPLAY');
    session.press('key:ArrowRight', 'R');
    time.fire();
    assert.equal(session.state.clearResult, null);
    assert.equal(session.state.replayMoves, 1);
    assert.deepEqual(awards, []);
  });

  for (const f of fixtures) add(f.id, () => {
    const { record, replay, ghostRecord, adapter } = runFixture(f);
    assert.equal(ghostRecord.recordCompletedTicks, f.record.endTick);
    if (f.record.expectedPositionsCount) assert.equal(ghostRecord.positions.length, f.record.expectedPositionsCount);
    for (const [steps, checks] of [[record, f.record.expected], [replay, f.replay.expected]]) {
      for (const expected of checks ?? []) {
        const state = steps[expected.tick - 1].checkpoint;
        assert.deepEqual(state.playerPosition, expected.player);
        if (expected.ghost) assert.deepEqual(state.ghostPosition, expected.ghost);
        if (expected.switchesOn) assert.deepEqual(Object.keys(state.switchStates).filter(id => state.switchStates[id]), expected.switchesOn);
        assert.equal(state.doorStates.D, expected.doorD);
      }
    }
    if (f.replay.expectedAtTick16) {
      const expected = f.replay.expectedAtTick16, step = replay[15];
      assert.equal(step.state.phase, expected.phase);
      assert.deepEqual(step.state.playerPosition, expected.player);
      assert.deepEqual(step.state.ghostPosition, expected.ghost);
      assert.deepEqual(step.events, expected.events);
      assert(expected.mustNotEmit.every(event => !step.events.includes(event)));
    }
    assert(!stages.some(s => s.id === adapter.stage.id));
  });
  add('BAL-01', () => golden.forEach((_, index) => verifyGolden(index)));
  add('BAL-02', () => {
    return stages.map(stage => {
      const solo = initialState(stage, 'SOLO_CONTINUE');
      const pending = [solo];
      const key = state => JSON.stringify([state.playerPosition, state.doorStates, state.unlockFlags]);
      const seen = new Set([key(solo)]);
      for (let i = 0; i < pending.length; i++) {
        const state = pending[i];
        for (const dir of Object.keys(directions)) {
          const candidate = transition(stage, state, dir, state.replayTick + 1).state;
          assert.notEqual(candidate.phase, 'CLEARED', stage.name);
          const nextKey = key(candidate);
          if (!seen.has(nextKey)) {
            seen.add(nextKey);
            pending.push(candidate);
          }
        }
      }
      return {
        stageId: stage.id, expanded: pending.length, frontierRemaining: 0,
        stateKey: 'playerPosition, doorStates, unlockFlags',
        rationale: 'Ghost-free solo reachability. Time and move counts have no effect on legal moves here.'
      };
    });
  });
  add('BAL-04', () => {
    for (const ix of [2, 6]) {
      const c = golden[ix], a = new TestAdapter(stages[c.stage - 1]);
      a.record(c.recordActions);
      a.execute('START_REPLAY');
      const seen = new Set();
      while (true) {
        assert.notEqual(a.state.phase, 'CLEARED');
        assert.equal(a.state.unlockFlags.L, false);
        if (a.state.phase === 'SOLO_CONTINUE') {
          const key = JSON.stringify([a.state.playerPosition, a.state.doorStates, a.state.unlockFlags]);
          if (seen.has(key)) break;
          seen.add(key);
        }
        assert(a.state.replayTick < 100);
        a.step('R');
      }
    }
  });
  add('BAL-05', () => {
    const upper = verifyGolden(4), lower = verifyGolden(5);
    assert.deepEqual([upper.result.totalMoves, upper.replay.at(-1).tick], [17, 14]);
    assert.deepEqual([lower.result.totalMoves, lower.replay.at(-1).tick], [23, 20]);
  });
  add('BAL-06', () => {
    const evidence = [];
    for (const stage of [...stages, fixtureStage(fixtures[1])]) {
      const pressure = stage.doors.filter(door => door.type === 'PRESSURE');
      let entries = 0, exits = 0;
      for (const { position: [x, y], id } of pressure) {
        for (const [direction, [dx, dy]] of Object.entries(directions)) {
          if (direction === '.') continue;
          const from = [x - dx, y - dy];
          const inbound = stage.mapRows[from[1]]?.[from[0]];
          const status = Object.fromEntries(stage.doors.map(door => [door.id, door.id === id ? 'HELD_OPEN' : 'OPEN']));
          // Independent local transition oracle. For a held door the previous
          // occupancy and switch history are immaterial to this edge.
          if (inbound && inbound !== '#') {
            const entry = move(stage, from, status, direction);
            assert.deepEqual(entry, { position: from, moved: false, blocked: true }, stage.id + '/' + id);
            entries++;
          }
          const to = [x + dx, y + dy];
          const outbound = stage.mapRows[to[1]]?.[to[0]];
          const canExit = Boolean(outbound && outbound !== '#');
          const exit = move(stage, [x, y], status, direction);
          assert.deepEqual(exit, { position: canExit ? to : [x, y], moved: canExit, blocked: !canExit });
          assert.equal(Number(exit.moved), canExit ? 1 : 0);
          exits++;
        }
      }
      evidence.push({ stageId: stage.id, inboundEdges: entries, outboundEdges: exits });
    }
    const { replay } = fixture(1);
    assert.deepEqual(replay.map(x => x.state.doorStates.D), ['OPEN', 'HELD_OPEN', 'HELD_OPEN', 'CLOSED']);
    return {
      strategy: 'Enumerate every adjoining move at each pressure door. HELD_OPEN never admits an outside actor; legal exits cost one move and a blocked exit costs none. The frozen fixture exercises closing after exit.',
      stages: evidence
    };
  });
  add('BAL-07', () => golden.forEach((_, i) => assert.deepEqual(verifyGolden(i), verifyGolden(i))));
}
