import { getMotion } from './action-motion-catalog.js';

const defenseMotion = { physicalGuard: 'physical-guard', magicWard: 'magic-ward' };
const terminalMotion = { win: 'victory', lose_dead: 'defeat', lose_timeout: 'timeout' };
const cards = new Set(['slash', 'magic', 'guard', 'focus', 'heal', 'counter']);
const enemyActions = new Set(['attack', 'physicalGuard', 'magicWard']);
const states = new Set(['ongoing', ...Object.keys(terminalMotion)]);
const resultEffects = {
  slash: 'enemy-impact', magic: 'magic-impact', 'enemy-attack': 'hero-impact',
  counter: 'enemy-impact', thorns: 'hero-impact', heal: 'heal',
};

function valueOf(event, key) {
  const value = event[key];
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Invalid ${key} for ${event.type}`);
  return value;
}

function cue(id, turn, origin, { variant = 'full', holds = [], ...details } = {}) {
  const motion = getMotion(id);
  let { phases, duration, still } = motion;
  if (variant === 'no-hit') {
    phases = phases.filter(phase => phase.effect !== 'hero-impact');
    still = { at: 0, name: '魔物が攻撃（ダメージなし）', enemy: 'claw', effect: 'claw' };
  } else if (variant === 'response' || variant === 'outcome-only') {
    const first = variant === 'response' ? phases.findIndex(phase => phase.effect === 'slash') : 1;
    const offset = phases[first].at;
    phases = phases.slice(first).map(phase => ({ ...phase, at: phase.at - offset }));
    duration -= offset;
  } else if (variant === 'setup') {
    duration = phases.at(-1).at;
    phases = phases.slice(0, -1);
  }
  if (motion.terminal) still = phases.at(-1);
  const resultEffect = variant === 'no-hit' ? 'claw' : resultEffects[id];
  const resultAt = resultEffect ? phases.find(phase => phase.effect === resultEffect).at : null;
  // Consumers can annotate their copies without changing the motion catalog.
  return {
    id, turn, origin, variant, name: motion.name, duration, terminal: motion.terminal, resultAt,
    phases: phases.map(phase => ({ ...phase })), still: { ...still }, holds: [...holds], ...details,
  };
}

export function battleCueResult(cue, phase) {
  if (cue.resultAt === null || phase.at < cue.resultAt) return null;
  return cue.damage !== undefined ? { kind: 'damage', value: cue.damage } : { kind: 'heal', value: cue.amount };
}

export function battleCuePose(cue, phase, reduced) {
  if (!reduced) return phase;
  return cue.resultAt !== null && phase.at < cue.resultAt ? cue.phases[0] : cue.still;
}

function fromEvent(row, event, holds) {
  const { card, turn } = row;
  const play = (id, details) => cue(id, turn, event.type, { holds, ...details });
  switch (event.type) {
    case 'heroAttack': {
      if (card !== 'slash' && card !== 'magic') throw new TypeError('Unexpected heroAttack');
      const damage = valueOf(event, 'damage');
      if (!damage) throw new TypeError('No zero-damage hero attack variant in v0.9');
      return play(card, { damage });
    }
    case 'focus':
      if (card !== 'focus') throw new TypeError('Unexpected focus');
      return play('focus');
    case 'heal':
      if (card !== 'heal') throw new TypeError('Unexpected heal');
      return play('heal', { amount: valueOf(event, 'amount') });
    case 'thornArmor':
      return play('thorns', { damage: valueOf(event, 'damage') });
    case 'enemyAttack': {
      if (row.enemyAction.type !== 'attack') throw new TypeError('Unexpected enemyAttack');
      const damage = valueOf(event, 'damage');
      return play('enemy-attack', { variant: damage === 0 ? 'no-hit' : 'full', damage });
    }
    case 'counter':
      if (card !== 'counter') throw new TypeError('Unexpected counter');
      return play('counter', { variant: 'response', damage: valueOf(event, 'damage') });
    default:
      throw new TypeError(`Unknown v0.9 battle event: ${event.type}`);
  }
}

function keepLethalPose(entry, state) {
  const target = state === 'win' ? 'enemy' : 'hero';
  const impact = entry?.phases.findLastIndex(phase => phase[target]?.startsWith('hit-')) ?? -1;
  if (impact < 0) throw new TypeError('Final turn is missing its lethal impact');
  const pose = entry.phases[impact][target];
  for (const phase of entry.phases.slice(impact + 1)) phase[target] = pose;
}

// The battle engine is the source of record. Enemy attack forecasts never create an attack cue.
export function buildBattleTimeline(battle) {
  const log = battle?.log;
  if (!Array.isArray(log) || log.length === 0) throw new TypeError('A v0.9 battle log is required');
  const timeline = [];
  let elapsed = 0;

  function add(entry) {
    timeline.push({ ...entry, at: elapsed });
    elapsed += entry.duration;
  }

  for (const [index, row] of log.entries()) {
    if (!row || row.turn !== index + 1 || !cards.has(row.card) ||
        !enemyActions.has(row.enemyAction?.type) || !Array.isArray(row.events) || !states.has(row.state) ||
        (row.state === 'ongoing') !== (index < log.length - 1)) {
      throw new TypeError(`Invalid v0.9 turn at index ${index}`);
    }

    const defense = defenseMotion[row.enemyAction.type];
    const holds = [];
    if (defense) {
      add(cue(defense, row.turn, 'stance', { variant: 'setup' }));
      holds.push(defense);
    }
    if (row.card === 'guard' || row.card === 'counter') {
      add(cue('guard', row.turn, 'preparation', { variant: 'setup', card: row.card, holds }));
      holds.push('guard');
    }
    for (const event of row.events) {
      if (!event || typeof event.type !== 'string') throw new TypeError('Invalid battle event');
      add(fromEvent(row, event, holds));
      if (event.type === 'enemyAttack' && holds.at(-1) === 'guard') holds.pop();
    }
    if (row.state !== 'ongoing') {
      if (row.state !== 'lose_timeout') keepLethalPose(timeline.at(-1), row.state);
      add(cue(terminalMotion[row.state], row.turn, 'terminal', {
        variant: row.state === 'lose_timeout' ? 'full' : 'outcome-only',
      }));
    }
  }

  const last = log.at(-1).state;
  if (last === 'win' ? battle.outcome !== 'win' || battle.reason !== null :
      battle.outcome !== 'loss' || battle.reason !== last) {
    throw new TypeError('Battle result does not match the final turn');
  }
  return { cues: timeline, duration: elapsed, outcome: battle.outcome, reason: battle.reason };
}
