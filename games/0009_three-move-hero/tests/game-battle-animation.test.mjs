import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateBattle } from '../src/battle-core.js';
import { createGame } from '../src/ui-state.js';
import { createProgressStorage, PROGRESS_KEY } from '../src/progress-storage.js';
import { createSettingsStorage } from '../src/settings-storage.js';
import { createAnimatedPlayback, scheduleBattleAnimation, terminalBattleFrame } from '../src/game-battle-animation.js';

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = load('../data/game0009_stage_manifest_v0.9.json');
const cases = load('./fixtures/game0009_full_960_expected_v0.9.json').cases;
const stages = new Map(manifest.stages.map(stage => [stage.stageId, stage]));
const winningPlan = ['slash', 'magic', 'guard'];
const winningBattle = simulateBattle(stages.get('main-01'), winningPlan);

function clock() {
  const jobs = new Map();
  let time = 0;
  let id = 0;
  return {
    now: () => time,
    schedule(fn, delay) { jobs.set(++id, { fn, at: time + delay }); return id; },
    cancel(key) { jobs.delete(key); },
    advance(delta) {
      const until = time + delta;
      while (jobs.size) {
        const [key, job] = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (job.at > until) break;
        jobs.delete(key);
        time = job.at;
        job.fn();
      }
      time = until;
    },
    pending: () => jobs.size,
  };
}

test('all 960 plans fit the existing turn cadence at normal and fast speeds', () => {
  for (const { stageId, plan } of cases) {
    const battle = simulateBattle(stages.get(stageId), plan);
    for (const delay of [720, 230]) {
      const { schedule, duration } = scheduleBattleAnimation(battle.log, delay);
      assert.equal(duration, (battle.turns + 1) * delay);
      assert.deepEqual(schedule.filter(event => event.turn).map(event => [event.at, event.turn]),
        battle.log.map(row => [row.turn * delay, row.turn]));
      assert.ok(schedule.every((event, i) => event.at <= (schedule[i + 1]?.at ?? duration)));
      const frames = schedule.filter(event => event.frame);
      assert.ok(frames.every(event => event.frame.duration > 0));
      assert.equal(frames.at(-1).frame.cue.terminal, true);
      assert.ok(frames.filter(event => event.frame.cue.terminal).every(event => event.at >= battle.turns * delay));
    }
  }
});

test('normal animation emits a real pose before the first log update then keeps original turn and finish deadlines', () => {
  const timer = clock();
  const poses = [];
  const turns = [];
  let finished;
  const playback = createAnimatedPlayback({ ...timer, present: frame => poses.push(frame) });
  playback.play(winningBattle.log, 720, n => turns.push([n, timer.now()]), () => { finished = timer.now(); });
  assert.equal(poses[0].cue.id, 'slash');
  assert.deepEqual(turns, []);
  timer.advance(719);
  assert.deepEqual(turns, []);
  timer.advance(1);
  assert.deepEqual(turns[0], [1, 720]);
  timer.advance(1440);
  assert.equal(finished, 2160);
  assert.deepEqual(turns, [[1, 720], [2, 1440]]);
  assert.equal(timer.pending(), 0);
  assert.equal(poses.at(-1).cue.id, 'victory');
});

test('skip interruption during a log callback prevents stale terminal rendering or a second completion', () => {
  const timer = clock();
  const poses = [];
  let finished = 0;
  const playback = createAnimatedPlayback({ ...timer, present: frame => poses.push(frame) });
  playback.play(winningBattle.log, 230, () => playback.stop(), () => finished++);
  timer.advance(230);
  const count = poses.length;
  timer.advance(4000);
  assert.equal(poses.length, count);
  assert.equal(timer.pending(), 0);
  assert.equal(finished, 0);
});

test('instant/reduced completion and fallback keep the original result delivery', () => {
  const timer = clock();
  const received = [];
  const playback = createAnimatedPlayback({ ...timer, present() { assert.fail('animation should be skipped'); } });
  playback.play(winningBattle.log, 0, n => received.push(n), () => received.push('done'));
  assert.deepEqual(received, [2, 'done']);
  playback.play([{ state: 'unknown' }], 230, n => received.push(n), () => received.push('fallback'));
  timer.advance(460);
  assert.deepEqual(received, [2, 'done', 1, 'fallback']);
});

test('instant or skipped battles use the final still derived from the real result', () => {
  for (const [id, plan, result, hero, enemy] of [
    ['main-01', winningPlan, 'victory', 'victor', 'down'],
    ['main-02', ['slash', 'magic', 'focus'], 'defeat', 'fallen', 'menace'],
    ['main-01', ['slash', 'guard', 'focus'], 'timeout', undefined, undefined],
  ]) {
    const frame = terminalBattleFrame(simulateBattle(stages.get(id), plan));
    assert.deepEqual([frame.cue.id, frame.phase.hero, frame.phase.enemy, frame.still], [result, hero, enemy, true]);
  }
});

async function gameFixture() {
  const values = new Map();
  let writes = 0;
  let simulations = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); if (key === PROGRESS_KEY) writes++; },
  };
  const progress = await createProgressStorage({
    manifest, storage, locks: { request: async (name, options, callback) => callback({ name }) },
  });
  const timer = clock();
  const playback = createAnimatedPlayback({ ...timer, present() {} });
  const game = createGame({
    manifest, storage: progress, settings: createSettingsStorage(storage), playback,
    simulate(stage, plan) { simulations++; return simulateBattle(stage, plan); },
  });
  game.initialize();
  assert.equal(game.enter('main-01'), true);
  for (const card of winningPlan) game.select(card);
  return { game, timer, writes: () => writes, simulations: () => simulations };
}

test('the original game simulates and saves exactly once when integrated playback is skipped', async () => {
  const fixture = await gameFixture();
  const { game, timer } = fixture;
  assert.equal(game.start(), true);
  assert.equal(game.start(), false);
  timer.advance(200);
  game.finish();
  game.finish();
  timer.advance(4000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(game.state.screen, 'result');
  assert.deepEqual(game.state.battle, winningBattle);
  assert.equal(game.state.saveStatus, 'saved');
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.simulations(), 1);
  assert.equal(timer.pending(), 0);
});

test('leaving during the animated battle cancels timers without promoting the result or saving', async () => {
  const { game, timer, writes } = await gameFixture();
  game.start();
  timer.advance(960);
  game.leave();
  timer.advance(8000);
  game.resume();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(game.state.screen, 'stage-select');
  assert.equal(writes(), 0);
  assert.equal(timer.pending(), 0);
});
