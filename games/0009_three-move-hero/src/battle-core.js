const CARD_IDS = new Set(['slash', 'magic', 'guard', 'focus', 'heal', 'counter']);
const ENEMY_ACTIONS = new Set(['attack', 'physicalGuard', 'magicWard']);
const MAX_TURNS = 3;

function isIntegerAtLeast(value, minimum) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function validateRating(rating, heroMaxHp) {
  const { star2MinHp, star3 } = rating ?? {};
  if (!isIntegerAtLeast(star2MinHp, 1) ||
      !isIntegerAtLeast(star3?.minHp, star2MinHp) || star3.minHp > heroMaxHp) {
    throw new RangeError('Invalid star HP thresholds');
  }

  const objective = star3.objective;
  switch (objective?.type) {
    case 'finishWithinTurns':
      if (isIntegerAtLeast(objective.maxTurns, 1) && objective.maxTurns <= MAX_TURNS) return;
      break;
    case 'cardExecuted':
    case 'cardNotExecuted':
      if (CARD_IDS.has(objective.cardId)) return;
      break;
  }
  throw new TypeError('Invalid star objective');
}

function validateStage(stage, heroStartHp) {
  if (typeof stage?.stageId !== 'string' || !stage.stageId.trim()) {
    throw new TypeError('Invalid stage ID');
  }
  if (!isIntegerAtLeast(stage.heroMaxHp, 1) || !isIntegerAtLeast(stage.enemyMaxHp, 1) ||
      !isIntegerAtLeast(heroStartHp, 1) || heroStartHp > stage.heroMaxHp) {
    throw new RangeError('Invalid battle HP');
  }

  const { hand, enemyActions, passives } = stage;
  if (!Array.isArray(hand) || hand.length !== 5 || new Set(hand).size !== 5 ||
      ![...hand].every(id => CARD_IDS.has(id))) {
    throw new TypeError('Stage hand must contain five distinct known cards');
  }
  if (!Array.isArray(enemyActions) || enemyActions.length !== MAX_TURNS ||
      ![...enemyActions].every(action => ENEMY_ACTIONS.has(action?.type) &&
        (action.type === 'attack' ? isIntegerAtLeast(action.power, 0) : !Object.hasOwn(action, 'power')))) {
    throw new TypeError('Invalid enemy action schedule');
  }
  if (!Array.isArray(passives) || passives.length > 1 ||
      ![...passives].every(id => id === 'thornArmor')) {
    throw new TypeError('Invalid enemy passives');
  }
  validateRating(stage.rating, stage.heroMaxHp);
}

function validatePlan(plan, hand) {
  if (!Array.isArray(plan) || plan.length !== MAX_TURNS || new Set(plan).size !== MAX_TURNS ||
      ![...plan].every(id => hand.includes(id))) {
    throw new TypeError('Plan must contain three distinct cards from the stage hand');
  }
}

function countStars(rating, heroHp, executed) {
  if (heroHp < rating.star2MinHp) return 1;
  if (heroHp < rating.star3.minHp) return 2;

  const objective = rating.star3.objective;
  switch (objective.type) {
    case 'finishWithinTurns':
      return executed.length <= objective.maxTurns ? 3 : 2;
    case 'cardExecuted':
      return executed.includes(objective.cardId) ? 3 : 2;
    case 'cardNotExecuted':
      return executed.includes(objective.cardId) ? 2 : 3;
  }
}

function resolveTurn(before, card, enemyAction, stage) {
  let { heroHp, enemyHp, focused } = before;
  let attackReduction = 0;
  let slashDamage = 0;
  const events = [];

  switch (card) {
    case 'slash': {
      const reduction = enemyAction.type === 'physicalGuard' ? 3 : 0;
      slashDamage = Math.min(enemyHp, Math.max(0, 4 + (focused ? 4 : 0) - reduction));
      enemyHp -= slashDamage;
      focused = false;
      events.push({ type: 'heroAttack', damage: slashDamage });
      break;
    }
    case 'magic': {
      const reduction = enemyAction.type === 'magicWard' ? 2 : 0;
      const damage = Math.min(enemyHp, 3 - reduction);
      enemyHp -= damage;
      events.push({ type: 'heroAttack', damage });
      break;
    }
    case 'guard':
      attackReduction = 5;
      break;
    case 'focus':
      focused = true;
      events.push({ type: 'focus' });
      break;
    case 'heal': {
      const amount = Math.min(3, stage.heroMaxHp - heroHp);
      heroHp += amount;
      events.push({ type: 'heal', amount });
      break;
    }
    case 'counter':
      attackReduction = 3;
      break;
  }

  if (enemyHp > 0 && slashDamage > 0 && stage.passives.includes('thornArmor')) {
    heroHp -= 1;
    events.push({ type: 'thornArmor', damage: 1 });
  }
  if (enemyHp > 0 && heroHp > 0 && enemyAction.type === 'attack') {
    const damage = Math.min(heroHp, Math.max(0, enemyAction.power - attackReduction));
    heroHp -= damage;
    events.push({ type: 'enemyAttack', damage });

    if (card === 'counter' && heroHp > 0) {
      const damage = Math.min(enemyHp, 2);
      enemyHp -= damage;
      events.push({ type: 'counter', damage });
    }
  }

  return { after: { heroHp, enemyHp, focused }, events };
}

// Uses the frozen manifest stage shape. Live battles start at full hero HP.
// An explicit starting HP also allows deterministic v0.9 boundary scenarios.
export function simulateBattle(stage, plan, { heroStartHp = stage?.heroMaxHp } = {}) {
  validateStage(stage, heroStartHp);
  validatePlan(plan, stage.hand);

  let current = { heroHp: heroStartHp, enemyHp: stage.enemyMaxHp, focused: false };
  const log = [];
  const executed = [];
  let state = 'ongoing';

  for (const [index, card] of plan.entries()) {
    const turn = index + 1;
    const { type, power } = stage.enemyActions[index];
    const enemyAction = type === 'attack' ? { type, power } : { type };
    const before = current;
    const { after, events } = resolveTurn(before, card, enemyAction, stage);
    current = after;
    executed.push(card);

    if (after.enemyHp === 0) state = 'win';
    else if (after.heroHp === 0) state = 'lose_dead';
    else if (turn === MAX_TURNS) state = 'lose_timeout';

    log.push({ turn, card, enemyAction, before, events, after, state });
    if (state !== 'ongoing') break;
  }

  const { heroHp, enemyHp } = current;
  const won = state === 'win';
  return {
    outcome: won ? 'win' : 'loss',
    reason: won ? null : state,
    heroHp,
    enemyHp,
    stars: won ? countStars(stage.rating, heroHp, executed) : 0,
    executed,
    turns: executed.length,
    log,
  };
}
