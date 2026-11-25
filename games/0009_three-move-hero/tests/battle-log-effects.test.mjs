import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateBattle } from '../src/battle-core.js';
import { battleCuePose, buildBattleTimeline } from '../src/battle-log-motion.js';
import { createBattleLogEffects, describeBattleLogEffects } from '../src/battle-log-effects.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { stages } = json('../data/game0009_stage_manifest_v0.9.json');
const { cases } = json('./fixtures/game0009_full_960_expected_v0.9.json');
const byId = new Map(stages.map(stage => [stage.stageId, stage]));
const layers = (cue, pose, reduced = false) => describeBattleLogEffects({ cue, pose, at: pose.at, reduced });
const assets = Object.fromEntries([
  ['effects', 'action-effects.svg'], ['hero', 'hero-action-poses.svg'], ['enemy', 'enemy-action-poses.svg'],
].map(([id, path]) => [id, readFileSync(new URL(`../assets/${path}`, import.meta.url), 'utf8')]));
const run = (id, plan) => buildBattleTimeline(simulateBattle(byId.get(id), plan));

test('all 960 frozen battles use existing effect and pose fragments with unique layer keys', () => {
  for (const { stageId, plan } of cases) {
    for (const cue of run(stageId, plan).cues) {
      for (const [pose, reduced] of [...cue.phases.map(phase => [phase, false]), [cue.still, true]]) {
        const result = layers(cue, pose, reduced);
        assert.equal(new Set(result.map(layer => layer.key)).size, result.length);
        assert.equal(result.filter(layer => layer.effect && !layer.held).length, pose.effect ? 1 : 0);
        for (const { asset, view } of result) assert.ok(assets[asset].includes(`<view id="${view}"`), `${asset}#${view}`);
      }
    }
  }
});

test('turn-2 zero-damage enemy attack has claw and held shield without a hero hit; actual counter follows', () => {
  const { cues } = run('main-04', ['slash', 'counter', 'guard']);
  const attack = cues.findIndex(cue => cue.origin === 'enemyAttack' && cue.turn === 2);
  const zero = cues[attack];
  assert.equal(zero.damage, 0);
  assert.ok(zero.phases.some(pose => layers(zero, pose).some(layer => layer.effect === 'claw')));
  for (const [pose, reduced] of [...zero.phases.map(phase => [phase, false]), [zero.still, true]]) {
    const result = layers(zero, pose, reduced);
    assert.ok(result.some(layer => layer.held && layer.effect === 'shield'));
    assert.ok(!result.some(layer => layer.effect === 'hero-impact'));
  }
  const counter = cues[attack + 1];
  assert.equal(counter.origin, 'counter');
  assert.equal(counter.damage, 2);
  assert.ok(layers(counter, counter.phases[0]).some(layer => layer.effect === 'slash'));
  assert.ok(!layers(counter, counter.phases[0]).some(layer => layer.effect === 'shield'));
});

test('thorn glow, rebound and impact reuse R01 views in log order; reduced mode shows a static direction', () => {
  const cue = run('main-05', ['slash', 'magic', 'guard']).cues.find(item => item.origin === 'thornArmor');
  assert.deepEqual(cue.phases.flatMap(pose => layers(cue, pose).map(layer => layer.view)),
    ['r01-thorns', 'rune-eye', 'r01-rebound', 'r01-impact']);
  assert.deepEqual(layers(cue, cue.still, true).map(layer => layer.view), ['r01-impact', 'r01-thorns', 'r01-direction']);
});

test('healing and focus select their own enhanced layers; victory retains the original gold', () => {
  const heal = run('main-01', ['slash', 'guard', 'heal']).cues.find(cue => cue.id === 'heal');
  const focus = run('main-01', ['slash', 'guard', 'focus']).cues.find(cue => cue.id === 'focus');
  const victory = run('main-01', ['slash', 'magic', 'guard']).cues.at(-1);
  assert.deepEqual(layers(heal, heal.still, true).map(layer => layer.view),
    ['armor', 'r01-heal-ring', 'r01-heal-sparks', 'r01-heal-glow']);
  assert.deepEqual(layers(focus, focus.still, true).map(layer => layer.view),
    ['armor', 'r01-focus-ring', 'r01-focus-aura', 'r01-focus-sparks', 'casting']);
  assert.deepEqual(layers(victory, victory.still, true).map(layer => layer.view), ['gold', 'sword-raised']);
  assert.ok(victory.phases.every(pose => !layers(victory, pose).some(layer => layer.effect === 'enemy-impact')));
});

test('magic ward and physical armor retain distinct views through the matching attack', () => {
  for (const [stage, plan, defense, expected, attack] of [
    ['main-07', ['slash', 'magic', 'guard'], 'magic-ward', 'r01-ward', 'magic'],
    ['main-01', ['magic', 'guard', 'slash'], 'physical-guard', 'armor', 'slash'],
  ]) {
    const { cues } = run(stage, plan);
    const attackCue = cues.find(cue => cue.id === attack && cue.holds.includes(defense));
    const setup = cues.find(cue => cue.id === defense && cue.turn === attackCue.turn);
    const original = layers(setup, setup.phases.at(-1)).find(layer => layer.defense);
    for (const phase of attackCue.phases) {
      const held = layers(attackCue, phase).find(layer => layer.held);
      assert.equal(held.view, expected);
      assert.equal(held.key, original.key);
    }
  }
});

function fakeRegion() {
  const children = new Set();
  return {
    children,
    dataset: {},
    ownerDocument: { createElement() { return { dataset: {}, style: {}, remove() { children.delete(this); } }; } },
    append(image) { children.add(image); },
    replaceChildren() { children.clear(); },
  };
}

test('renderer carries the same ward image through contact and removes it on reset', () => {
  const { cues } = run('main-07', ['slash', 'magic', 'guard']);
  const attack = cues.find(cue => cue.id === 'magic' && cue.holds.includes('magic-ward'));
  const setup = cues.find(cue => cue.id === 'magic-ward' && cue.turn === attack.turn);
  const region = fakeRegion();
  const renderer = createBattleLogEffects(region);
  const render = (cue, pose, reduced = false, elapsed = 0) =>
    renderer.paint({ cue, pose, at: pose.at, duration: 200, reduced, elapsed });
  render(setup, setup.phases.at(-1));
  const ward = [...region.children].find(image => image.src.endsWith('#r01-ward'));
  assert.ok(ward);
  render(attack, attack.phases.find(pose => pose.effect === 'projectile'), false, 28);
  assert.ok(region.children.has(ward));
  assert.equal(ward.style.animationName, 'none');
  assert.equal([...region.children].find(image => image.src.endsWith('#orb')).style.animationDelay, '-28ms');
  render(attack, attack.still, true);
  assert.equal(region.dataset.reduced, 'true');
  assert.ok(region.children.has(ward));
  renderer.clear();
  assert.equal(region.children.size, 0);
});

test('normal playback uses one active overlay per effect without duplicating a retained defense', () => {
  const region = fakeRegion();
  const renderer = createBattleLogEffects(region);
  const cue = run('main-04', ['slash', 'counter', 'guard']).cues
    .find(item => item.origin === 'enemyAttack' && item.damage === 0);
  const pose = cue.phases.find(phase => phase.effect === 'claw');
  renderer.paint({ cue, pose, at: pose.at, duration: 300, reduced: false });
  const previous = [...region.children];
  renderer.paint({ cue, pose, at: pose.at, duration: 300, reduced: false, elapsed: 50 });
  assert.deepEqual([...region.children], previous);
  assert.equal(previous.filter(image => image.dataset.effect === 'shield').length, 1);
  assert.equal(previous.filter(image => image.dataset.effect === 'claw').length, 1);
});

test('turning motion back on during a ward restores the active phase timing on the same image', () => {
  const ward = run('main-07', ['slash', 'magic', 'guard']).cues.find(cue => cue.id === 'magic-ward');
  const opening = ward.phases.find(phase => phase.effect === 'ward');
  const region = fakeRegion();
  const renderer = createBattleLogEffects(region);
  renderer.paint({ cue: ward, pose: ward.still, at: 0, duration: opening.at, reduced: true });
  const image = [...region.children][0];
  renderer.paint({ cue: ward, pose: opening, at: opening.at, duration: ward.duration - opening.at,
    reduced: false, elapsed: 125 });
  assert.ok(region.children.has(image));
  assert.equal(image.style.animationDuration, '385ms');
  assert.equal(image.style.animationDelay, '-125ms');
});

test('reduced contact replaces shared artwork when the event target or layer role changes', () => {
  function renderContact(cue) {
    const region = fakeRegion();
    const renderer = createBattleLogEffects(region);
    const boundary = cue.phases.find(phase => phase.at === cue.resultAt);
    const render = phase => renderer.paint({
      cue, pose: battleCuePose(cue, phase, true), at: phase.at, duration: 200, reduced: true,
    });
    render(cue.phases[0]);
    const before = [...region.children];
    render(boundary);
    return [before, [...region.children]];
  }
  const magic = run('main-01', ['slash', 'magic', 'guard']).cues.find(item => item.id === 'magic');
  const [cast, impact] = renderContact(magic);
  const rune = cast.find(image => image.dataset.effect === 'hero-rune');
  const landed = impact.find(image => image.dataset.effect === 'magic-impact');
  assert.equal(rune.dataset.position, 'hero');
  assert.equal(landed.dataset.position, 'enemy');
  assert.equal(landed.src, rune.src);
  assert.notEqual(landed, rune);

  const thorn = run('main-05', ['slash', 'magic', 'guard']).cues.find(item => item.id === 'thorns');
  const [glow, recoil] = renderContact(thorn);
  const main = glow.find(image => image.dataset.effect === 'thorns');
  const auxiliary = recoil.find(image => image.src.endsWith('#r01-thorns'));
  assert.ok(main && auxiliary);
  assert.notEqual(main, auxiliary);
  assert.equal(auxiliary.dataset.effect, undefined);
  assert.ok(recoil.some(image => image.dataset.effect === 'hero-impact'));
});
