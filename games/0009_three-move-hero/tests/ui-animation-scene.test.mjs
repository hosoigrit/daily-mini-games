import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createCharacterScene } from '../src/character-scene.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hero = read('../assets/hero.svg');
const enemy = read('../assets/enemy.svg');
const preview = read('../animation-preview.html');
const css = read('../styles/battle-animations.css');
const moduleSource = read('../src/character-scene.js');

// Parse the deliberately small XML subset used by the authored SVG assets.
function parseArtwork(xml) {
  const open = [];
  const elements = [];
  const tokens = /<([\s\S]*?)>|([^<]+)/gy;
  let end = 0;
  for (const token of xml.matchAll(tokens)) {
    end = token.index + token[0].length;
    if (!token[1]) {
      assert.ok(open.length || !token[2].trim(), 'Text outside root');
      continue;
    }
    const tag = token[1];
    if (tag.startsWith('/')) {
      assert.equal(open.pop(), tag.slice(1), 'Mismatched close tag');
      continue;
    }
    const match = /^([A-Za-z][\w:-]*)([\s\S]*?)(\/)?$/.exec(tag);
    assert.ok(match, 'Invalid start tag');
    const [, name, attributes, selfClosing] = match;
    const entries = [...attributes.matchAll(/\s+([\w:-]+)="([^"<]*)"/g)];
    assert.equal(entries.map(item => item[0]).join(''), attributes, 'Invalid attributes');
    const values = Object.fromEntries(entries.map(([, key, value]) => [key, value]));
    assert.equal(Object.keys(values).length, entries.length, 'Duplicate attributes');
    elements.push({ name, values, depth: open.length });
    if (!selfClosing) open.push(name);
  }
  assert.equal(end, xml.length, 'Incomplete markup');
  assert.deepEqual(open, []);
  assert.equal(elements.filter(e => e.depth === 0).length, 1);
  return elements;
}

class Element {
  children = [];
  attributes = new Map();
  classes = new Set();
  classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };

  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
  }

  get firstElementChild() { return this.children[0]; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  append(...items) {
    this.children.push(...items);
    for (const item of items) item.parent = this;
  }

  replaceChildren(...items) {
    for (const child of [...this.children]) child.remove();
    this.append(...items);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = undefined;
  }
}

function fixture() {
  const doc = { createElement: name => new Element(name, doc) };
  const region = doc.createElement('section');
  const listeners = new Set();
  const media = {
    matches: false,
    addEventListener(type, listener) {
      assert.equal(type, 'change');
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, 'change');
      listeners.delete(listener);
    },
    change(matches) {
      this.matches = matches;
      for (const listener of listeners) listener();
    },
  };
  return { region, listeners, media, scene: createCharacterScene(region, { media }) };
}

test('A1-T01 both complete SVG assets have a viewport and parse as structured XML', () => {
  for (const xml of [hero, enemy]) {
    const [root, ...shapes] = parseArtwork(xml);
    assert.equal(root.name, 'svg');
    assert.equal(root.values.xmlns, 'http://www.w3.org/2000/svg');
    assert.equal(root.values.viewBox, '0 0 240 240');
    assert.ok(shapes.some(e => e.name === 'path'));
  }
});

test('A1-T02 artwork and preview have no remote or executable asset references', () => {
  for (const xml of [hero, enemy]) {
    for (const { name, values } of parseArtwork(xml)) {
      assert.ok(['svg', 'title', 'style', 'g', 'path', 'rect', 'circle', 'ellipse'].includes(name), name);
      assert.ok(!Object.keys(values).some(key => /^(?:on|.*href|src)/i.test(key)));
    }
  }
  assert.doesNotMatch(hero + enemy + css + preview + moduleSource, /@import\b|@font-face\b|(?:https?:)?\/\/(?!www\.w3\.org\/2000\/svg)|\bfetch\s*\(/i);
});

test('A1-T03 preview fallback and mounted scene contain one hero and one enemy in order', () => {
  assert.deepEqual([...preview.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]),
    ['./assets/hero.svg', './assets/enemy.svg']);
  const { region, scene } = fixture();
  scene.mount();
  assert.deepEqual(region.firstElementChild.children.map(item => item.className),
    ['fighter fighter--hero', 'fighter fighter--enemy']);
  assert.deepEqual(region.firstElementChild.children.map(item => item.children[1].textContent), ['勇者', '角の魔物']);
});

test('A1-T04 mount creates a stage with two static image elements and one motion listener', () => {
  const { region, listeners, scene } = fixture();
  scene.mount();
  assert.equal(region.firstElementChild.className, 'battle-stage');
  assert.deepEqual(region.firstElementChild.children.map(item => item.firstElementChild.tagName), ['img', 'img']);
  assert.equal(listeners.size, 1);
});

test('A1-T05 repeated and replacement mount never add extra fighters or listeners', () => {
  const { region, listeners, media, scene } = fixture();
  scene.mount();
  const first = region.firstElementChild;
  scene.mount();
  assert.equal(region.firstElementChild, first);
  const replacement = createCharacterScene(region, { media });
  replacement.mount();
  scene.destroy();
  assert.equal(region.children.length, 1);
  assert.equal(region.firstElementChild.children.length, 2);
  assert.equal(listeners.size, 1);
  replacement.destroy();
});

test('A1-T06 destroy clears listeners and DOM and allows update and remount', () => {
  const { region, listeners, media, scene } = fixture();
  assert.doesNotMatch(moduleSource, /setTimeout|setInterval|requestAnimationFrame/);
  scene.mount();
  scene.destroy();
  scene.destroy();
  assert.equal(region.children.length, 0);
  assert.equal(listeners.size, 0);
  media.change(true);
  scene.setReducedMotion(true);
  scene.mount();
  assert.equal(listeners.size, 1);
  assert.equal(region.firstElementChild.classes.has('is-still'), true);
  scene.destroy();
});

test('A1-T07 manual and operating-system reduction both disable idle motion', () => {
  const { region, media, scene } = fixture();
  scene.mount();
  const stage = region.firstElementChild;
  const sprite = stage.firstElementChild.firstElementChild;
  assert.match(sprite.getAttribute('src'), /hero\.svg#idle$/);
  scene.setReducedMotion(true);
  assert.ok(stage.classes.has('is-still'));
  assert.match(sprite.getAttribute('src'), /hero\.svg$/);
  media.change(true);
  scene.setReducedMotion(false);
  assert.ok(stage.classes.has('is-still'));
  media.change(false);
  assert.equal(stage.classes.has('is-still'), false);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('A1-T08 reduced scene keeps both static asset URLs and captions', () => {
  const { region, scene } = fixture();
  scene.setReducedMotion(true);
  scene.mount();
  const images = region.firstElementChild.children.map(item => item.firstElementChild);
  assert.match(images[0].getAttribute('src'), /hero\.svg$/);
  assert.match(images[1].getAttribute('src'), /enemy\.svg$/);
  assert.match(css, /\.is-still \.fighter img \{ animation: none; \}/);
  assert.doesNotMatch(css, /visibility:\s*hidden|display:\s*none/);
});

test('A1-T09 independent scene has no game, persistence or combat hooks', () => {
  assert.doesNotMatch(preview + moduleSource, /ui-controller|ui-state|battle-core|simulateBattle|progress-storage|settings-storage|localStorage/);
  assert.doesNotMatch(read('../index.html'), /character-scene|battle-animations|animation-preview/);
});

test('A1-T10 CSS, module and SVGs use paths relative to the preview or module', () => {
  const htmlPaths = [...preview.matchAll(/(?:src|href)="([^"]+)"|from '([^']+)'/g)].map(m => m[1] ?? m[2]);
  assert.deepEqual(htmlPaths, ['./styles/battle-animations.css', './assets/hero.svg', './assets/enemy.svg', './src/character-scene.js']);
  for (const path of htmlPaths) assert.ok(read(`../${path}`).length > 0);
  assert.deepEqual([...moduleSource.matchAll(/new URL\('([^']+)', import\.meta\.url\)/g)].map(m => m[1]),
    ['../assets/hero.svg', '../assets/enemy.svg']);
});
