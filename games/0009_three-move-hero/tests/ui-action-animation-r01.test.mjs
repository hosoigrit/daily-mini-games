import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMotionPreview } from '../src/action-animation-controller.js';
import { getMotion, MOTIONS } from '../src/action-motion-catalog.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const svg = read('assets/action-effects.svg').toString();
const css = read('styles/action-animations.css').toString();
const cssMarker = '\n/* R01 artwork is attached only to the four reinforced motions. */';
const svgMarker = '\n  <view id="r01-focus-ring"';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const fixed = `1baad21638f13b65108aa9bf045d31f472972292  PHASE1_README.md
27b8c2fd4828af1018f96e6d4d14e3a298383f8b  animation-action-preview.html
4d903a26e503f4b199544b2cc7d208fe34631efa  animation-preview.html
a0468a52fc8a7414bbd0805fac18324101da18f9  assets/enemy-action-poses.svg
857e548c26dfd65dcd2a8e6e48e458a1e5e21b4d  assets/enemy.svg
ea37e1a8f15938f03d98c18d90fdb741f458122f  assets/hero-action-poses.svg
4ee94056481f0e2072f4d09504197858cfe65005  assets/hero.svg
d2910f29449229fb13e2d253dac6364102eb3328  data/game0009_risk_register_v0.9.json
6a423ef4a21fe1706ec254d244328febefee5849  data/game0009_stage_manifest_schema_v0.9.json
87d4b54d64427a672f7744982b1ae936ca098870  data/game0009_stage_manifest_v0.9.json
bafc081cdcb72f15938bb894ea5a7de5246cde6d  index.html
20981cd4653da3b745f8c0f39afd8439c7c13d93  package.json
3581d641fd87fada9ef192fb1aacdc938e5dd9b5  src/action-motion-catalog.js
e9394bacae380858fe169c46ab531e6066f6ac45  src/battle-core.js
4c2e4239a771946f0853915d14e28da6f4472f3d  src/battle-playback.js
fb89de72088b8ea2929d27e6a51a7ebed3d872c0  src/character-scene.js
a7e9d1ba13bbc603a2bfc84729999632b47f5749  src/progress-storage.js
aa93d8355c9650eb64b9b10ef87b91e1afd2542b  src/ruleset-fingerprint.js
c0201fff06f15a06429975259819ed8da80e41ca  src/session-progress.js
003411e94fc0b6488adba809479b5580d2276137  src/settings-storage.js
4a3735628a92f03889f99c8926d60d7c2f8bfcc3  src/ui-controller.js
2baefd02a56475fc08fe247f0a2ae5d9b81d923e  src/ui-renderer.js
9756d5ac4cd7cb714a0e158633cd8cbeca4d84d5  src/ui-state.js
3df80568ad6d445ab611eec3c143ac427482eb82  styles/battle-animations.css
689253fb59630545552b45ba4a6d9141891f3898  styles/game.css
20dea7ca7dc8a116698a39bfcdaeadc0ba5181c1  tests/battle-core.test.mjs
29b28da347b020c83740c953ba25c054e2b3c93d  tests/battle-edge.test.mjs
b3da01634d677b6777f4f8e7dd46855d5123019f  tests/fixtures/frozen_file_hashes_v0.9.json
729f7a751d3d231df2d371f9cd73f912382ea6c5  tests/fixtures/game0009_edge_expected_v0.9.json
800bd8325929820f2dada719398189c76ecc8979  tests/fixtures/game0009_full_960_expected_v0.9.json
3f8e4d40d44bba5cdbee9669ebcd146370f5f86a  tests/fixtures/game0009_golden_tests_v0.9.json
192b657c76fa40f522ede362dee03ebcb42225cd  tests/fixtures/game0009_progress_example_v0.9.json
0400a1ca739cae1c661b18cefceaaf96b6e26b7b  tests/fixtures/game0009_progress_schema_v0.9.json
4660222fb3758f090a407d724be1d0d4338e9281  tests/fixtures/game0009_ruleset_canonical_payload_v1.json
09d7ef3b6d1874154a2a910a6695cb7ea7ac9d37  tests/fixtures/game0009_ruleset_fingerprint_vectors_v1.json
3ece47c6ed96fa89d63d3c38b5d0c52994d2a6d9  tests/fixtures/game0009_save_example_v0.7.json
92d061b41336c5ec08651ca66254782829cd3658  tests/fixtures/game0009_save_schema_v0.7.json
e4f97a8879771c714226709443868b32f9fae135  tests/fixtures/game0009_settings_example_v0.9.json
21fc0bb6e68e98a3894d28a3d8ab95f479e0de8b  tests/fixtures/game0009_settings_schema_v0.9.json
de983e8ac66a7734d8904edf398e515a62681bf4  tests/fixtures/game0009_storage_acceptance_v0.9.json
03da4ce392876529bd46b34046867778eeb362ca  tests/phase1_checksums.test.mjs
e29b1430d9d35a4e38d90a6da6cc96813d3a1acb  tests/phase1_contract.test.mjs
ca5191bebb74c60bd0a4638b15d78f9cce6b2572  tests/phase1_fingerprint.test.mjs
b092ce016608ba58473ca640395ef83bddcbd895  tests/progress-storage.test.mjs
89c28ff21aa15100c2e0feef906d0ee0f5d7df79  tests/ui-action-animation.test.mjs
a20c0aeed04095aba4c08889a978857eb5e56f91  tests/ui-animation-scene.test.mjs
9d87252727e13a52f65a8360acbaf849161bc812  tests/ui-flow.test.mjs`;

class Element {
  children = [];
  dataset = {};
  style = {};
  attributes = new Map();
  classList = { toggle() {} };

  constructor(document) { this.ownerDocument = document; }
  get firstElementChild() { return this.children[0]; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  append(...children) {
    for (const child of children) { child.parent = this; this.children.push(child); }
  }

  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove();
    this.append(...children);
  }

  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }
}

function create(factory = createMotionPreview) {
  const doc = { createElement: () => new Element(doc) };
  const sceneRegion = doc.createElement();
  const effectRegion = doc.createElement();
  const pending = new Map();
  const listeners = new Set();
  const states = [];
  let timer = 0;
  let elapsed = 0;
  const media = {
    matches: false,
    addEventListener(type, fn) { assert.equal(type, 'change'); listeners.add(fn); },
    removeEventListener(type, fn) { assert.equal(type, 'change'); listeners.delete(fn); },
    set(value) { this.matches = value; for (const fn of listeners) fn(); },
  };
  const instance = factory({
    sceneRegion, effectRegion, media,
    schedule(fn, delay) { pending.set(++timer, { fn, delay }); return timer; },
    cancel(id) { pending.delete(id); },
    onState({ status, motion }) { states.push([status, motion?.id ?? null]); },
  });

  function tick() {
    const job = pending.entries().next().value;
    if (!job) return false;
    const [id, { fn, delay }] = job;
    pending.delete(id);
    elapsed += delay;
    fn();
    return true;
  }

  function frame() {
    const stage = sceneRegion.firstElementChild;
    return {
      elapsed,
      poses: { ...stage.dataset },
      files: effectRegion.children.map(item => {
        const url = new URL(item.src);
        return { url: url.pathname.split('/').at(-1) + url.hash,
          alt: item.alt, className: item.className, data: { ...item.dataset }, style: { ...item.style } };
      }),
      event: effectRegion.children.find(item => item.dataset.effect)?.dataset.effect ?? null,
    };
  }
  return { instance, tick, frame, pending, states, media, effectRegion, listeners };
}

async function trace(id, options = {}, reduced = false, factory) {
  const e = create(factory);
  e.instance.setReducedMotion(reduced);
  const result = e.instance.play(id, options);
  const frames = [e.frame()];
  while (e.tick()) frames.push(e.frame());
  const status = await result;
  const { states } = e;
  const resultTrace = { frames, states: [...states], status };
  e.instance.destroy();
  return resultTrace;
}

function legacyArt() {
  assert.equal(sha256(svg.slice(0, svg.indexOf(svgMarker)) + '</svg>\n'),
    '6cf9e1f460770836bf4de9e47bfff5f0f0b8dd710c8cdb0e124d09b8493485b9');
  assert.equal(sha256(css.slice(0, css.indexOf(cssMarker))),
    '865538312f123f87bda2d9e2cc9b3de793a493a1d00888f73083e2338fd315c8');
}

const protectedMotions = ['slash', 'magic', 'enemy-attack', 'guard', 'hit', 'counter', 'physical-guard',
  'victory', 'defeat', 'timeout'];
const fingerprint = result => sha256(JSON.stringify(result));
const refs = files => files.map(item => item.url.split('#').at(-1));
const phaseFiles = (trace, at) => trace.frames.find(frame => frame.elapsed === at).files;
const expectedReads = {
  "slash:false": "51de124e8dbb714500e11db200f1b31f47309f88b62d186ce37f8fbc7a68fbd4",
  "slash:true": "9bf51123cc82ec2ddf8e932f0536af21c47505b0004ebb66bc9b5de2938ef77d",
  "magic:false": "e2368ec13f1ab7ba0237d87b5d94589672d956c082191624d41bfe783efbdf27",
  "magic:true": "2a93b175483b4339413022002eabd287c09f530115270affe42896f76bffb105",
  "enemy-attack:false": "f6b24a45cc667fdd01e25fc305dae45ab6fdd70216556ccf50eee7db6177896e",
  "enemy-attack:true": "bc2bf6f2e3f78f7ae1df33d34458d9d17ebaa18ab25c57c2ed09f9d39900c43c",
  "guard:false": "c843db41000e35da69cadcc87f0c06332e4aeeeb4cde427acb743baabfb57978",
  "guard:true": "1cbe662c7a46d183359353496cc1f823ce4597b1d6a45548e4e768dff41dd311",
  "hit:false": "213e5a36a8d19716a4f33136bd6a5a4cccbd0dd6ba400affc289e15a7b0aa300",
  "hit:true": "25c1942799ec934690983dfee3677140552d6b057731510fdb3661c94b427d79",
  "counter:false": "468c3c26654aa9e3fd545bf05eb3534111e4e638d553f03d750fd0cd39c1a463",
  "counter:true": "9012382b9e8214c99efce1ff3cf134ad5d2c81c6146145ddc9c8d4c2b13037ad",
  "physical-guard:false": "20f54509aff2210f39839cbfc6fe52f2cf0bd57c8a1e19ef300dcee3ce2760d3",
  "physical-guard:true": "157599c3d89ed2bd6f60feefdd6a8d4a2046de394eea1b4201eb78d077e94e93",
  "victory:false": "a5fff20f0ebee998909db64b8204765762e0113ce767a30686f1cfa33af12aec",
  "victory:true": "cc62675dabba3ac2dee300a1f9cccf1e591a89246a25e5d0962582da77134561",
  "defeat:false": "bcc92b458df4e5f2b966c6a2a917b1e358cbff3676f4a3f71f4eccfc6dd1f4df",
  "defeat:true": "b28fb0ad78b54817b2c0b6ffc8defd7b8c6dba219d6363b3649b345349911479",
  "timeout:false": "60e058037fe2ff51cf0b65ee926216e8c8c5b062c83900b75d9bd90a7b7e643a",
  "timeout:true": "b051a6390ee42b62de8175c24d80b35e6da0ca613cf549aba1aa7ec26fdccda7",
  "hit-enemy:false": "42c7e6d708b8107c8f586987145aee61dea8de385ed7a3e39de1e4bfb92bc4be",
  "hit-enemy:true": "29df8c797238d5da3f2928180490f09d2e7928eafb18e49b6b836ba085a7ba83"
};

test('R01-T01 fixed-parent files outside the three modified paths are byte-identical', () => {
  const entries = fixed.split('\n');
  assert.equal(entries.length, 47);
  for (const entry of entries) {
    const [expected, path] = entry.split('  ');
    const data = read(path);
    assert.equal(createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'), expected, path);
  }
  legacyArt();
});

test('R01-T02 focus adds a gold floor ring, aura and rising sparks for the existing gold phase', async () => {
  const result = await trace('focus');
  const files = phaseFiles(result, 180);
  assert.deepEqual(refs(files).slice(0, 3), ['r01-focus-ring', 'r01-focus-aura', 'r01-focus-sparks']);
  assert.equal(files[0].data.position, 'hero');
  assert.equal(files[0].style.animationDuration, '385ms');
  assert.match(css, /r01-ring-spread/);
  assert.match(css, /r01-sparks-rise/);
  assert.deepEqual(phaseFiles(result, 565), []);
});

test('R01-T03 heal shows a green ritual ring, multiple particles and a delayed glow', async () => {
  const files = phaseFiles(await trace('heal'), 160);
  assert.deepEqual(refs(files).slice(0, 3), ['r01-heal-ring', 'r01-heal-sparks', 'r01-heal-glow']);
  assert.equal(files[0].style.animationDuration, '520ms');
  const particles = svg.split('<svg x="0" y="500"')[1].split('</svg>')[0];
  assert.equal([...particles.matchAll(/<circle /g)].length, 7);
  assert.match(css, /0%, 45% \{ opacity: 0; \}/);
});

test('R01-T04 magic ward has a translucent double ring and opening expansion', async () => {
  const files = phaseFiles(await trace('magic-ward'), 235);
  assert.equal(refs(files)[0], 'r01-ward');
  assert.equal(files[0].data.position, 'enemy');
  const ward = svg.split('<svg x="200" y="500"')[1].split('</svg>')[0];
  assert.match(ward, /fill-opacity="\.15"/);
  assert.match(ward, /r="44"[\s\S]*r="36"[\s\S]*<path/);
  assert.match(css, /r01-ward-open[\s\S]*scale\(\.68\)/);
});

test('R01-T05 thorn glow, leftward flight and hero impact keep their original phase boundaries', async () => {
  const result = await trace('thorns');
  const effects = [0, 205, 420].map(at => phaseFiles(result, at)[0]);
  assert.deepEqual(refs(effects), ['r01-thorns', 'r01-rebound', 'r01-impact']);
  assert.deepEqual(effects.map(x => x.data.position), ['enemy', 'backward', 'hero']);
  assert.match(css, /@keyframes r01-rebound-left \{\s*from \{ left: 72%; \}\s*to \{ left: 28%; \}/);
  assert.deepEqual(phaseFiles(result, 560), []);
});

test('R01-T06 victory still selects the original gold and holds the original terminal pose', async () => {
  legacyArt();
  for (const reduced of [false, true]) {
    const result = await trace('victory', {}, reduced);
    assert.equal(fingerprint(result), expectedReads[`victory:${reduced}`]);
    assert.ok(refs(result.frames.at(-1).files).includes('gold'));
    assert.deepEqual(result.states.at(-1), ['held', 'victory']);
  }
});

test('R01-T07 the other nine accepted motions retain their normal and reduced frame traces', async () => {
  for (const id of protectedMotions.filter(id => id !== 'victory')) {
    for (const reduced of [false, true]) {
      assert.equal(fingerprint(await trace(id, {}, reduced)), expectedReads[`${id}:${reduced}`], id);
    }
  }
  for (const reduced of [false, true]) {
    assert.equal(fingerprint(await trace('hit', { target: 'enemy' }, reduced)), expectedReads[`hit-enemy:${reduced}`]);
  }
});

test('R01-T08 all fourteen timelines and event identifiers remain fixed', async () => {
  assert.equal(MOTIONS.length, 14);
  assert.equal(sha256(JSON.stringify([MOTIONS, getMotion('hit', { target: 'enemy' })])),
    'cbd18f5d17d76680e63341cabf749dc2089795338ad8e8c49537b23f05b8e143');
  for (const motion of MOTIONS) {
    const result = await trace(motion.id);
    assert.equal(result.frames.at(-1).elapsed, motion.duration);
    assert.deepEqual(result.frames.slice(0, -1).map(frame => [frame.elapsed, frame.event]),
      motion.phases.map(phase => [phase.at, phase.effect]));
  }
});

test('R01-T09 interruption, reset and destruction clear all added effect layers and timers', async () => {
  const e = create();
  const focus = e.instance.play('focus');
  e.tick();
  assert.ok(refs(e.frame().files).includes('r01-focus-ring'));
  const stale = e.pending.values().next().value.fn;
  const ward = e.instance.play('magic-ward');
  assert.equal((await focus).status, 'cancelled');
  stale();
  assert.equal(e.pending.size, 1);
  assert.deepEqual(refs(e.frame().files).slice(0, 1), ['rune']);
  e.instance.reset();
  assert.equal((await ward).status, 'cancelled');
  assert.deepEqual(e.frame().files, []);
  const thorn = e.instance.play('thorns');
  e.instance.destroy();
  assert.equal((await thorn).status, 'cancelled');
  assert.equal(e.effectRegion.children.length, 0);
  assert.equal(e.pending.size, 0);
  assert.equal(e.listeners.size, 0);
});

test('R01-T10 both reduced-motion controls keep meaningful static effects', async () => {
  const e = create();
  for (const [id, expected] of [
    ['focus', ['r01-focus-ring', 'r01-focus-aura']],
    ['heal', ['r01-heal-ring', 'r01-heal-sparks']],
    ['magic-ward', ['r01-ward']],
    ['thorns', ['r01-impact', 'r01-thorns', 'r01-direction']],
  ]) {
    for (const source of ['manual', 'os']) {
      e.instance.setReducedMotion(source === 'manual');
      e.media.set(source === 'os');
      const running = e.instance.play(id);
      assert.equal(e.frame().poses.reduced, 'true');
      for (const sprite of expected) assert.ok(refs(e.frame().files).includes(sprite), sprite);
      while (e.tick()) {}
      assert.equal((await running).status, 'completed');
    }
  }
  assert.match(css, /\[data-reduced="true"\] \.r01-layer \{ animation: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.motion-effects \.r01-layer \{ animation: none; \}/);
});

test('R01-T11 R01 SVG has balanced markup, bounded local views and no external content', () => {
  const stack = [];
  const tags = /<\/?[^<>]+>/g;
  for (const [tag] of svg.matchAll(tags)) {
    const [, close, name] = /^<(\/?)(\w+)/.exec(tag);
    if (close) assert.equal(stack.pop(), name);
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, []);
  assert.doesNotMatch(svg.replace('http://www.w3.org/2000/svg', ''), /https?:|\/\/|<script|foreignObject|\bhref=|@font-face|\bon\w+=/i);
  const views = [...svg.matchAll(/<view id="(r01-[^"]+)" viewBox="(\d+) (\d+) 100 100"\/>/g)];
  assert.equal(views.length, 11);
  assert.equal(new Set(views.map(v => v[1])).size, 11);
  for (const [, , x, y] of views) {
    assert.ok(Number(y) >= 400);
    assert.ok(svg.includes(`<svg x="${x}" y="${y}" width="100" height="100"`));
  }
});

test('R01-T12 visual reinforcement stays in the independent preview without game or persistence calls', () => {
  const source = read('src/action-animation-controller.js').toString();
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(m => m[1]),
    ['./character-scene.js', './action-motion-catalog.js']);
  assert.doesNotMatch(source, /battle-core|simulateBattle|progress-storage|settings-storage|localStorage|ui-controller/);
  assert.doesNotMatch(read('index.html').toString(), /r01-|action-animation-controller|animation-action-preview/);
});
