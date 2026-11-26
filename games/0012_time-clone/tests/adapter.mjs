import assert from './evidence.mjs';
import { defineStage, initialState, transition } from '../src/domain.mjs';
import { stages } from '../src/stages.mjs';
import { csv, goldenPath, json, recordPath, supplements } from './verify-h01.mjs';

export const golden = json(goldenPath).cases;
export const fixtures = json('02_reference/game0012_boundary_fixtures_v0_2_DRAFT.json').testOnlyCases;
export const variant = json('03_test_plans/Game0012_GHO03_Test_Only_Variant_v0.1_DRAFT.json');
const recordRows = csv(recordPath);
const replayRows = csv('02_reference/game0012_golden_replay_snapshots_v0_2_DRAFT.csv');
export const stage1 = stages[0];

export function fixtureStage(f) {
  const rules = Object.fromEntries(Object.entries(f.doors ?? {}).map(([id, d]) => [
    id, { type: d.type, position: d.position, requiredSwitchIds: d.switches }
  ]));
  const stage = defineStage({ id: f.id, name: f.id, mapRows: f.mapRows, doorRules: rules, goldThreshold: 18, silverThreshold: 25 });
  assert.deepEqual(stage.start, f.start);
  assert.deepEqual(stage.goal, f.goal);
  return stage;
}

export class TestAdapter {
  constructor(stage) {
    this.stage = stage;
    this.state = initialState(stage);
  }

  execute(command, tick) {
    const step = transition(this.stage, this.state, command, tick);
    this.state = step.state;
    return step;
  }

  step(action) {
    const tick = this.state.phase === 'RECORDING' ? this.state.recordTick : this.state.replayTick;
    return this.execute(action, tick + 1);
  }

  record(actions) {
    this.execute('START_RECORD');
    const trace = [...actions].map(action => this.step(action));
    if (this.state.phase === 'RECORDING') this.execute('FINISH_RECORD');
    return trace;
  }

  replay(actions) {
    this.execute('START_REPLAY');
    return [...actions].map(action => this.step(action));
  }
}

export function runCase(index, replayThrough = Infinity) {
  const c = golden[index];
  const adapter = new TestAdapter(stages[c.stage - 1]);
  const record = adapter.record(c.recordActions);
  const ghostRecord = adapter.state.ghostRecord;
  const initialReplay = adapter.execute('START_REPLAY');
  const replay = [initialReplay, ...c.replayActions.slice(0, replayThrough).map(action => adapter.step(action))];
  return { c, adapter, record, replay, ghostRecord };
}

const point = position => position && { x: position[0], y: position[1] };
const enabled = record => Object.keys(record).filter(key => record[key]);
const entries = states => Object.entries(states).map(([key, value]) => key + ':' + value).sort().join(';');

export function snapshot(state, action, events) {
  return {
    tick: state.replayTick, action, player: point(state.playerPosition), ghost: point(state.ghostPosition),
    switchesOn: enabled(state.switchStates), doors: state.doorStates, latched: enabled(state.unlockFlags),
    recordMoves: state.recordMoves, replayMoves: state.replayMoves, totalMoves: state.recordMoves + state.replayMoves,
    cleared: state.phase === 'CLEARED', events, gamePhase: state.phase
  };
}

export function verifyGolden(index) {
  const run = runCase(index);
  const { c, adapter, record, replay, ghostRecord } = run;
  const rows = recordRows.filter(row => row.case_id === c.caseId);
  const recorded = [initialState(adapter.stage, 'RECORDING'), ...record.map(step => step.checkpoint)];
  assert.equal(record.length, c.recordCompletedTicks);
  assert.equal(ghostRecord.recordCompletedTicks, c.recordCompletedTicks);
  assert.equal(ghostRecord.positions.length, 17);
  assert.equal(rows.length, 17);
  for (const [tick, pos] of ghostRecord.positions.entries()) {
    const row = rows[tick];
    const pad = tick > record.length;
    assert.deepEqual({ tick, x: pos[0], y: pos[1], padding: pad }, c.recordPositions[tick]);
    assert.deepEqual(pos, [Number(row.player_x), Number(row.player_y)]);
    assert.equal(Number(row.record_completed_ticks), record.length);
    assert.equal(row.is_padding, pad ? 'True' : 'False');
    assert.equal(row.game_phase, pad ? 'NOT_EXECUTED_PADDING' : 'RECORDING');
    assert.equal(row.action, tick === 0 ? '-' : c.recordActions[tick - 1] ?? '.');
    assert.equal(Number(row.record_moves), pad ? ghostRecord.recordedMoveCount : recorded[tick].recordMoves);
    assert.equal(row.ghost_x + row.ghost_y, '');
    assert.equal(row.cleared, 'False');
    if (pad) {
      assert.equal(recorded[tick], undefined);
    } else {
      assert.equal(recorded[tick].recordTick, tick);
      assert.equal(enabled(recorded[tick].switchStates).join(';'), row.switches_on);
      assert.equal(enabled(recorded[tick].unlockFlags).join(';'), row.latched);
      assert.equal(entries(recorded[tick].doorStates), row.doors.split(';').sort().join(';'));
      if (tick) assert.deepEqual(record[tick - 1].events, supplements.cases[c.caseId][tick - 1].events, c.caseId + '/record/' + tick);
    }
  }
  const trace = replay.map((step, tick) => snapshot(step.state, tick ? c.replayActions[tick - 1] : '-', step.events));
  assert.deepEqual(trace, c.replaySnapshots);
  const replays = replayRows.filter(row => row.case_id === c.caseId);
  assert.equal(replays.length, trace.length);
  for (const [i, step] of trace.entries()) {
    const row = replays[i];
    assert.deepEqual({
      tick: Number(row.tick), action: row.action, player: { x: Number(row.player_x), y: Number(row.player_y) },
      ghost: row.ghost_x === '' ? null : { x: Number(row.ghost_x), y: Number(row.ghost_y) },
      switchesOn: row.switches_on.split(';').filter(Boolean),
      doors: Object.fromEntries(row.doors.split(';').filter(Boolean).map(pair => pair.split(':'))),
      latched: row.latched.split(';').filter(Boolean), recordMoves: Number(row.record_moves), replayMoves: Number(row.replay_moves),
      totalMoves: Number(row.total_moves), cleared: row.cleared === 'True',
      events: row.events.split(';').filter(Boolean), gamePhase: row.game_phase
    }, step);
    assert.equal(Number(row.record_completed_ticks), record.length);
    assert.equal(row.is_padding, 'False');
  }
  assert.deepEqual(runCase(index).replay, replay);
  return {
    stageId: adapter.stage.id,
    record: recorded.map((state, tick) => ({
      tick, action: c.recordActions[tick - 1] ?? '-', state, events: record[tick - 1]?.events ?? []
    })),
    replay: trace,
    result: adapter.state.clearResult
  };
}

export function runFixture(f) {
  const adapter = new TestAdapter(fixtureStage(f));
  const record = adapter.record(f.record.actions);
  const ghostRecord = adapter.state.ghostRecord;
  const replay = adapter.replay(f.replay.actions);
  return { adapter, ghostRecord, record, replay };
}
