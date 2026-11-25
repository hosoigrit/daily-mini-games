const CARD_ICONS = { slash: '⚔', magic: '✦', guard: '⛨', focus: '◆', heal: '✚', counter: '↶' };
const ACTIONS = { physicalGuard: '物理防御', magicWard: '魔法結界', attack: '通常攻撃' };
const SAVE_MESSAGES = {
  empty: '保存記録なし', saved: '保存確認済み', checking: '保存結果を確認中', queued: '以前の保存結果の確認を待っています',
  not_saved: '保存不可', unverified: '保存結果を確認できません', blocked: '保存データを保護中',
};
const REASONS = {
  unsupported_schema: '未対応の保存形式です。元データを保護しています。',
  invalid_json: '保存データのJSONが壊れています。',
  invalid_records: '保存データに無効な記録があります。',
  invalid_save: '保存データの形式が不正です。',
  read_failed: 'ストレージを読み取れません。',
  locks_unavailable: 'この環境では排他ロックを利用できません。',
  fingerprint_collision: 'ルール指紋の整合性を確認できません。',
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (action, text, { value = '', disabled = false, primary = false, label = '' } = {}) =>
  `<button type="button" data-action="${action}" data-value="${escape(value)}"${disabled ? ' disabled' : ''}${primary ? ' class="primary"' : ''}${label ? ` aria-label="${escape(label)}"` : ''}>${text}</button>`;
const heading = text => `<h1 tabindex="-1" id="screen-title">${text}</h1>`;
const starLine = n => `<span class="stars" aria-label="星${n}つ">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
const hp = (hero, enemy) => `<div class="hp"><span>勇者 <strong>HP ${hero}</strong></span><span>敵 <strong>HP ${enemy}</strong></span></div>`;
const saveText = (status, reason) => [SAVE_MESSAGES[status], REASONS[reason]].filter(Boolean).join('。');

function forecast(action) {
  return action.type === 'attack' ? `${ACTIONS.attack} ${action.power}` : ACTIONS[action.type];
}

function objectiveText(objective, cards) {
  if (objective.type === 'finishWithinTurns') return `${objective.maxTurns}手以内に勝利する`;
  return `${cards[objective.cardId].name}を${objective.type === 'cardExecuted' ? '使う' : '使わない'}`;
}

function cardName(id, cards) { return escape(cards[id].name); }

function stageList(game) {
  const { state, progress } = game;
  const stages = progress.stages().filter(s => s.group === state.group);
  return `<section class="board" aria-labelledby="screen-title">
    <header class="section-head">${heading('ステージ選択')}<p>敵の行動を読み、勝利につながる3手を選ぼう。</p></header>
    <div class="tabs" role="group" aria-label="ステージの種類">
      <button type="button" data-action="group" data-value="main" aria-pressed="${state.group === 'main'}">表ステージ</button>
      <button type="button" data-action="group" data-value="extra" aria-pressed="${state.group === 'extra'}">裏ステージ</button>
    </div>
    <ol class="stage-list">${stages.map(s => {
      const label = s.unlocked ? s.unlockSource === 'session' ? 'セッション限定で解放' : s.historicalUnlock ? '旧ルールのクリアで解放済み' : '解放済み' : '未解放';
      return `<li><button type="button" class="stage" data-action="enter" data-value="${escape(s.stageId)}"${s.unlocked ? '' : ' disabled'}>
        <span class="stage-number">${s.group === 'main' ? '表' : '裏'} ${String(s.order).padStart(2, '0')}</span>
        <span class="stage-info"><strong>${escape(s.title)}</strong><small>${label}</small></span>
        <span class="stage-record">${starLine(s.persisted.maxStars)}<small>${s.persisted.maxStars ? '現行ルール・保存済み' : '現行ルール・記録なし'}</small>
        ${s.sessionOnly ? `<small>セッション限定 星${s.local.maxStars}</small>` : ''}${s.waiting ? '<small>保存確認中</small>' : ''}</span>
      </button></li>`;
    }).join('')}</ol>
  </section>`;
}

function planning(game, manifest) {
  const { state } = game;
  const stage = game.currentStage();
  const cards = manifest.cardCatalog;
  return `<header class="section-head">${heading(escape(stage.title))}${hp(stage.heroMaxHp, stage.enemyMaxHp)}</header>
  <div class="columns">
    <section class="panel" aria-labelledby="forecast"><h2 id="forecast">敵の行動予告</h2><ol class="forecast">
      ${stage.enemyActions.map(a => `<li>${escape(forecast(a))}</li>`).join('')}</ol>
      <p>特殊能力 ${stage.passives.length ? stage.passives.map(id => id === 'thornArmor' ? '棘の鎧' : escape(id)).join('・') : 'なし'}</p>
      ${stage.passives.map(id => `<p class="muted">${escape(manifest.passiveCatalog[id].description)}</p>`).join('')}
      <h2>星3の条件</h2><p>残りHP ${stage.rating.star3.minHp}以上 ＋ ${escape(objectiveText(stage.rating.star3.objective, cards))}</p>
      <div class="actions">${button('hint', 'ヒント1', { value: 1 })}${button('hint', 'ヒント2', { value: 2 })}
      ${state.hints ? button('hint', '閉じる', { value: 0 }) : ''}</div>
      ${state.hints ? `<p role="status" class="hint">${state.hints === 1 ? escape(stage.hints.level1) : `最初の手は ${cardName(stage.hints.level2.cardId, cards)}`}</p>` : ''}
      ${state.usedHint ? '<p class="muted">この挑戦ではヒントを使用済み</p>' : ''}
    </section>
    <section class="panel" aria-labelledby="plan-title"><h2 id="plan-title">3手の編成</h2>
      <ol class="slots" aria-label="実行順">${Array.from({ length: 3 }, (_, i) => {
        const card = state.plan[i];
        return `<li><span class="slot-index">${i + 1}</span><strong>${card ? cardName(card, cards) : '未選択'}</strong>
          ${card ? `<span class="slot-controls">${button('move', '左', { value: `${i}:-1`, disabled: i === 0, label: `${cards[card].name}を左へ移動` })}
          ${button('move', '右', { value: `${i}:1`, disabled: i === state.plan.length - 1, label: `${cards[card].name}を右へ移動` })}
          ${button('card', '取消', { value: card, label: `${cards[card].name}を取り消す` })}</span>` : ''}</li>`;
      }).join('')}</ol>
      <p class="sr" aria-live="polite">選択済み ${state.plan.length}枚。 ${state.plan.map(id => cardName(id, cards)).join('、')}</p>
      <h3>手札</h3><div class="hand">${stage.hand.map(id => {
        const selected = state.plan.includes(id);
        return `<button type="button" class="card" data-action="card" data-value="${id}" aria-pressed="${selected}"${!selected && state.plan.length === 3 ? ' disabled' : ''}>
        <span aria-hidden="true" class="card-icon">${CARD_ICONS[id]}</span><strong>${cardName(id, cards)}</strong>
        <span>${escape(cards[id].description)}</span></button>`;
      }).join('')}</div>
      <div class="actions">${button('start', '戦闘開始', { primary: true, disabled: !game.canStart() })}
        ${button('stages', 'ステージ選択へ')}</div>
    </section>
  </div>`;
}

const outcomeText = { win: '敵を倒した', lose_dead: '勇者のHPが0になった', lose_timeout: '3ターンで敵を倒せなかった', ongoing: '戦闘継続' };

export function turnText(turn, cards) {
  const effects = turn.events.map(event => ({
    heroAttack: `敵に ${event.damage} ダメージ`,
    enemyAttack: `勇者に ${event.damage} ダメージ`,
    thornArmor: `棘の反動で勇者に ${event.damage} ダメージ`,
    focus: '気合をためた', heal: `勇者が ${event.amount} 回復`,
    counter: `反撃で敵に ${event.damage} ダメージ`,
  })[event.type]).filter(Boolean);
  return [cards[turn.card].name, `敵の予定 ${forecast(turn.enemyAction)}`, ...effects,
    `勇者HP ${turn.after.heroHp} ／ 敵HP ${turn.after.enemyHp}`, outcomeText[turn.state]].join('。');
}

function logMarkup(turns, cards) {
  return `<ol class="battle-log">${turns.map(turn => `<li>${escape(turnText(turn, cards))}</li>`).join('')}</ol>`;
}

function battleView(game, cards) {
  const { state } = game;
  const stage = game.currentStage();
  const battle = state.battle;
  const visible = battle.log.slice(0, state.frames);
  const current = visible.at(-1)?.after ?? { heroHp: stage.heroMaxHp, enemyHp: stage.enemyMaxHp };
  if (state.screen === 'playing') {
    return `<section class="panel" aria-labelledby="screen-title">${heading('自動戦闘')}
      ${hp(current.heroHp, current.enemyHp)}
      <p role="status">${state.frames ? `第${state.frames}ターン` : '戦闘開始'}</p>
      ${logMarkup(visible, cards)}${button('skip', '戦闘をスキップ')}</section>`;
  }

  const won = battle.outcome === 'win';
  const next = won && game.nextStage();
  const status = won ? state.saveStatus : undefined;
  return `<header class="section-head result-head">${heading(won ? 'VICTORY' : 'DEFEAT')}
      <p>${escape(stage.title)} ・ ${outcomeText[won ? 'win' : battle.reason]}${won && battle.turns < 3 ? '（早期勝利）' : ''}</p></header>
    <div class="columns">
      <section class="panel" aria-label="戦闘結果">${starLine(battle.stars)}${hp(battle.heroHp, battle.enemyHp)}
        <p>実行済み ${battle.executed.map(id => cardName(id, cards)).join(' → ')}</p>
        <p>未実行 ${state.plan.slice(battle.executed.length).map(id => cardName(id, cards)).join('、') || 'なし'}</p>
        <p>星3条件 ${battle.stars === 3 ? '達成' : '未達成'}</p>
        ${status ? `<p role="status">${saveText(status, game.progress.reason)}${status === 'not_saved' || status === 'blocked' ? '。このクリアはセッション内で利用できます。' : ''}</p>` : ''}
        <div class="actions">${button('retry', '再挑戦', { primary: !next })}${next ? button('enter', '次ステージ', { value: next.stageId, primary: true }) : ''}${button('stages', 'ステージ選択')}</div>
      </section>
      <section class="panel"><h2>戦闘ログ</h2>${logMarkup(visible, cards)}</section>
    </div>`;
}

function settingsView(state) {
  return `<section class="panel">${heading('設定')}
    <form id="preferences">
      <label for="speed">戦闘速度</label>
      <select id="speed" name="speed">${[['normal', '通常'], ['fast', '高速'], ['instant', '即時']].map(([value, text]) =>
        `<option value="${value}"${state.preferences.battleSpeed === value ? ' selected' : ''}>${text}</option>`).join('')}</select>
      <label class="checkbox"><input type="checkbox" name="motion"${state.preferences.reducedMotion ? ' checked' : ''}> 動きを軽減する</label>
      <p class="muted">端末の動き軽減設定も反映します。</p>
      <div class="actions"><button type="submit" class="primary">設定を保存</button>${button('back', '戻る')}</div>
    </form><p role="status">${saveText(state.settingsStatus)}</p>
  </section>`;
}

function management(game) {
  const { state, progress } = game;
  const item = state.preview;
  const previewable = item?.status === 'preview';
  const recovery = state.mode === 'recovery';
  const content = recovery ? item?.candidate : { progress: item?.progress, settings: item?.settings };
  return `<section class="panel">${heading('保存データ管理')}
    <p role="status">${saveText(progress.status, progress.reason) || '保存状態を確認できます。'}</p>
    <div class="actions">${button('recheck', '保存結果を再確認', { disabled: state.busy || progress.busy || !progress.pending })}
      ${button('preview', '復旧をプレビュー', { value: 'recovery', disabled: state.busy || progress.busy || progress.pending })}
      ${button('preview', '旧v1移行をプレビュー', { value: 'migration', disabled: state.busy || progress.busy || progress.pending })}</div>
    ${item ? `<section aria-label="確認内容"><h2>${recovery ? '復旧候補' : '旧v1移行候補'}</h2>
      ${previewable ? `<pre>${escape(JSON.stringify(content, null, 2))}</pre><div class="actions">${recovery
        ? button('confirm', '復旧の確認へ', { value: 'recover', disabled: state.busy })
        : button('confirm', '進捗移行の確認へ', { value: 'migrate', disabled: state.busy }) +
          button('confirm', '設定移行の確認へ', { value: 'migrateSettings', disabled: state.busy })}</div>` : '<p>実行できる候補はありません。</p>'}
      ${item.exportRaw === undefined ? '' : `<details><summary>元データを表示</summary><pre>${escape(item.exportRaw)}</pre></details>`}
      </section>` : ''}
    ${state.managementStatus ? `<p role="status">${saveText(state.managementStatus)}</p>` : ''}
    ${button('back', '戻る', { disabled: state.busy })}
  </section>`;
}

export function renderScreen(game, manifest) {
  const { state, progress } = game;
  const views = {
    'stage-select': () => stageList(game), planning: () => planning(game, manifest),
    playing: () => battleView(game, manifest.cardCatalog), result: () => battleView(game, manifest.cardCatalog),
    settings: () => settingsView(state), 'recovery-preview': () => management(game),
  };
  return `<header class="masthead"><span class="brand"><span aria-hidden="true">✦</span> 3手の勇者</span>
    <nav aria-label="ゲームメニュー">${button('settings', '設定', { disabled: state.screen === 'playing' || state.busy })}
    ${button('manage', '保存データ', { disabled: state.screen === 'playing' || state.busy })}</nav></header>
    <main id="main" class="main">
      ${['not_saved', 'blocked', 'unverified'].includes(progress.status) && state.screen !== 'recovery-preview'
        ? `<aside class="notice" role="status">${saveText(progress.status, progress.reason)}。セッション内では遊べます。</aside>` : ''}
      ${views[state.screen]?.() ?? heading('読み込み中')}
    </main>`;
}
