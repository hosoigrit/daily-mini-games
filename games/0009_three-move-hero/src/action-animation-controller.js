import { createCharacterScene } from './character-scene.js';
import { getMotion } from './action-motion-catalog.js';

const EFFECTS = new URL('../assets/action-effects.svg', import.meta.url).href;
const HERO_POSES = new URL('../assets/hero-action-poses.svg', import.meta.url).href;
const ENEMY_POSES = new URL('../assets/enemy-action-poses.svg', import.meta.url).href;

const effectPositions = {
  slash: ['hero', 'arc'], 'enemy-impact': ['enemy', 'impact'], 'hero-impact': ['hero', 'impact'],
  'hero-rune': ['hero', 'rune'], 'enemy-rune': ['enemy', 'rune'], launch: ['hero', 'orb'],
  projectile: ['forward', 'orb'], 'magic-impact': ['enemy', 'rune'], claw: ['center', 'claw'],
  shield: ['hero', 'shield'], gold: ['hero', 'gold'], heal: ['hero', 'heal'],
  armor: ['enemy', 'armor'], ward: ['enemy', 'ward'], thorns: ['enemy', 'thorns'],
  rebound: ['backward', 'thorns'], victory: ['hero', 'gold'], menace: ['enemy', 'claw'], clock: ['center', 'clock'],
};
const heroPoseArt = { swing: 'sword-sweep', victor: 'sword-raised', cast: 'casting' };
const enemyPoseArt = { claw: 'claws-out', menace: 'claws-out', chant: 'rune-eye' };

export function createMotionPreview({
  sceneRegion, effectRegion, onState = () => {},
  media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
  schedule = setTimeout, cancel = clearTimeout,
}) {
  const scene = createCharacterScene(sceneRegion, { media: null });
  scene.mount();
  const stage = sceneRegion.firstElementChild;
  let active;
  let held;
  let manual = false;
  let destroyed = false;
  const reduced = () => manual || Boolean(media?.matches);

  function sprite(source, view, className, position) {
    const image = effectRegion.ownerDocument.createElement('img');
    image.src = `${source}#${view}`;
    image.alt = '';
    image.className = className;
    image.dataset.position = position;
    return image;
  }

  function frame(value, duration = 0) {
    stage.dataset.heroPose = value?.hero ?? 'idle';
    stage.dataset.enemyPose = value?.enemy ?? 'idle';
    stage.dataset.acting = String(Boolean(value));
    stage.dataset.reduced = String(reduced());
    scene.setReducedMotion(Boolean(value) || reduced());
    const children = [];
    if (value?.effect) {
      const [position, view] = effectPositions[value.effect];
      const effect = sprite(EFFECTS, view, 'motion-effect', position);
      effect.dataset.effect = value.effect;
      effect.style.animationDuration = `${duration}ms`;
      children.push(effect);
    }
    if (heroPoseArt[value?.hero]) children.push(sprite(HERO_POSES, heroPoseArt[value.hero], 'motion-pose', 'hero'));
    if (enemyPoseArt[value?.enemy]) children.push(sprite(ENEMY_POSES, enemyPoseArt[value.enemy], 'motion-pose', 'enemy'));
    effectRegion.replaceChildren(...children);
  }

  function snapshot(run) {
    const { motion, index } = run;
    const value = reduced() ? (motion.terminal ? motion.phases.at(-1) : motion.still) : motion.phases[index];
    const next = motion.phases[index + 1]?.at ?? motion.duration;
    frame(value, next - motion.phases[index].at);
  }

  function stop() {
    if (!active) return;
    const run = active;
    active = undefined;
    cancel(run.timer);
    run.resolve({ status: 'cancelled', id: run.motion.id });
  }

  function reset() {
    if (destroyed) return;
    stop();
    held = undefined;
    frame();
    onState({ status: 'idle' });
  }

  function play(id, options) {
    if (destroyed) return Promise.resolve({ status: 'destroyed' });
    const motion = getMotion(id, options);
    if (!motion) return Promise.resolve({ status: 'invalid' });
    if (held) return Promise.resolve({ status: 'reset-required' });
    stop();

    return new Promise(resolve => {
      const run = { motion, index: 0, timer: undefined, resolve };
      active = run;
      function advance() {
        if (active !== run || destroyed) return;
        if (run.index === motion.phases.length) {
          active = undefined;
          if (motion.terminal) held = motion;
          frame(held?.phases.at(-1));
          resolve({ status: 'completed', id: motion.id });
          onState({ status: held ? 'held' : 'completed', motion });
          return;
        }
        const previous = motion.phases[run.index].at;
        snapshot(run);
        if (run.index === 0) onState({ status: 'playing', motion });
        if (active !== run || destroyed) return;
        run.index++;
        const next = motion.phases[run.index]?.at ?? motion.duration;
        run.timer = schedule(advance, next - previous);
      }
      advance();
    });
  }

  function syncMotion() {
    if (destroyed) return;
    effectRegion.dataset.reduced = String(reduced());
    if (active) snapshot({ ...active, index: Math.max(0, active.index - 1) });
    else frame(held?.phases.at(-1));
  }

  function setReducedMotion(value) {
    manual = Boolean(value);
    syncMotion();
  }

  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    media?.removeEventListener?.('change', syncMotion);
    effectRegion.replaceChildren();
    scene.destroy();
  }

  media?.addEventListener?.('change', syncMotion);
  syncMotion();
  return {
    play, reset, setReducedMotion, destroy,
    interrupt() { if (active) reset(); },
  };
}
