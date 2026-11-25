const HERO = new URL('../assets/hero.svg', import.meta.url).href;
const ENEMY = new URL('../assets/enemy.svg', import.meta.url).href;
const mounted = new WeakMap();

export function createCharacterScene(region, {
  media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
} = {}) {
  let stage;
  let hero;
  let reducedMotion = false;

  function update() {
    if (!stage) return;
    const still = reducedMotion || Boolean(media?.matches);
    stage.classList.toggle('is-still', still);
    const source = still ? HERO : `${HERO}#idle`;
    if (hero.getAttribute('src') !== source) hero.setAttribute('src', source);
  }

  function fighter(document, id, label, url) {
    const figure = document.createElement('figure');
    figure.className = `fighter fighter--${id}`;
    const sprite = document.createElement('img');
    sprite.setAttribute('src', url);
    sprite.alt = '';
    sprite.width = 240;
    sprite.height = 240;
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    figure.append(sprite, caption);
    return figure;
  }

  function mount() {
    if (stage) return;
    mounted.get(region)?.destroy();
    const document = region.ownerDocument;
    stage = document.createElement('div');
    stage.className = 'battle-stage';
    const left = fighter(document, 'hero', '勇者', HERO);
    hero = left.firstElementChild;
    stage.append(left, fighter(document, 'enemy', '角の魔物', ENEMY));
    update();
    region.replaceChildren(stage);
    mounted.set(region, scene);
    media?.addEventListener?.('change', update);
  }

  function setReducedMotion(value) {
    reducedMotion = Boolean(value);
    update();
  }

  function destroy() {
    if (!stage) return;
    media?.removeEventListener?.('change', update);
    stage.remove();
    stage = undefined;
    hero = undefined;
    mounted.delete(region);
  }

  const scene = { mount, setReducedMotion, destroy };
  return scene;
}
