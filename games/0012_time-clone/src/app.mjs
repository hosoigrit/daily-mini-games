import { activePhase, RECORD_LIMIT } from './domain.mjs';
import { keyboardDirections, Session } from './runtime.mjs';
import { ProgressStore, SAVE_KEY } from './progress.mjs';
import { stages } from './stages.mjs';

const el = id => document.getElementById(id);
const actionButtons = {
  READY: ['記録を開始', 'START_RECORD'],
  RECORDING: ['記録を終了', 'FINISH_RECORD'],
  RECORDED: ['分身を再生', 'START_REPLAY']
};
const phaseNames = {
  READY: '準備', RECORDING: '記録中', RECORDED: '記録完了',
  REPLAYING: '分身と再生中', SOLO_CONTINUE: '一人で続行', CLEARED: 'クリア'
};
const guides = {
  READY: '方向ボタン、矢印キー、WASDで移動。最大16枠の足取りを記録できます。',
  RECORDING: '記録を途中で終えると、残りの枠はその場で待機します。',
  RECORDED: 'スタートへ戻りました。再生すると分身が記録した位置をたどります。',
  REPLAYING: '分身と協力して扉を開け、プレイヤーをゴールへ。',
  SOLO_CONTINUE: '分身は16枠で消滅しました。プレイヤーはゴールまで進めます。',
  CLEARED: '星の数は記録と再生で成功した移動の合計で決まります。'
};

const storage = new ProgressStore({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value)
});
let session = null;
let tiles = [];
let notice = '';
let prompt = null;

function showSave() {
  const volatile = storage.mode === 'VOLATILE_ONLY';
  el('save-message').hidden = !volatile && !notice.startsWith('保存データを初期化しました');
  el('save-status').textContent = !volatile ? '保存データを初期化しました。' :
    storage.error === 'ERR_SAVE_CONFLICT'
      ? '別タブで保存データが変更されたため書き込みを中止しました。この画面では一時進捗のみ保持します。'
      : '保存データを利用できません。この画面では一時進捗のみ保持し、再読み込みすると失われる場合があります。';
  el('export-save').hidden = !volatile || storage.exportRaw() === null;
  el('reset-save').hidden = !storage.canReset;
}

function renderList() {
  el('stage-list').replaceChildren(...stages.map(stage => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stage = stage.id;
    button.disabled = !storage.isUnlocked(stage.id);
    const name = document.createElement('span');
    name.textContent = stage.id + '　' + stage.name;
    const label = document.createElement('span');
    const progress = storage.stage(stage.id);
    label.textContent = button.disabled ? '未解放' : progress?.cleared ? '★'.repeat(progress.bestStars) : '挑戦する';
    button.append(name, label);
    button.addEventListener('click', () => choose(stage.id));
    item.append(button);
    return item;
  }));
}

function choose(id) {
  if (!storage.isUnlocked(id)) return;
  const stage = stages.find(stage => stage.id === id);
  session?.dispose();
  notice = '';
  session = new Session(stage, {
    onChange: change => {
      if (change.type === 'INPUT_REJECTED_FULL') notice = '入力予約が満杯です。ボタンを離してから再操作してください。';
      if (change.type === 'COMMAND' || change.type === 'RESUME') notice = '';
      if (change.type === 'PAUSE' && change.reason === 'PERFORMANCE') notice = '時計の遅延を検知したため停止しました。';
      if (change.events?.some(event => event.startsWith('LATCH_'))) notice = '同期解錠に成功しました。';
      if (change.events?.includes('GHOST_DISAPPEARED')) notice = '分身が消滅しました。';
      renderGame();
    },
    onClear: result => {
      storage.clear(stage.id, result);
      showSave();
    }
  });
  el('selection').hidden = true;
  el('return').hidden = false;
  el('game').hidden = false;
  el('level-title').textContent = 'ステージ ' + id + '　' + stage.name;
  el('board').style.setProperty('--columns', stage.width);
  tiles = stage.mapRows.flatMap((row, y) => [...row].map((tile, x) => {
    const cell = document.createElement('div');
    cell.className = 'tile';
    cell.dataset.tile = tile;
    cell.dataset.x = x;
    cell.dataset.y = y;
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }));
  el('board').replaceChildren(...tiles);
  renderGame();
  if (document.hidden) session.visibility(true);
  el('level-title').focus();
}

function marker(kind, overlap = false) {
  const dot = document.createElement('i');
  dot.className = 'marker ' + kind + (overlap ? ' overlap' : '');
  return dot;
}

function renderBoard(state, stage) {
  const at = (x, y, position) => position?.[0] === Number(x) && position?.[1] === Number(y);
  for (const cell of tiles) {
    const { tile, x, y } = cell.dataset;
    const active = Object.hasOwn(state.switchStates, tile);
    const door = state.doorStates[tile];
    if (active) {
      cell.dataset.kind = 'switch';
      cell.dataset.on = state.switchStates[tile];
    }
    if (door) {
      cell.dataset.kind = 'door';
      cell.dataset.door = door;
    }
    cell.textContent = active || door ? tile : tile === 'G' ? '◎' : '';
    const player = at(x, y, state.playerPosition);
    if (player) cell.append(marker('player'));
    if (at(x, y, state.ghostPosition)) cell.append(marker('ghost', player));
  }
  const doors = stage.doors.map(door => {
    const condition = door.requiredSwitchIds.join(door.type === 'LATCH' ? '＋' : '');
    const text = { CLOSED: '閉', OPEN: '開', HELD_OPEN: '閉鎖保留' }[state.doorStates[door.id]];
    return condition + ' → ' + door.id + ' ' + text;
  });
  el('mechanisms').textContent = doors.join('　／　');
}

function renderGame() {
  if (!session) return;
  const { state, stage, resumeRequired, reasons } = session;
  const { phase, recordTick, replayTick, ghostRecord, clearResult } = state;
  renderBoard(state, stage);
  el('game').dataset.phase = phase;
  el('game').dataset.tick = phase === 'RECORDING' || phase === 'RECORDED' ? recordTick : replayTick;
  el('phase').textContent = phaseNames[phase] + (resumeRequired ? ' / 停止中' : '');
  const padded = ghostRecord ? RECORD_LIMIT - ghostRecord.recordCompletedTicks : 0;
  el('guide').textContent = guides[phase] + (phase === 'RECORDED' && padded ? ' 残り' + padded + '枠は待機です。' : '');
  el('turn').textContent = phase === 'RECORDING' || phase === 'RECORDED'
    ? '記録 ' + recordTick + ' / 16 枠' : activePhase(phase) || clearResult ? '再生 ' + replayTick + ' 枠' : '';
  const completed = phase === 'RECORDING' || phase === 'RECORDED' ? recordTick : replayTick;
  el('timeline').replaceChildren(...Array.from({ length: RECORD_LIMIT }, (_, i) => {
    const bar = document.createElement('span');
    if (i < completed) bar.dataset.done = '';
    if (phase === 'RECORDED' && i >= recordTick) bar.dataset.padded = '';
    return bar;
  }));
  el('notice').textContent = [notice, resumeRequired
    ? '方向キー／ボタンから手を離してください。復帰できない場合は「入力状態をリセット」を選んでください。' : '']
    .filter(Boolean).join(' ');
  const primary = el('primary');
  const button = actionButtons[phase];
  primary.hidden = !resumeRequired && !button;
  primary.disabled = reasons.has('HIDDEN');
  primary.textContent = resumeRequired ? '再開' : button?.[0] ?? '';
  primary.dataset.command = resumeRequired ? 'RESUME' : button?.[1] ?? '';
  el('retry').hidden = !['REPLAYING', 'SOLO_CONTINUE'].includes(phase);
  el('rerecord').hidden = !['RECORDED', 'REPLAYING', 'SOLO_CONTINUE'].includes(phase);
  el('pause').hidden = !activePhase(phase) || resumeRequired;
  el('rearm').hidden = !resumeRequired;
  el('directions').hidden = !activePhase(phase) || resumeRequired;
  el('result').hidden = !clearResult;
  if (clearResult) {
    el('stars').textContent = '★'.repeat(clearResult.stars) + '☆'.repeat(3 - clearResult.stars);
    el('moves').textContent = '合計 ' + clearResult.totalMoves + ' 手（記録 ' + clearResult.recordMoves + '・再生 ' + clearResult.replayMoves + '）';
    el('next').hidden = !storage.isUnlocked(Number(stage.id) + 1);
  }
}

function showPrompt(title, description, confirmLabel, onDecision) {
  prompt = onDecision;
  const dialog = el('confirmation');
  dialog.returnValue = 'cancel';
  el('confirm-title').textContent = title;
  el('confirm-description').textContent = description;
  el('confirm').textContent = confirmLabel;
  dialog.showModal();
}

el('confirmation').addEventListener('close', event => {
  const action = prompt;
  prompt = null;
  action?.(event.target.returnValue === 'confirm');
});
el('return').addEventListener('click', () => {
  session?.dispose();
  session = null;
  el('return').hidden = true;
  el('game').hidden = true;
  el('selection').hidden = false;
  renderList();
  el('stage-heading').focus();
});
el('primary').addEventListener('click', event => {
  const command = event.target.dataset.command;
  if (command === 'RESUME') session?.resume();
  else if (command) session?.command(command);
});
el('retry').addEventListener('click', () => session?.command('RETRY'));
el('rerecord').addEventListener('click', () => session?.command('RERECORD'));
el('pause').addEventListener('click', () => session?.pause('USER'));
el('rearm').addEventListener('click', () => {
  showPrompt('入力状態をリセット', 'すべての移動キーと方向ボタンから手を離したことを確認してください。リセット後は「再開」を押せます。', '手を離しました', confirmed => {
    if (confirmed) session?.rearm();
  });
});
el('next').addEventListener('click', () => {
  if (session) choose(String(Number(session.stage.id) + 1));
});
el('export-save').addEventListener('click', () => {
  const raw = storage.exportRaw();
  if (raw === null) return;
  const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'game-0012-save.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el('reset-save').addEventListener('click', () => {
  if (!storage.beginReset()) return;
  if (session?.canMove) session.pause('USER');
  showPrompt('保存データを初期化', 'このゲームの保存データと一時進捗は失われ、元には戻せません。先に同じゲームを開いている別タブ・別ウィンドウを閉じてください。必要な元データは保存してから進んでください。', '内容を確認しました', accepted => {
    if (!accepted || !storage.confirmLoss()) {
      storage.cancelReset();
      return;
    }
    showPrompt('初期化の最終確認', 'このゲームの保存データを空の進捗に置き換えます。', '初期化を実行', confirmed => {
      if (!confirmed) {
        storage.cancelReset();
        return;
      }
      if (storage.confirmReset()) notice = '保存データを初期化しました';
      else notice = '保存データの初期化を完了できませんでした。';
      renderList();
      renderGame();
      showSave();
    });
  });
});

window.addEventListener('keydown', event => {
  const direction = keyboardDirections[event.code];
  if (!session || !direction || event.altKey || event.ctrlKey || event.metaKey || el('confirmation').open) return;
  if (session.canMove && event.code.startsWith('Arrow')) event.preventDefault();
  session.press('key:' + event.code, direction, { repeat: event.repeat });
});
window.addEventListener('keyup', event => {
  if (keyboardDirections[event.code]) session?.input.release('key:' + event.code);
});
for (const button of el('directions').querySelectorAll('button')) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !session) return;
    event.preventDefault();
    if (event.isTrusted) button.setPointerCapture(event.pointerId);
    session.press('pointer:' + event.pointerId, button.dataset.direction);
  });
}
window.addEventListener('pointerup', event => session?.input.release('pointer:' + event.pointerId));
window.addEventListener('pointercancel', event => session?.input.release('pointer:' + event.pointerId, { cancelled: true }));
window.addEventListener('blur', () => {
  if (session && activePhase(session.state.phase)) session.pause(document.hidden ? 'HIDDEN' : null);
});
document.addEventListener('visibilitychange', () => {
  if (session && activePhase(session.state.phase)) session.visibility(document.hidden);
});
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage || (event.key !== SAVE_KEY && event.key !== null)) return;
  storage.observeStorageChange();
  if (el('confirmation').open && el('confirm-title').textContent.includes('初期化')) el('confirmation').close('cancel');
  showSave();
});

renderList();
showSave();
