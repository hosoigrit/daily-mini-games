import { createPlayback } from './battle-playback.js';
import { battleCuePose, buildBattleTimeline } from './battle-log-motion.js';
import { createBattleLogEffects } from './battle-log-effects.js';
import { createCharacterScene } from './character-scene.js';

const terminalState = new Set(['win', 'lose_dead', 'lose_timeout']);

function asBattle(log) {
  const state = log.at(-1)?.state;
  if (!terminalState.has(state)) throw new TypeError('Missing terminal battle state');
  return { log, outcome: state === 'win' ? 'win' : 'loss', reason: state === 'win' ? null : state };
}

export function scheduleBattleAnimation(log, delay) {
  const { cues } = buildBattleTimeline(asBattle(log));
  const schedule = [];
  const groups = Array.from({ length: log.length + 1 }, () => []);
  for (const cue of cues) groups[cue.terminal ? log.length : cue.turn - 1].push(cue);

  for (const [index, group] of groups.entries()) {
    if (index > 0) schedule.push({ at: index * delay, turn: index });
    const duration = group.reduce((sum, cue) => sum + cue.duration, 0);
    if (!duration) continue;
    const scale = delay / duration;
    let offset = 0;
    for (const cue of group) {
      for (const [i, phase] of cue.phases.entries()) {
        const until = cue.phases[i + 1]?.at ?? cue.duration;
        schedule.push({
          at: index * delay + (offset + phase.at) * scale,
          frame: { cue, phase, duration: (until - phase.at) * scale },
        });
      }
      offset += cue.duration;
    }
  }
  return { schedule, duration: (log.length + 1) * delay };
}

export function createAnimatedPlayback({
  present, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
}) {
  const fallback = createPlayback({ schedule, cancel });
  let generation = 0;
  let timer;

  function stop() {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    fallback.stop();
  }

  function play(log, delay, onTurn, complete) {
    stop();
    const run = generation;
    // The existing instant/reduced path still completes synchronously.
    if (delay === 0) {
      fallback.play(log, delay, onTurn, complete);
      return;
    }
    let playback;
    try { playback = scheduleBattleAnimation(log, delay); }
    catch { fallback.play(log, delay, onTurn, complete); return; }

    const started = now();
    let index = 0;
    function step() {
      if (run !== generation) return;
      timer = undefined;
      let latestVisual;
      // On a delayed tick, retain turn/log checkpoints without painting obsolete frames.
      while (index < playback.schedule.length && playback.schedule[index].at <= now() - started) {
        const event = playback.schedule[index++];
        if (event.frame) latestVisual = { ...event.frame, startedAt: started + event.at };
        else onTurn(event.turn);
        if (run !== generation) return;
      }
      if (index === playback.schedule.length && now() - started >= playback.duration) {
        complete();
        return;
      }
      if (latestVisual) present(latestVisual);
      if (run !== generation) return;
      const nextAt = playback.schedule[index]?.at ?? playback.duration;
      timer = schedule(step, Math.max(1, Math.ceil(started + nextAt - now())));
    }
    step();
  }
  return { play, stop };
}

export function terminalBattleFrame(battle) {
  try {
    const cue = buildBattleTimeline(battle).cues.at(-1);
    return { cue, phase: cue.phases.at(-1), duration: 0, still: true };
  } catch {
    return undefined;
  }
}

export function createGameBattleStage(document) {
  const arena = document.createElement('div');
  arena.className = 'motion-arena game-battle-arena';
  arena.setAttribute('aria-hidden', 'true');
  const region = document.createElement('div');
  const layer = document.createElement('div');
  layer.className = 'motion-effects';
  arena.append(region, layer);
  const scene = createCharacterScene(region, { media: null });
  scene.mount();
  const stage = region.firstElementChild;
  const effects = createBattleLogEffects(layer);

  function paint(frame, reduced) {
    const still = reduced || Boolean(frame?.still);
    const transition = still ? 0 : Math.min(140, (frame?.duration ?? 0) * 0.55);
    arena.style.setProperty('--game-phase-transition', `${transition}ms`);
    stage.dataset.reduced = String(reduced);
    stage.dataset.acting = String(Boolean(frame));
    scene.setReducedMotion(Boolean(frame) || reduced);
    if (!frame) {
      stage.dataset.heroPose = 'idle';
      stage.dataset.enemyPose = 'idle';
      effects.clear();
      return;
    }
    const { cue, phase, duration, startedAt } = frame;
    const chosen = battleCuePose(cue, phase, still);
    const pose = {
      ...chosen,
      hero: chosen.hero ?? (cue.holds.includes('guard') ? 'brace' : undefined),
      enemy: chosen.enemy ?? (cue.holds.includes('physical-guard') ? 'crouch' :
        cue.holds.includes('magic-ward') ? 'chant' : undefined),
    };
    stage.dataset.heroPose = pose.hero ?? 'idle';
    stage.dataset.enemyPose = pose.enemy ?? 'idle';
    effects.paint({ cue, pose, at: phase.at, duration, reduced: still,
      elapsed: startedAt === undefined ? 0 : Math.min(duration, performance.now() - startedAt) });
  }

  return {
    arena, paint,
    destroy() { effects.clear(); scene.destroy(); arena.remove(); },
  };
}
