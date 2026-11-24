import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateBattle } from '../src/battle-core.js';
import { createPlayback } from '../src/battle-playback.js';
import { createGame } from '../src/ui-state.js';
import { renderScreen, turnText } from '../src/ui-renderer.js';
import { createProgressStorage, LEGACY_KEY, PROGRESS_KEY, LEGACY_FINGERPRINT } from '../src/progress-storage.js';
import { createSettingsStorage, SETTINGS_KEY } from '../src/settings-storage.js';

const fromFile = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(fromFile('../data/game0009_stage_manifest_v0.9.json'));
const legacy = fromFile('./fixtures/game0009_save_example_v0.7.json');
const plan = ['slash', 'magic', 'guard'];
const settle = () => new Promise(resolve => setImmediate(resolve));

async function create({ supported = true, reduced = false, initial, legacyRaw, values = new Map() } = {}) {
  const calls = { battle: 0, save: 0, recheck: 0, writes: [] };
  const env = { unreadable: false, failReadback: false };
  if (initial !== undefined) values.set(PROGRESS_KEY, initial);
  if (legacyRaw !== undefined) values.set(LEGACY_KEY, legacyRaw);
  const device = {
    getItem(key) {
      if (key === PROGRESS_KEY && env.unreadable) throw Error('read unavailable');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.writes.push(key);
      values.set(key, value);
      if (key === PROGRESS_KEY && env.failReadback) env.unreadable = true;
    },
  };
  const locks = supported ? { request: async (name, options, action) => action({ name }) } : {};
  const storage = await createProgressStorage({ manifest, storage: device, locks });
  const settings = createSettingsStorage(device);
  const api = {
    ...storage,
    save(r) { calls.save++; return storage.save(r); },
    recheck() { calls.recheck++; return storage.recheck(); },
  };
  const timers = new Map();
  let serial = 0;
  const playback = createPlayback({
    schedule(fn) { timers.set(++serial, fn); return serial; },
    cancel(id) { timers.delete(id); },
  });
  function tick() {
    const [id, action] = timers.entries().next().value ?? [];
    if (action) { timers.delete(id); action(); }
  }
  function all() { while (timers.size) tick(); }
  const game = createGame({ manifest, storage: api, settings, playback, canPersist: supported,
    osReduced: () => reduced,
    simulate(stage, ordered) { calls.battle++; return simulateBattle(stage, ordered); } });
  assert.equal(game.state.screen, 'loading');
  game.initialize();
  const html = () => renderScreen(game, manifest);
  return { game, storage, settings, env, tick, all, calls, values, html };
}

function select(game, cards = plan, stage = 'main-01') {
  if (game.state.screen !== 'planning') assert.equal(game.enter(stage), true);
  cards.forEach(game.select);
}

async function win(game, stage) {
  select(game, plan, stage);
  assert.equal(game.start(), true);
  game.finish();
  await settle();
}

const row = (game, id) => game.progress.stages().find(stage => stage.stageId === id);

test('UI-01 both stage groups show frozen names and only main-01 opens initially', async () => {
  const { game, html } = await create();
  assert.equal(game.progress.stages().length, 16);
  for (const group of ['main', 'extra']) {
    game.group(group);
    assert.equal([...html().matchAll(/class="stage"/g)].length, 8);
    for (const stage of manifest.stages.filter(s => s.group === group)) assert.ok(html().includes(stage.title));
  }
  assert.deepEqual(game.progress.stages().filter(s => s.unlocked).map(s => s.stageId), ['main-01']);
  assert.equal(game.enter('extra-01'), false);
  assert.equal(game.enter('main-01'), true);
});
test('UI-02 a confirmed clear unlocks its manifest successor', async () => {
  const { game, html } = await create();
  await win(game);
  assert.equal(game.nextStage().stageId, 'main-02');
  assert.match(html(), /次ステージ/);
  assert.equal(row(game, 'main-02').unlockSource, 'persistent');
});
test('UI-03 planning renders exactly three frozen enemy actions and initial HP', async () => {
  const { game, html } = await create();
  game.enter('main-01');
  assert.deepEqual(game.currentStage().enemyActions, manifest.stages[0].enemyActions);
  assert.match(html(), /<li>通常攻撃 2<\/li><li>通常攻撃 3<\/li><li>物理防御<\/li>/);
  assert.match(html(), /勇者 <strong>HP 9/);
  assert.match(html(), /敵 <strong>HP 6/);
});
test('UI-04 cards toggle from hand and cannot duplicate or exceed three', async () => {
  const { game, html } = await create();
  select(game);
  assert.equal([...html().matchAll(/class="card"/g)].length, 5);
  assert.equal([...html().matchAll(/class="card"[^>]+aria-pressed="true"/g)].length, 3);
  game.select('heal');
  assert.deepEqual(game.state.plan, plan);
  game.select('slash');
  game.select('heal');
  assert.deepEqual(game.state.plan, ['magic', 'guard', 'heal']);
});
test('UI-05 moving slots changes the actual action order', async () => {
  const { game, html } = await create();
  select(game);
  game.move(0, 1);
  assert.deepEqual(game.state.plan, ['magic', 'slash', 'guard']);
  assert.match(html(), /<span class="slot-index">1<\/span><strong>魔法弾/);
  assert.equal(game.start(), true);
  assert.equal(game.state.battle.executed[0], 'magic');
});
test('UI-06 incomplete plan disables start and never calls engine', async () => {
  const { game, calls, html } = await create();
  select(game, plan.slice(0, 2));
  assert.match(html(), /data-action="start"[^>]+ disabled/);
  assert.equal(game.start(), false);
  assert.equal(calls.battle, 0);
});
test('UI-07 hint viewing survives closing and resets on retry without reducing stars', async () => {
  const { game, storage, html } = await create();
  select(game);
  game.hint(1);
  assert.ok(html().includes(manifest.stages[0].hints.level1));
  game.hint(2);
  assert.match(html(), /最初の手は 斬撃/);
  game.hint(0);
  assert.equal(game.state.usedHint, true);
  await winWithPlan();
  assert.equal(game.state.battle.stars, 3);
  assert.equal(storage.load().data.rulesets[storage.fingerprint].progress['main-01'].bestNoHintStars, 0);
  assert.equal(game.enter(), true);
  assert.equal(game.state.usedHint, false);
  async function winWithPlan() { game.start(); game.finish(); await settle(); }
});
test('UI-08 repeated start and finish produce one simulation and one save', async () => {
  const { game, calls, all } = await create();
  select(game);
  assert.equal(game.start(), true);
  assert.equal(game.start(), false);
  game.finish();
  game.finish();
  all();
  await settle();
  assert.deepEqual([calls.battle, calls.save], [1, 1]);
});
test('UI-09 replay consumes exact engine frames and presents the result unchanged', async () => {
  const { game, html, tick, all } = await create();
  select(game);
  const oracle = simulateBattle(manifest.stages[0], plan);
  game.start();
  tick();
  assert.equal(game.state.frames, 1);
  assert.match(html(), /勇者 <strong>HP 7/);
  all();
  assert.deepEqual(game.state.battle, oracle);
  assert.equal(game.state.frames, oracle.log.length);
  for (const frame of oracle.log) assert.ok(html().includes(turnText(frame, manifest.cardCatalog)));
});
test('UI-10 early victory shows the unused card without logging it as played', async () => {
  const { game, html } = await create();
  await win(game);
  assert.match(html(), /未実行 ガード/);
  assert.deepEqual(game.state.battle.executed, ['slash', 'magic']);
  assert.equal(game.state.battle.log.some(turn => turn.card === 'guard'), false);
});
test('UI-11 skip and normal completion give identical result and single save', async () => {
  const first = await create();
  const second = await create();
  select(first.game); select(second.game);
  first.game.start(); second.game.start();
  first.all(); second.game.finish();
  await settle();
  assert.deepEqual(first.game.state.battle, second.game.state.battle);
  assert.deepEqual([first.calls.save, second.calls.save], [1, 1]);
});
test('UI-12 result renders victory, defeat, stars, final HP and timeout cause', async () => {
  const a = await create();
  await win(a.game);
  assert.match(a.html(), /VICTORY/);
  assert.match(a.html(), /星3つ/);
  assert.match(a.html(), /敵 <strong>HP 0/);
  const b = await create();
  select(b.game, ['guard', 'focus', 'heal']);
  b.game.start(); b.all();
  assert.match(b.html(), /DEFEAT/);
  assert.match(b.html(), /3ターンで敵を倒せなかった/);
  assert.match(b.html(), /星0つ/);
  assert.equal(b.calls.save, 0);
});
test('UI-13 startup and result warn without falsely claiming a save', async () => {
  const a = await create({ supported: false });
  assert.match(a.html(), /排他ロックを利用できません/);
  await win(a.game);
  assert.match(a.html(), /保存不可/);
  assert.doesNotMatch(a.html(), /保存確認済み/);
  assert.equal(a.values.has(PROGRESS_KEY), false);
  for (const [initial, text] of [['{bad', /JSONが壊れて/],
    ['{"saveSchemaVersion":9}', /未対応の保存形式/]]) {
    const b = await create({ initial });
    assert.match(b.html(), text);
    assert.deepEqual(b.calls.writes, []);
  }
});
test('UI-14 unverified persists until readback succeeds and never blindly retries', async () => {
  const { game, env, html, calls } = await create();
  env.failReadback = true;
  await win(game);
  assert.match(html(), /保存結果を確認できません/);
  assert.doesNotMatch(html(), /保存確認済み/);
  await game.recheck();
  assert.equal(game.progress.pending, true);
  assert.equal(calls.save, 1);
  assert.deepEqual(calls.writes, [PROGRESS_KEY]);
});
test('UI-15 showing recovery previews leaves raw progress untouched', async () => {
  const { game, values, html, calls } = await create({ initial: '{bad' });
  game.show('recovery-preview');
  game.showPreview('recovery');
  assert.match(html(), /復旧候補/);
  assert.match(html(), /元データを表示/);
  assert.equal(values.get(PROGRESS_KEY), '{bad');
  assert.deepEqual(calls.writes, []);
  game.back();
  await game.confirm('recover');
  assert.equal(values.get(PROGRESS_KEY), '{bad');
});
test('UI-16 historical clear unlocks successor while current stars stay zero', async () => {
  const { game, html } = await create({ initial: JSON.stringify({
    gameId: manifest.gameId, saveSchemaVersion: 2, revision: 1, rulesets: {
      [LEGACY_FINGERPRINT]: { label: 'old', progress: { 'main-08': { maxStars: 3, bestNoHintStars: 2 } } },
    },
  }) });
  game.group('extra');
  assert.equal(row(game, 'extra-01').unlocked, true);
  assert.equal(row(game, 'extra-01').persisted.maxStars, 0);
  assert.match(html(), /現行ルール・記録なし/);
  assert.match(html(), /解放済み/);
});
test('UI-17 page departure stops playback before any result save', async () => {
  const { game, tick, all, calls } = await create();
  select(game);
  game.start(); tick(); game.leave(); all(); game.finish();
  assert.deepEqual(calls.writes, []);
  assert.equal(calls.save, 0);
  game.resume();
  assert.equal(game.state.screen, 'stage-select');
});
test('UI-18 OS reduced motion completes instantly with full log', async () => {
  const { game, html } = await create({ reduced: true });
  select(game); game.start();
  assert.equal(game.state.screen, 'result');
  assert.equal(game.state.frames, game.state.battle.log.length);
  game.state.battle.log.forEach(turn => assert.ok(html().includes(turnText(turn, manifest.cardCatalog))));
});
test('UI-19 keyboard controls have native buttons, move names and focus targets', async () => {
  const { game, html } = await create();
  select(game);
  assert.match(html(), /<button type="button"[^>]+data-action="card"/);
  assert.match(html(), /aria-label="斬撃を右へ移動"/);
  assert.match(html(), /aria-label="ガードを取り消す"/);
  assert.match(html(), /tabindex="-1" id="screen-title"/);
  assert.match(fromFile('../styles/game.css'), /:focus-visible/);
  assert.match(fromFile('../src/ui-controller.js'), /dialog.showModal\(\)/);
});
test('UI-20 CSS defines responsive grid, narrow controls and safe-area padding', () => {
  const css = fromFile('../styles/game.css');
  assert.match(fromFile('../index.html'), /width=device-width, initial-scale=1, viewport-fit=cover/);
  assert.match(css, /\.columns[^\n]+grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 600px\)[\s\S]+repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /max-width: 1110px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /safe-area-inset-left/);
});
test('UI-21 normal controller flow renders all seven states and settings save', async () => {
  const { game, values, html } = await create();
  assert.match(html(), /ステージ選択/);
  game.show('settings');
  assert.match(html(), /戦闘速度/);
  game.setPreferences({ battleSpeed: 'fast', reducedMotion: false });
  assert.ok(values.has(SETTINGS_KEY));
  game.back(); select(game); assert.match(html(), /3手の編成/);
  game.start(); assert.match(html(), /自動戦闘/);
  game.finish(); await settle(); assert.match(html(), /VICTORY/);
  game.show('recovery-preview'); assert.match(html(), /保存データ管理/);
  game.back(); assert.match(html(), /VICTORY/);
});
test('UI-23 saving unavailable permits session-only clear and successor', async () => {
  const { game, values } = await create({ supported: false });
  await win(game);
  assert.equal(game.nextStage().stageId, 'main-02');
  assert.equal(row(game, 'main-02').unlockSource, 'session');
  assert.equal(row(game, 'main-01').local.maxStars, 3);
  assert.equal(row(game, 'main-01').local.bestNoHintStars, 3);
  assert.equal(values.has(PROGRESS_KEY), false);
  assert.equal(game.enter('main-02'), true);
});
test('UI-24 saved and session-only records carry distinct visible labels', async () => {
  const a = await create();
  await win(a.game); a.game.stageSelect();
  assert.match(a.html(), /現行ルール・保存済み/);
  assert.doesNotMatch(a.html(), /セッション限定 星/);
  const b = await create({ supported: false });
  await win(b.game); b.game.stageSelect();
  assert.match(b.html(), /セッション限定 星3/);
  assert.doesNotMatch(b.html(), /現行ルール・保存済み/);
});
test('UI-25 consecutive wins are queued behind an unresolved save and retain both star maxima', async () => {
  const { game, env, calls, html, storage } = await create();
  env.failReadback = true;
  await win(game);
  select(game, ['guard', 'focus', 'slash'], 'main-02');
  game.start(); game.finish(); await settle();
  assert.equal(game.state.saveStatus, 'queued');
  select(game, ['focus', 'slash', 'magic'], 'main-02');
  game.hint(1);
  game.start(); game.finish(); await settle();
  assert.equal(game.state.saveStatus, 'queued');
  game.stageSelect();
  assert.match(html(), /保存確認中/);
  assert.equal(calls.save, 1);
  assert.equal(row(game, 'main-02').waiting, true);
  env.failReadback = false; env.unreadable = false;
  await game.recheck();
  assert.deepEqual(storage.load().data.rulesets[storage.fingerprint].progress['main-02'],
    { maxStars: 3, bestNoHintStars: 2 });
  assert.equal(calls.save, 3);
});
test('UI-26 safe recheck updates result and blocked recheck never replays pending writes', async () => {
  const { game, env, calls, html } = await create();
  env.failReadback = true;
  await win(game);
  env.unreadable = false; env.failReadback = false;
  await game.recheck();
  assert.match(html(), /保存確認済み/);
  assert.equal(calls.recheck, 1);
  assert.deepEqual(calls.writes, [PROGRESS_KEY]);
  const b = await create();
  b.env.failReadback = true;
  await win(b.game);
  await b.game.progress.win({ stageId: 'main-02', stars: 2, usedHint: false });
  b.values.set(PROGRESS_KEY, 'corrupt');
  b.env.unreadable = false;
  await b.game.recheck();
  assert.equal(b.game.progress.status, 'blocked');
  assert.equal(b.values.get(PROGRESS_KEY), 'corrupt');
  assert.deepEqual(b.calls.writes, [PROGRESS_KEY]);
  assert.equal(row(b.game, 'main-02').local.maxStars, 2);
});
test('UI-27 recovery and legacy operations require preview and explicit separate confirmation', async () => {
  const { game, values } = await create({ legacyRaw: legacy, initial: '{bad' });
  game.show('recovery-preview');
  await game.confirm('recover');
  assert.equal(values.get(PROGRESS_KEY), '{bad');
  game.showPreview('recovery');
  await game.confirm('recover');
  assert.equal(values.get(`${PROGRESS_KEY}:backup:0`), '{bad');
  game.showPreview('migration');
  await game.confirm('migrate');
  assert.equal(values.get(LEGACY_KEY), legacy);
  assert.equal(values.has(SETTINGS_KEY), false);
  await game.confirm('migrateSettings');
  assert.equal(values.has(SETTINGS_KEY), true);
});
test('UI-28 fresh initialization discards volatile progress and unfinished playback', async () => {
  const a = await create({ supported: false });
  await win(a.game);
  select(a.game, plan, 'main-02'); a.game.start(); a.game.leave();
  const b = await create({ supported: false, values: a.values });
  assert.equal(b.game.state.screen, 'stage-select');
  assert.equal(b.game.state.battle, undefined);
  assert.equal(row(b.game, 'main-02').unlocked, false);
  assert.equal(row(b.game, 'main-01').local.maxStars, 0);
});
