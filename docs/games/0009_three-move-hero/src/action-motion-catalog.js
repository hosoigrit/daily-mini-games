const phase = (at, name, poses = {}, effect = null) => Object.freeze({ at, name, ...poses, effect });
const motion = (code, id, name, duration, description, phases, { terminal = false, still = phases[0] } = {}) =>
  Object.freeze({ code, id, name, duration, description, phases: Object.freeze(phases), terminal, still });

const heroHit = phase(110, '衝撃', { hero: 'hit-left' }, 'hero-impact');
const enemyHit = phase(110, '衝撃', { enemy: 'hit-right' }, 'enemy-impact');

export const MOTIONS = Object.freeze([
  motion('M01', 'slash', '斬撃', 800, '勇者が踏み込み、剣の軌道が走った後に魔物がよろめきます。', [
    phase(0, '踏み込み', { hero: 'step' }),
    phase(190, '振り抜き', { hero: 'swing' }, 'slash'),
    phase(330, '魔物に命中', { hero: 'swing', enemy: 'hit-right' }, 'enemy-impact'),
    phase(540, '復帰'),
  ], { still: phase(0, '斬撃が魔物に命中', {}, 'slash') }),
  motion('M02', 'magic', '魔法', 950, '勇者の詠唱から魔法弾が飛び、魔物の前で弾けます。', [
    phase(0, '詠唱', { hero: 'cast' }, 'hero-rune'),
    phase(210, '発射', { hero: 'cast' }, 'launch'),
    phase(290, '飛翔', { hero: 'cast' }, 'projectile'),
    phase(615, '魔物に着弾', { enemy: 'hit-right' }, 'magic-impact'),
    phase(790, '復帰'),
  ], { still: phase(0, '魔法弾が魔物に着弾', {}, 'magic-impact') }),
  motion('M03', 'enemy-attack', '敵攻撃', 850, '魔物が身構えて接近し、爪を振ると勇者がよろめきます。', [
    phase(0, '構え', { enemy: 'crouch' }),
    phase(140, '接近', { enemy: 'approach' }),
    phase(310, '爪攻撃', { enemy: 'claw' }, 'claw'),
    phase(440, '勇者に命中', { hero: 'hit-left', enemy: 'claw' }, 'hero-impact'),
    phase(610, '魔物が復帰'),
  ], { still: phase(0, '魔物の爪が勇者に命中', {}, 'claw') }),
  motion('M04', 'guard', 'ガード', 750, '勇者が身をかがめ、前面に盾を出してから解除します。', [
    phase(0, '防御姿勢', { hero: 'brace' }),
    phase(130, '盾を展開', { hero: 'brace' }, 'shield'),
    phase(520, '盾を解除'),
  ], { still: phase(0, '勇者が盾で防御', { hero: 'brace' }, 'shield') }),
  motion('M05', 'hit', '被弾', 550, '選んだキャラクターが短く明るくなり、後ろへよろめいたあと復帰します。', [
    phase(0, '被弾の構え', { hero: 'brace' }), heroHit,
    phase(280, 'のけぞり', { hero: 'recoil-left' }), phase(410, '復帰'),
  ], { still: heroHit }),
  motion('M06', 'counter', 'カウンター', 850, '勇者が受け止め、短く踏み込んで斬り返します。', [
    phase(0, '防御', { hero: 'brace' }, 'shield'),
    phase(145, '勇者がよろめく', { hero: 'hit-left' }, 'hero-impact'),
    phase(330, '斬り返し', { hero: 'swing' }, 'slash'),
    phase(475, '魔物に命中', { enemy: 'hit-right' }, 'enemy-impact'),
    phase(660, '復帰'),
  ], { still: phase(0, '勇者が斬り返す', {}, 'slash') }),
  motion('M07', 'focus', '気合', 750, '勇者が集中し、金色のオーラをまといます。', [
    phase(0, '集中', { hero: 'brace' }),
    phase(180, '金色のオーラ', { hero: 'cast' }, 'gold'),
    phase(565, '復帰'),
  ], { still: phase(0, '勇者に金色のオーラ', { hero: 'cast' }, 'gold') }),
  motion('M08', 'heal', '回復', 900, '勇者の足元から緑の光粒が上がり、回復のポーズを取ります。', [
    phase(0, '回復の構え', { hero: 'cast' }),
    phase(160, '緑の光粒', { hero: 'recover' }, 'heal'),
    phase(680, '復帰'),
  ], { still: phase(0, '勇者を緑の光が包む', { hero: 'recover' }, 'heal') }),
  motion('M09', 'physical-guard', '物理防御', 700, '魔物が身体を縮め、前面に角張った鋼の装甲を出します。', [
    phase(0, '身体を縮める', { enemy: 'crouch' }),
    phase(135, '鋼の装甲', { enemy: 'crouch' }, 'armor'),
    phase(500, '装甲を解除'),
  ], { still: phase(0, '魔物が鋼の装甲で防御', { enemy: 'crouch' }, 'armor') }),
  motion('M10', 'magic-ward', '魔法結界', 800, '魔物が詠唱し、青紫色の円形結界を展開します。', [
    phase(0, '魔物の詠唱', { enemy: 'chant' }, 'enemy-rune'),
    phase(235, '青紫の結界', { enemy: 'chant' }, 'ward'),
    phase(620, '結界を解除'),
  ], { still: phase(0, '魔物が青紫の結界を展開', { enemy: 'chant' }, 'ward') }),
  motion('M11', 'thorns', '棘反動', 700, '魔物の棘が光り、反動の光が勇者へ戻ります。', [
    phase(0, '魔物の棘が発光', { enemy: 'chant' }, 'thorns'),
    phase(205, '反動が勇者へ飛ぶ', {}, 'rebound'),
    phase(420, '勇者がよろめく', { hero: 'hit-left' }, 'hero-impact'),
    phase(560, '復帰'),
  ], { still: phase(0, '魔物の棘の反動が勇者に届く', {}, 'hero-impact') }),
  motion('M12', 'victory', '勝利', 1100, '魔物が倒れ、勇者が剣を掲げます。リセットまでポーズを保持します。', [
    phase(0, '魔物がよろめく', { enemy: 'hit-right' }, 'enemy-impact'),
    phase(285, '魔物撃破', { enemy: 'down' }),
    phase(560, '勇者が剣を掲げる', { hero: 'victor', enemy: 'down' }, 'victory'),
  ], { terminal: true }),
  motion('M13', 'defeat', '敗北', 1100, '勇者が崩れ落ち、魔物が威嚇します。リセットまでポーズを保持します。', [
    phase(0, '勇者がよろめく', { hero: 'hit-left' }),
    phase(300, '勇者が崩れ落ちる', { hero: 'fallen' }),
    phase(580, '魔物が威嚇する', { hero: 'fallen', enemy: 'menace' }, 'menace'),
  ], { terminal: true }),
  motion('M14', 'timeout', '時間切れ', 650, '両者がその場で停止し、時間切れと表示します。', [
    phase(0, '戦闘停止'),
    phase(240, '時間切れ', {}, 'clock'),
  ], { terminal: true }),
]);

export function getMotion(id, { target = 'hero' } = {}) {
  const found = MOTIONS.find(item => item.id === id || item.code === id);
  if (!found || (found.id === 'hit' && !['hero', 'enemy'].includes(target))) return undefined;
  if (found.id !== 'hit' || target === 'hero') return found;

  return {
    ...found, still: enemyHit,
    phases: [phase(0, '魔物の被弾', { enemy: 'crouch' }), enemyHit,
      phase(280, '魔物がのけぞる', { enemy: 'recoil-right' }), phase(410, '復帰')],
  };
}
