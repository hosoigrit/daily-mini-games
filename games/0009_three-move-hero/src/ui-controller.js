import { createProgressStorage } from './progress-storage.js';
import { createSettingsStorage } from './settings-storage.js';
import { createGame } from './ui-state.js';
import { renderScreen } from './ui-renderer.js';

const root = document.querySelector('#game');
const confirmations = {
  recover: ['保存データを復旧しますか？', '表示した候補を、元データのバックアップを確認してから保存します。'],
  migrate: ['旧v1の進捗を移行しますか？', '表示した星を旧ルールの記録として取り込みます。旧キーと現行ルールの記録は保持します。'],
  migrateSettings: ['旧v1の表示設定を移行しますか？', '保存済み設定がない場合に限り、表示した旧設定を保存します。'],
};

function mount(game, manifest) {
  let screen;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'confirm-title');
  dialog.innerHTML = '<form method="dialog"><h2 id="confirm-title"></h2><p></p><div class="actions"><button value="cancel" autofocus>キャンセル</button><button value="confirm" class="primary">この内容で実行</button></div></form>';
  document.body.append(dialog);
  let request;
  let opener;

  function draw(state) {
    const active = document.activeElement;
    const action = active?.dataset.action;
    const value = active?.dataset.value;
    const selector = active?.id ? `#${CSS.escape(active.id)}` : undefined;
    const screenChanged = screen !== state.screen;
    root.innerHTML = renderScreen(game, manifest);
    if (dialog.open) return;
    if (screenChanged) {
      root.querySelector('#screen-title')?.focus();
      window.scrollTo(0, 0);
    } else if (root !== active && active !== document.body) {
      const matches = [...root.querySelectorAll('button[data-action]:not(:disabled)')];
      const next = matches.find(el => el.dataset.action === action && el.dataset.value === value &&
        el.className === active?.className && el.getAttribute('aria-label') === active?.getAttribute('aria-label')) ??
        (action === 'move' ? matches.find(el => el.dataset.action === action &&
          el.getAttribute('aria-label') === active?.getAttribute('aria-label')) ??
          matches.find(el => el.dataset.action === action &&
            el.getAttribute('aria-label')?.replace(/(左|右)へ移動$/, '') ===
            active?.getAttribute('aria-label')?.replace(/(左|右)へ移動$/, '')) : undefined) ??
        matches.find(el => el.dataset.action === action && el.dataset.value === value) ??
        (selector ? root.querySelector(selector) : null) ??
        (active?.matches('#preferences button[type=submit]') ? root.querySelector('#preferences button[type=submit]') : null) ??
        (action === 'hint' ? matches.find(el => el.dataset.action === 'hint') : null);
      next?.focus({ preventScroll: true });
    }
    screen = state.screen;
  }

  dialog.addEventListener('close', () => {
    const action = request;
    request = undefined;
    if (dialog.returnValue === 'confirm' && action) {
      root.querySelector('#screen-title')?.focus();
      game.confirm(action);
    }
    else if (opener?.isConnected) opener.focus();
    else root.querySelector('#screen-title')?.focus();
  });

  const handlers = {
    group: value => game.group(value), enter: value => game.enter(value), card: value => game.select(value),
    move: value => game.move(...value.split(':').map(Number)), hint: value => game.hint(Number(value)),
    start: () => game.start(), skip: () => game.finish(), retry: () => game.enter(), stages: () => game.stageSelect(),
    settings: () => game.show('settings'), manage: () => game.show('recovery-preview'), back: () => game.back(),
    recheck: () => game.recheck(), preview: value => game.showPreview(value),
    confirm(value, element) {
      if (!Object.hasOwn(confirmations, value) || dialog.open) return;
      request = value;
      opener = element;
      const [title, detail] = confirmations[value];
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('p').textContent = detail;
      dialog.returnValue = 'cancel';
      dialog.showModal();
    },
  };
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (button && !button.disabled) handlers[button.dataset.action]?.(button.dataset.value, button);
  });
  root.addEventListener('submit', event => {
    if (event.target.id !== 'preferences') return;
    event.preventDefault();
    const values = new FormData(event.target);
    game.setPreferences({ battleSpeed: values.get('speed'), reducedMotion: values.has('motion') });
  });
  window.addEventListener('pagehide', () => game.leave());
  window.addEventListener('pageshow', event => { if (event.persisted) game.resume(); });
  return draw;
}

async function boot() {
  const response = await fetch(new URL('../data/game0009_stage_manifest_v0.9.json', import.meta.url));
  if (!response.ok) throw new Error('manifest unavailable');
  const manifest = await response.json();
  const storage = await createProgressStorage({ manifest });
  let draw;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let canPersist = false;
  try { canPersist = typeof navigator.locks?.request === 'function'; } catch { /* Storage is optional. */ }
  const game = createGame({ manifest, storage, settings: createSettingsStorage(), canPersist,
    osReduced: () => reduced.matches, change: state => draw(state) });
  draw = mount(game, manifest);
  game.initialize();
}

boot().catch(() => {
  root.innerHTML = '<main><h1>3手の勇者</h1><p role="alert">ゲームデータを読み込めませんでした。</p><button type="button">再読み込み</button></main>';
  root.querySelector('button').addEventListener('click', () => window.location.reload());
});
