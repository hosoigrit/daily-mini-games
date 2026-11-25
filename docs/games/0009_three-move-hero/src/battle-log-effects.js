const art = {
  effects: new URL('../assets/action-effects.svg', import.meta.url).href,
  hero: new URL('../assets/hero-action-poses.svg', import.meta.url).href,
  enemy: new URL('../assets/enemy-action-poses.svg', import.meta.url).href,
};

// R01 still owns the original demo player. This adapter renders frames selected by the log.
const effects = {
  slash: ['hero', 'arc'], 'enemy-impact': ['enemy', 'impact'], 'hero-impact': ['hero', 'impact'],
  'hero-rune': ['hero', 'rune'], 'enemy-rune': ['enemy', 'rune'], launch: ['hero', 'orb'],
  projectile: ['forward', 'orb'], 'magic-impact': ['enemy', 'rune'], claw: ['center', 'claw'],
  shield: ['hero', 'shield'], gold: ['hero', 'gold'], heal: ['hero', 'heal'],
  armor: ['enemy', 'armor'], ward: ['enemy', 'ward'], thorns: ['enemy', 'thorns'],
  rebound: ['backward', 'thorns'], victory: ['hero', 'gold'], menace: ['enemy', 'claw'], clock: ['center', 'clock'],
};

const reinforced = {
  focus: { gold: ['focus-ring', 'focus-aura', 'focus-sparks'] },
  heal: { heal: ['heal-ring', 'heal-sparks', 'heal-glow'] },
  'magic-ward': { ward: ['ward'] },
  thorns: { thorns: ['thorns'], rebound: ['rebound'], 'hero-impact': ['impact'] },
};

const defenseEffects = { guard: 'shield', 'physical-guard': 'armor', 'magic-ward': 'ward' };
const poseArt = {
  hero: { swing: 'sword-sweep', victor: 'sword-raised', cast: 'casting' },
  enemy: { claw: 'claws-out', menace: 'claws-out', chant: 'rune-eye' },
};

function effectLayers(effect, motion, key, reduced, { defense = false, held = false } = {}) {
  const [position, defaultView] = effects[effect];
  const special = reinforced[motion]?.[effect];
  const views = special
    ? (motion === 'thorns' && effect === 'hero-impact' && reduced
      ? [...special, 'thorns', 'direction'] : special)
    : [defaultView];
  return views.map((view, index) => ({
    key: `${key}:${view}`, asset: 'effects', position, defense, held,
    effect: index === 0 ? effect : undefined,
    view: special ? `r01-${view}` : view,
    className: [index === 0 && 'motion-effect', special && 'r01-layer', special && `r01-${view}`]
      .filter(Boolean).join(' '),
  }));
}

export function describeBattleLogEffects({ cue, pose, at, reduced }) {
  const layers = [];
  for (const hold of cue.holds) {
    layers.push(...effectLayers(defenseEffects[hold], hold, `defense:${cue.turn}:${hold}`, reduced,
      { defense: true, held: true }));
  }
  if (pose.effect) {
    const defense = defenseEffects[cue.id] === pose.effect;
    const key = defense ? `defense:${cue.turn}:${cue.id}` : `phase:${cue.at}:${reduced ? 'still' : at}:${pose.effect}`;
    layers.push(...effectLayers(pose.effect, cue.id, key, reduced, { defense }));
  }

  for (const side of ['hero', 'enemy']) {
    const view = poseArt[side][pose[side]];
    if (view) layers.push({ key: `pose:${side}:${view}`, asset: side, view, position: side, className: 'motion-pose' });
  }
  return layers;
}

export function createBattleLogEffects(region) {
  const shown = new Map();

  function setTiming(image, { duration, elapsed = 0 }) {
    image.style.animationDuration = `${Math.max(0, duration)}ms`;
    image.style.animationDelay = `${-Math.max(0, elapsed)}ms`;
  }

  function paint(frame) {
    const layers = describeBattleLogEffects(frame);
    const keys = new Set(layers.map(layer => layer.key));
    for (const [key, image] of shown) {
      if (keys.has(key)) continue;
      image.remove();
      shown.delete(key);
    }

    const reduced = String(frame.reduced);
    const modeChanged = region.dataset.reduced !== reduced;
    region.dataset.reduced = reduced;
    for (const layer of layers) {
      let image = shown.get(layer.key);
      if (image) {
        // The same shield, armour or ward carries through contact without being remounted.
        if (layer.held) image.style.animationName = 'none';
        else if (modeChanged) setTiming(image, frame);
        continue;
      }
      image = region.ownerDocument.createElement('img');
      image.alt = '';
      image.src = `${art[layer.asset]}#${layer.view}`;
      image.className = layer.className;
      image.dataset.position = layer.position;
      if (layer.effect) image.dataset.effect = layer.effect;
      setTiming(image, frame);
      if (layer.defense) image.style.zIndex = '0';
      if (layer.held) image.style.animationName = 'none';
      else if (!layer.defense && !layer.className.includes('r01-layer')) image.style.zIndex = '1';
      region.append(image);
      shown.set(layer.key, image);
    }
  }

  function clear() {
    region.replaceChildren();
    shown.clear();
  }

  return { paint, clear };
}
