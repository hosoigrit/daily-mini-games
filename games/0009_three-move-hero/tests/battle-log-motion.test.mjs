import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateBattle } from '../src/battle-core.js';
import { getMotion } from '../src/action-motion-catalog.js';
import { battleCuePose, battleCueResult, buildBattleTimeline } from '../src/battle-log-motion.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { stages } = read('../data/game0009_stage_manifest_v0.9.json');
const { cases } = read('./fixtures/game0009_full_960_expected_v0.9.json');
const byId = new Map(stages.map(stage => [stage.stageId, stage]));
const battles = cases.map(({ stageId, plan }) => simulateBattle(byId.get(stageId), plan));
const eventTypes = new Set(['heroAttack', 'focus', 'heal', 'enemyAttack', 'counter', 'thornArmor']);
const expectedAction = {
  focus: 'focus', heal: 'heal', enemyAttack: 'enemy-attack', counter: 'counter', thornArmor: 'thorns',
};
const allEvents = (battle, type) => battle.log.some(turn => turn.events.some(event => event.type === type));
const cuesFor = (battle, origin) => buildBattleTimeline(battle).cues.filter(cue => cue.origin === origin);

test('960 v0.9 plans retain the order, turn and value of every recorded event', () => {
  assert.equal(battles.length, 960);
  let events = 0;
  for (const battle of battles) {
    const timeline = buildBattleTimeline(battle);
    const actual = timeline.cues.filter(cue => eventTypes.has(cue.origin))
      .map(cue => [cue.turn, cue.origin, cue.id, cue.damage ?? cue.amount]);
    const expected = battle.log.flatMap(row => row.events.map(event => [
      row.turn, event.type, event.type === 'heroAttack' ? row.card : expectedAction[event.type], event.damage ?? event.amount,
    ]));
    assert.deepEqual(actual, expected);
    events += expected.length;
    let at = 0;
    for (const cue of timeline.cues) {
      assert.equal(cue.at, at);
      assert.ok(cue.phases.length >= 1 && cue.phases[0].at === 0);
      assert.ok(cue.phases.every((phase, index) => phase.at < (cue.phases[index + 1]?.at ?? cue.duration)));
      at += cue.duration;
    }
    assert.equal(timeline.duration, at);
    assert.equal(timeline.cues.filter(cue => cue.terminal).length, 1);
    assert.equal(timeline.cues.at(-1).terminal, true);
  }
  assert.ok(events > 960);
});

test('terminal result selects exactly the corresponding motion on the final logged turn', () => {
  for (const [outcome, reason, id] of [
    ['win', null, 'victory'], ['loss', 'lose_dead', 'defeat'], ['loss', 'lose_timeout', 'timeout'],
  ]) {
    const matches = battles.filter(battle => battle.outcome === outcome && battle.reason === reason);
    assert.ok(matches.length);
    for (const battle of matches) {
      const timeline = buildBattleTimeline(battle);
      assert.equal(timeline.cues.at(-1).id, id);
      assert.equal(timeline.cues.at(-1).turn, battle.turns);
      assert.deepEqual(timeline.cues.at(-1).still, timeline.cues.at(-1).phases.at(-1));
    }
  }
});

test('zero enemy damage keeps the attack but removes the false hero reaction', () => {
  const zero = battles.flatMap(battle => cuesFor(battle, 'enemyAttack')).filter(cue => cue.damage === 0);
  const positive = battles.flatMap(battle => cuesFor(battle, 'enemyAttack')).filter(cue => cue.damage > 0);
  assert.ok(zero.length > 0 && positive.length > 0);
  assert.ok(zero.every(cue => cue.variant === 'no-hit' &&
    cue.phases.every(phase => phase.effect !== 'hero-impact' && !phase.hero) &&
    !cue.still.hero && cue.still.effect === 'claw'));
  assert.ok(positive.every(cue => cue.variant === 'full' &&
    cue.phases.some(phase => phase.effect === 'hero-impact')));
});

test('counter can be prepared without a response, while real responses start at the counterstrike', () => {
  const attempted = battles.filter(battle => battle.log.some(row => row.card === 'counter'));
  const stopped = attempted.filter(battle => !allEvents(battle, 'counter'));
  assert.ok(stopped.length);
  for (const battle of stopped) {
    const cues = buildBattleTimeline(battle).cues;
    assert.ok(cues.some(cue => cue.origin === 'preparation' && cue.card === 'counter'));
    assert.ok(cues.every(cue => cue.id !== 'counter'));
  }
  const responses = attempted.flatMap(battle => cuesFor(battle, 'counter'));
  assert.ok(responses.length);
  for (const response of responses) {
    assert.equal(response.variant, 'response');
    assert.equal(response.phases[0].effect, 'slash');
    assert.ok(response.phases.every(phase => !['shield', 'hero-impact'].includes(phase.effect)));
  }
});

test('killing blow suppresses forecast enemy attacks and uses only actual logged turns', () => {
  const early = battles.filter(battle => battle.outcome === 'win' && battle.turns < 3 &&
    battle.log.at(-1).enemyAction.type === 'attack' &&
    !battle.log.at(-1).events.some(event => event.type === 'enemyAttack'));
  assert.ok(early.length);
  for (const battle of early) {
    const last = buildBattleTimeline(battle).cues.filter(cue => cue.turn === battle.turns);
    assert.ok(last.every(cue => cue.id !== 'enemy-attack'));
    assert.equal(last.at(-1).id, 'victory');
  }
});

test('thorn rebound appears only where the engine records it', () => {
  const withThorns = battles.filter(battle => allEvents(battle, 'thornArmor'));
  assert.ok(withThorns.length > 0 && battles.length > withThorns.length);
  for (const battle of battles) {
    assert.equal(cuesFor(battle, 'thornArmor').length,
      battle.log.flatMap(row => row.events).filter(event => event.type === 'thornArmor').length);
  }
});

test('zero healing keeps the recorded amount and defensive stances precede hero action', () => {
  const zero = battles.flatMap(battle => cuesFor(battle, 'heal')).filter(cue => cue.amount === 0);
  assert.ok(zero.length);
  for (const battle of battles) {
    const timeline = buildBattleTimeline(battle);
    for (const row of battle.log.filter(row => row.enemyAction.type !== 'attack')) {
      const first = timeline.cues.find(cue => cue.turn === row.turn);
      assert.equal(first.origin, 'stance');
      assert.equal(first.id, row.enemyAction.type === 'physicalGuard' ? 'physical-guard' : 'magic-ward');
    }
  }
});

test('terminal motions start at collapse or stoppage, without replaying the lethal impact', () => {
  for (const battle of battles) {
    const { cues } = buildBattleTimeline(battle);
    const last = cues.at(-1);
    assert.ok(last.phases.every(phase => !['enemy-impact', 'hero-impact'].includes(phase.effect)));
    if (last.id === 'victory') assert.equal(last.phases[0].enemy, 'down');
    else if (last.id === 'defeat') assert.equal(last.phases[0].hero, 'fallen');
    if (last.id !== 'timeout') {
      const target = last.id === 'victory' ? 'enemy' : 'hero';
      const lethal = cues.at(-2);
      const impact = lethal.phases.findIndex(phase => phase[target]?.startsWith('hit-'));
      assert.ok(impact >= 0);
      assert.ok(lethal.phases.slice(impact).every(phase => phase[target] === lethal.phases[impact][target]));
    }
  }
});

test('defensive setup omits release and the applicable defense is held through the attack', () => {
  let enemyDefenses = 0;
  let heroDefenses = 0;
  for (const battle of battles) {
    const { cues } = buildBattleTimeline(battle);
    for (const row of battle.log) {
      const turn = cues.filter(cue => cue.turn === row.turn);
      for (const setup of turn.filter(cue => cue.variant === 'setup')) {
        assert.ok(setup.phases.every(phase => !phase.name.includes('解除')));
      }
      if (row.enemyAction.type !== 'attack') {
        const attack = turn.find(cue => cue.origin === 'heroAttack');
        if (attack) {
          assert.ok(attack.holds.includes(row.enemyAction.type === 'physicalGuard' ? 'physical-guard' : 'magic-ward'));
          enemyDefenses++;
        }
      }
      if (row.card === 'guard' || row.card === 'counter') {
        const attack = turn.find(cue => cue.origin === 'enemyAttack');
        if (attack) {
          assert.ok(attack.holds.includes('guard'));
          assert.ok(turn.slice(turn.indexOf(attack) + 1).every(cue => !cue.holds.includes('guard')));
          heroDefenses++;
        }
      }
      for (const cue of turn.filter(cue => cue.terminal)) assert.deepEqual(cue.holds, []);
    }
  }
  assert.ok(enemyDefenses > 0 && heroDefenses > 0);
});

test('damage and healing remain hidden until the matching contact phase 960 plans', () => {
  const onContact = {
    slash: 'enemy-impact', magic: 'magic-impact', counter: 'enemy-impact',
    thorns: 'hero-impact', heal: 'heal',
  };
  const seen = new Set();
  for (const battle of battles) {
    for (const cue of buildBattleTimeline(battle).cues) {
      const effect = cue.id === 'enemy-attack' ?
        (cue.damage === 0 ? 'claw' : 'hero-impact') : onContact[cue.id];
      let result = null;
      for (const phase of cue.phases) {
        if (effect && phase.effect === effect) {
          result = cue.id === 'heal' ? { kind: 'heal', value: cue.amount } : { kind: 'damage', value: cue.damage };
          seen.add(`${cue.id}:${effect}`);
        }
        assert.deepEqual(battleCueResult(cue, phase), result);
        assert.equal(battleCuePose(cue, phase, false), phase);
        assert.equal(battleCuePose(cue, phase, true), effect && result === null ? cue.phases[0] : cue.still);
      }
    }
  }
  assert.equal(seen.size, 7);
});

test('unknown events or contradictory endings fail without silently dropping information', () => {
  const battle = structuredClone(battles[0]);
  assert.throws(() => buildBattleTimeline({ log: [] }), TypeError);
  assert.throws(() => buildBattleTimeline({ ...battle, outcome: 'unknown' }), TypeError);
  battle.log[0].events.push({ type: 'new-event' });
  assert.throws(() => buildBattleTimeline(battle), /Unknown v0.9 battle event/);
});

test('building and annotating a timeline leave the engine log and motion catalog unchanged', () => {
  const battle = battles[0];
  const before = structuredClone(battle);
  const timeline = buildBattleTimeline(battle);
  timeline.cues[0].phases[0].name = 'changed by consumer';
  timeline.cues[0].still.name = 'changed by consumer';
  assert.deepEqual(battle, before);
  const fresh = buildBattleTimeline(battle).cues[0];
  assert.equal(fresh.phases[0].name, getMotion(fresh.id).phases[0].name);
  assert.equal(fresh.still.name, getMotion(fresh.id).still.name);
});
