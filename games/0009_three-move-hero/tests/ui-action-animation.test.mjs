import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MOTIONS, getMotion } from '../src/action-motion-catalog.js';
import { createMotionPreview } from '../src/action-animation-controller.js';

const project = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, project), 'utf8');
const preview = read('animation-action-preview.html');
const css = read('styles/action-animations.css');
const controller = read('src/action-animation-controller.js');
const assetPaths = ['assets/hero-action-poses.svg', 'assets/enemy-action-poses.svg', 'assets/action-effects.svg'];
const added = [...assetPaths, 'animation-action-preview.html', 'src/action-animation-controller.js',
  'src/action-motion-catalog.js', 'styles/action-animations.css', 'tests/ui-action-animation.test.mjs'];

// Git blob IDs from the single approved A1 parent.
const frozen = [
  [
    "PHASE1_README.md",
    "1baad21638f13b65108aa9bf045d31f472972292"
  ],
  [
    "animation-preview.html",
    "4d903a26e503f4b199544b2cc7d208fe34631efa"
  ],
  [
    "assets/enemy.svg",
    "857e548c26dfd65dcd2a8e6e48e458a1e5e21b4d"
  ],
  [
    "assets/hero.svg",
    "4ee94056481f0e2072f4d09504197858cfe65005"
  ],
  [
    "data/game0009_risk_register_v0.9.json",
    "d2910f29449229fb13e2d253dac6364102eb3328"
  ],
  [
    "data/game0009_stage_manifest_schema_v0.9.json",
    "6a423ef4a21fe1706ec254d244328febefee5849"
  ],
  [
    "data/game0009_stage_manifest_v0.9.json",
    "87d4b54d64427a672f7744982b1ae936ca098870"
  ],
  [
    "index.html",
    "bafc081cdcb72f15938bb894ea5a7de5246cde6d"
  ],
  [
    "package.json",
    "20981cd4653da3b745f8c0f39afd8439c7c13d93"
  ],
  [
    "src/battle-core.js",
    "e9394bacae380858fe169c46ab531e6066f6ac45"
  ],
  [
    "src/battle-playback.js",
    "4c2e4239a771946f0853915d14e28da6f4472f3d"
  ],
  [
    "src/character-scene.js",
    "fb89de72088b8ea2929d27e6a51a7ebed3d872c0"
  ],
  [
    "src/progress-storage.js",
    "a7e9d1ba13bbc603a2bfc84729999632b47f5749"
  ],
  [
    "src/ruleset-fingerprint.js",
    "aa93d8355c9650eb64b9b10ef87b91e1afd2542b"
  ],
  [
    "src/session-progress.js",
    "c0201fff06f15a06429975259819ed8da80e41ca"
  ],
  [
    "src/settings-storage.js",
    "003411e94fc0b6488adba809479b5580d2276137"
  ],
  [
    "src/ui-controller.js",
    "4a3735628a92f03889f99c8926d60d7c2f8bfcc3"
  ],
  [
    "src/ui-renderer.js",
    "2baefd02a56475fc08fe247f0a2ae5d9b81d923e"
  ],
  [
    "src/ui-state.js",
    "9756d5ac4cd7cb714a0e158633cd8cbeca4d84d5"
  ],
  [
    "styles/battle-animations.css",
    "3df80568ad6d445ab611eec3c143ac427482eb82"
  ],
  [
    "styles/game.css",
    "689253fb59630545552b45ba4a6d9141891f3898"
  ],
  [
    "tests/battle-core.test.mjs",
    "20dea7ca7dc8a116698a39bfcdaeadc0ba5181c1"
  ],
  [
    "tests/battle-edge.test.mjs",
    "29b28da347b020c83740c953ba25c054e2b3c93d"
  ],
  [
    "tests/fixtures/frozen_file_hashes_v0.9.json",
    "b3da01634d677b6777f4f8e7dd46855d5123019f"
  ],
  [
    "tests/fixtures/game0009_edge_expected_v0.9.json",
    "729f7a751d3d231df2d371f9cd73f912382ea6c5"
  ],
  [
    "tests/fixtures/game0009_full_960_expected_v0.9.json",
    "800bd8325929820f2dada719398189c76ecc8979"
  ],
  [
    "tests/fixtures/game0009_golden_tests_v0.9.json",
    "3f8e4d40d44bba5cdbee9669ebcd146370f5f86a"
  ],
  [
    "tests/fixtures/game0009_progress_example_v0.9.json",
    "192b657c76fa40f522ede362dee03ebcb42225cd"
  ],
  [
    "tests/fixtures/game0009_progress_schema_v0.9.json",
    "0400a1ca739cae1c661b18cefceaaf96b6e26b7b"
  ],
  [
    "tests/fixtures/game0009_ruleset_canonical_payload_v1.json",
    "4660222fb3758f090a407d724be1d0d4338e9281"
  ],
  [
    "tests/fixtures/game0009_ruleset_fingerprint_vectors_v1.json",
    "09d7ef3b6d1874154a2a910a6695cb7ea7ac9d37"
  ],
  [
    "tests/fixtures/game0009_save_example_v0.7.json",
    "3ece47c6ed96fa89d63d3c38b5d0c52994d2a6d9"
  ],
  [
    "tests/fixtures/game0009_save_schema_v0.7.json",
    "92d061b41336c5ec08651ca66254782829cd3658"
  ],
  [
    "tests/fixtures/game0009_settings_example_v0.9.json",
    "e4f97a8879771c714226709443868b32f9fae135"
  ],
  [
    "tests/fixtures/game0009_settings_schema_v0.9.json",
    "21fc0bb6e68e98a3894d28a3d8ab95f479e0de8b"
  ],
  [
    "tests/fixtures/game0009_storage_acceptance_v0.9.json",
    "de983e8ac66a7734d8904edf398e515a62681bf4"
  ],
  [
    "tests/phase1_checksums.test.mjs",
    "03da4ce392876529bd46b34046867778eeb362ca"
  ],
  [
    "tests/phase1_contract.test.mjs",
    "e29b1430d9d35a4e38d90a6da6cc96813d3a1acb"
  ],
  [
    "tests/phase1_fingerprint.test.mjs",
    "ca5191bebb74c60bd0a4638b15d78f9cce6b2572"
  ],
  [
    "tests/progress-storage.test.mjs",
    "b092ce016608ba58473ca640395ef83bddcbd895"
  ],
  [
    "tests/ui-animation-scene.test.mjs",
    "a20c0aeed04095aba4c08889a978857eb5e56f91"
  ],
  [
    "tests/ui-flow.test.mjs",
    "9d87252727e13a52f65a8360acbaf849161bc812"
  ]
];

function assertFrozen(files) {
  for (const [path, expected] of files) {
    const data = readFileSync(new URL(path, project));
    const actual = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    assert.equal(actual, expected, path);
  }
}

function xmlElements(xml) {
  const stack = [];
  const tags = [];
  const tokens = /<([^<>]+)>|([^<]+)/gy;
  let offset = 0;
  for (const m of xml.matchAll(tokens)) {
    offset = m.index + m[0].length;
    if (!m[1]) {
      assert.ok(stack.length || !m[2].trim());
      continue;
    }
    const [, close, name, attrs, selfClosing] = /^([/]?)([\w:-]+)(.*?)([/]?)$/.exec(m[1]) ?? [];
    assert.ok(name);
    if (close) {
      assert.equal(attrs, '');
      assert.equal(stack.pop(), name);
      continue;
    }
    const properties = [...attrs.matchAll(/\s+([\w:-]+)="([^"<]*)"/g)];
    assert.equal(properties.map(x => x[0]).join(''), attrs);
    const values = Object.fromEntries(properties.map(([, key, value]) => [key, value]));
    assert.equal(Object.keys(values).length, properties.length);
    tags.push({ name, values, depth: stack.length });
    if (!selfClosing) stack.push(name);
  }
  assert.equal(offset, xml.length);
  assert.deepEqual(stack, []);
  assert.equal(tags.filter(t => t.depth === 0).length, 1);
  return tags;
}

class Element {
  children = [];
  attributes = new Map();
  dataset = {};
  style = {};
  classes = new Set();
  classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };

  constructor(tagName, ownerDocument) { this.tagName = tagName; this.ownerDocument = ownerDocument; }
  get firstElementChild() { return this.children[0]; }
  getAttribute(name) { return this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  append(...elements) {
    for (const element of elements) { element.parent = this; this.children.push(element); }
  }
  replaceChildren(...elements) {
    for (const child of [...this.children]) child.remove();
    this.append(...elements);
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(x => x !== this);
    this.parent = undefined;
  }
}

function fixture(regions) {
  const doc = { createElement: name => new Element(name, doc) };
  const sceneRegion = regions?.sceneRegion ?? doc.createElement('section');
  const effectRegion = regions?.effectRegion ?? doc.createElement('div');
  const timers = new Map();
  const listeners = new Set();
  const states = [];
  let nextId = 0;
  let elapsed = 0;
  const media = {
    matches: false,
    addEventListener(event, fn) { assert.equal(event, 'change'); listeners.add(fn); },
    removeEventListener(event, fn) { assert.equal(event, 'change'); listeners.delete(fn); },
    toggle(on) { this.matches = on; for (const fn of listeners) fn(); },
  };
  const instance = createMotionPreview({
    sceneRegion, effectRegion, media,
    onState: state => states.push(state.status),
    schedule(fn, delay) { timers.set(++nextId, { fn, delay }); return nextId; },
    cancel(id) { timers.delete(id); },
  });
  function frame() {
    const { heroPose, enemyPose, acting, reduced } = sceneRegion.firstElementChild.dataset;
    return { heroPose, enemyPose, acting, reduced, effects: effectRegion.children.map(x => x.dataset.effect).filter(Boolean),
      positions: effectRegion.children.filter(x => x.dataset.effect).map(x => x.dataset.position) };
  }
  function tick() {
    const current = timers.entries().next().value;
    if (!current) return false;
    const [id, { fn, delay }] = current;
    timers.delete(id);
    elapsed += delay;
    fn();
    return true;
  }
  function finish() { while (tick()) {} }
  return { instance, sceneRegion, effectRegion, states, listeners, timers, media, frame, tick, finish,
    get elapsed() { return elapsed; } };
}

function sequence(id, options) {
  const env = fixture();
  const result = env.instance.play(id, options);
  const frames = [env.frame()];
  while (env.tick()) frames.push(env.frame());
  return { ...env, frames, result, elapsed: env.elapsed };
}

test('A21-T01 character SVGs and the six A1 files retain their approved blob IDs', () => {
  const a1 = frozen.filter(([path]) => ['assets/enemy.svg', 'assets/hero.svg', 'animation-preview.html',
    'src/character-scene.js', 'styles/battle-animations.css', 'tests/ui-animation-scene.test.mjs'].includes(path));
  assert.equal(a1.length, 6);
  assertFrozen(a1);
});
test('A21-T02 the three SVG spritesheets are well-formed and have unique view fragments', () => {
  for (const name of assetPaths) {
    const tags = xmlElements(read(name));
    assert.equal(tags[0].name, 'svg');
    assert.equal(tags[0].values.xmlns, 'http://www.w3.org/2000/svg');
    assert.match(tags[0].values.viewBox, /^0 0 \d+ \d+$/);
    const views = tags.filter(t => t.name === 'view');
    assert.ok(views.length >= 2);
    assert.equal(new Set(views.map(t => t.values.id)).size, views.length);
    for (const t of views) assert.match(t.values.viewBox, /^\d+ \d+ 100 100$/);
  }
  function assertSprites(region) {
    for (const sprite of region.children) {
      const url = new URL(sprite.src);
      const name = assetPaths.find(path => url.pathname.endsWith(path));
      assert.ok(name, sprite.src);
      assert.ok(xmlElements(read(name)).some(t => t.name === 'view' && t.values.id === url.hash.slice(1)), sprite.src);
    }
  }
  for (const motion of MOTIONS) {
    const e = fixture();
    void e.instance.play(motion.id);
    assertSprites(e.effectRegion);
    while (e.tick()) assertSprites(e.effectRegion);
    e.instance.destroy();
  }
});
test('A21-T03 preview and artwork reference only local assets with no executable SVG', () => {
  for (const path of assetPaths) {
    const src = read(path);
    assert.doesNotMatch(src.replace('http://www.w3.org/2000/svg', ''), /https?:|\/\/|<script|foreignObject|\bhref=|@font-face|\bon\w+=/i);
  }
  assert.doesNotMatch(preview + css + controller, /https?:|@font-face|@import|\bfetch\(/i);
  const local = [...preview.matchAll(/href="([^"]+)"|from '([^']+)'/g)].map(m => m[1] ?? m[2]);
  assert.equal(local.length, 4);
  for (const path of local) { assert.match(path, /^\.\//); assert.ok(read(path).length); }
});
test('A21-T04 fourteen motions are registered with the frozen durations', () => {
  assert.deepEqual(MOTIONS.map(m => m.code), Array.from({ length: 14 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(MOTIONS.map(m => m.duration), [800, 950, 850, 750, 550, 850, 750, 900, 700, 800, 700, 1100, 1100, 650]);
  assert.equal(new Set(MOTIONS.map(m => m.id)).size, 14);
  for (const m of MOTIONS) {
    assert.equal(m.phases[0].at, 0);
    assert.ok(m.phases.every((p, i) => p.at < (m.phases[i + 1]?.at ?? m.duration)));
  }
});
test('A21-T05 slash steps and swings before the enemy reacts', () => {
  const { frames, elapsed } = sequence('slash');
  assert.deepEqual(frames.map(f => f.heroPose), ['step', 'swing', 'swing', 'idle', 'idle']);
  assert.deepEqual(frames.map(f => f.enemyPose), ['idle', 'idle', 'hit-right', 'idle', 'idle']);
  assert.deepEqual(frames.flatMap(f => f.effects), ['slash', 'enemy-impact']);
  assert.equal(elapsed, 800);
});
test('A21-T06 magic casts, launches, travels forward and lands in order', () => {
  const { frames } = sequence('magic');
  assert.deepEqual(frames.flatMap(f => f.effects), ['hero-rune', 'launch', 'projectile', 'magic-impact']);
  assert.deepEqual(frames[2].positions, ['forward']);
  assert.match(css, /@keyframes travel-right \{ from \{ left: 34%; \} to \{ left: 65%;/);
});
test('A21-T07 enemy approaches and claws before the hero reacts', () => {
  const { frames } = sequence('enemy-attack');
  assert.deepEqual(frames.slice(0, 4).map(f => f.enemyPose), ['crouch', 'approach', 'claw', 'claw']);
  assert.deepEqual(frames.map(f => f.heroPose), ['idle', 'idle', 'idle', 'hit-left', 'idle', 'idle']);
  assert.deepEqual(frames.flatMap(f => f.effects), ['claw', 'hero-impact']);
});
test('A21-T08 guard and the two hit targets have distinct effects and poses', () => {
  assert.deepEqual(sequence('guard').frames.flatMap(f => f.effects), ['shield']);
  assert.equal(sequence('hit').frames[1].heroPose, 'hit-left');
  assert.equal(sequence('hit', { target: 'enemy' }).frames[1].enemyPose, 'hit-right');
  assert.equal(getMotion('hit', { target: 'unknown' }), undefined);
});
test('A21-T09 counter requires explicit playback and does not infer a game event', async () => {
  const e = fixture();
  assert.equal(e.timers.size, 0);
  const invalid = await e.instance.play('bad-id');
  assert.equal(invalid.status, 'invalid');
  assert.equal(e.frame().acting, 'false');
  const { frames } = sequence('counter');
  assert.deepEqual(frames.flatMap(f => f.effects), ['shield', 'hero-impact', 'slash', 'enemy-impact']);
});
test('A21-T10 focus and heal separately show gold and green effects', () => {
  assert.deepEqual(sequence('focus').frames.flatMap(f => f.effects), ['gold']);
  assert.deepEqual(sequence('heal').frames.flatMap(f => f.effects), ['heal']);
  assert.match(read('assets/action-effects.svg'), /#ffdf87/);
  assert.match(read('assets/action-effects.svg'), /#a3f1bd/);
});
test('A21-T11 physical defense crouches with armor and ward uses a distinct rune', () => {
  const armor = sequence('physical-guard').frames[1];
  const ward = sequence('magic-ward').frames[1];
  assert.equal(armor.enemyPose, 'crouch');
  assert.equal(ward.enemyPose, 'chant');
  assert.deepEqual(armor.effects, ['armor']);
  assert.deepEqual(ward.effects, ['ward']);
});
test('A21-T12 thorns light on the enemy and rebound toward the hero', () => {
  const { frames } = sequence('thorns');
  assert.deepEqual(frames.flatMap(f => f.effects), ['thorns', 'rebound', 'hero-impact']);
  assert.deepEqual(frames.flatMap(f => f.positions), ['enemy', 'backward', 'hero']);
  assert.match(css, /@keyframes travel-left \{ from \{ left: 67%; \} to \{ left: 34%;/);
});
test('A21-T13 win, loss and timeout retain distinct terminal states until reset', async () => {
  for (const [id, hero, enemy, effect] of [
    ['victory', 'victor', 'down', 'victory'],
    ['defeat', 'fallen', 'menace', 'menace'],
    ['timeout', 'idle', 'idle', 'clock'],
  ]) {
    const e = sequence(id);
    assert.equal((await e.result).status, 'completed');
    assert.equal(e.states.at(-1), 'held');
    assert.deepEqual([e.frame().heroPose, e.frame().enemyPose, ...e.frame().effects], [hero, enemy, effect]);
    assert.equal((await e.instance.play('slash')).status, 'reset-required');
    e.instance.reset();
    assert.equal(e.frame().acting, 'false');
  }
});
test('A21-T14 all eleven regular motions complete once at the configured duration and return to idle', async () => {
  for (const motion of MOTIONS.filter(m => !m.terminal)) {
    const e = sequence(motion.id);
    assert.equal((await e.result).status, 'completed');
    assert.equal(e.elapsed, motion.duration);
    assert.equal(e.frame().acting, 'false');
    assert.deepEqual(e.frame().effects, []);
    assert.deepEqual(e.states, ['playing', 'completed']);
  }
});
test('A21-T15 repeated play, selection interruption and stale callbacks are safe', async () => {
  const e = fixture();
  const first = e.instance.play('magic');
  const stale = e.timers.values().next().value.fn;
  const second = e.instance.play('slash');
  assert.equal((await first).status, 'cancelled');
  assert.equal(e.timers.size, 1);
  stale();
  assert.equal(e.timers.size, 1);
  assert.equal(e.frame().heroPose, 'step');
  e.instance.interrupt();
  assert.equal((await second).status, 'cancelled');
  assert.equal(e.timers.size, 0);
  assert.deepEqual(e.frame().effects, []);
  assert.equal(e.states.at(-1), 'idle');
});
test('A21-T16 reset and destroy remove temporary effects, timer and listener so the region can remount', async () => {
  const e = fixture();
  const first = e.instance.play('magic');
  e.instance.reset();
  assert.equal((await first).status, 'cancelled');
  const second = e.instance.play('guard');
  const stale = e.timers.values().next().value.fn;
  e.instance.destroy();
  e.instance.destroy();
  stale();
  e.instance.setReducedMotion(true);
  assert.equal((await second).status, 'cancelled');
  assert.equal(e.timers.size, 0);
  assert.equal(e.listeners.size, 0);
  assert.equal(e.sceneRegion.children.length, 0);
  assert.equal(e.effectRegion.children.length, 0);
  assert.equal((await e.instance.play('slash')).status, 'destroyed');
  const remount = fixture(e);
  assert.equal(remount.sceneRegion.firstElementChild.children.length, 2);
  remount.instance.destroy();
});
test('A21-T17 OS and manual reduced-motion each select stationary meaningful frames', async () => {
  const e = fixture();
  e.instance.setReducedMotion(true);
  const running = e.instance.play('magic');
  assert.equal(e.frame().reduced, 'true');
  assert.deepEqual(e.frame().effects, ['magic-impact']);
  e.media.toggle(true);
  e.instance.setReducedMotion(false);
  assert.equal(e.frame().reduced, 'true');
  e.media.toggle(false);
  assert.equal(e.frame().reduced, 'false');
  assert.deepEqual(e.frame().effects, ['hero-rune']);
  e.finish();
  assert.equal((await running).status, 'completed');
  assert.match(css, /prefers-reduced-motion: reduce/);
});
test('A21-T18 reduced terminal pose, captions and accessible native controls remain available', () => {
  const e = fixture();
  e.instance.setReducedMotion(true);
  void e.instance.play('defeat');
  assert.equal(e.frame().heroPose, 'fallen');
  assert.deepEqual(e.sceneRegion.firstElementChild.children.map(x => x.children[1].textContent), ['勇者', '角の魔物']);
  assert.match(preview, /<button type="submit"/);
  assert.match(preview, /<label for="motion">/);
  assert.match(preview, /role="status" aria-live="polite"/);
  assert.match(preview, /class="motion-effects" aria-hidden="true"/);
  assert.match(css, /min-height: 44px/);
  assert.match(read('styles/battle-animations.css'), /:focus-visible/);
});
test('A21-T19 all 42 fixed-parent blobs match and the eight A2-1 files exist', () => {
  assert.equal(frozen.length, 42);
  assertFrozen(frozen);
  assert.equal(added.length, 8);
  for (const path of added) assert.ok(read(path).length > 0, path);
});
test('A21-T20 demo imports only the A1 scene and A2-1 catalog and has no game or save access', () => {
  assert.deepEqual([...controller.matchAll(/from '([^']+)'/g)].map(m => m[1]),
    ['./character-scene.js', './action-motion-catalog.js']);
  assert.doesNotMatch(preview + controller + read('src/action-motion-catalog.js'),
    /battle-core|simulateBattle|progress-storage|settings-storage|localStorage|ui-controller/);
  assert.doesNotMatch(read('index.html'), /action-animation-controller|animation-action-preview/);
});
