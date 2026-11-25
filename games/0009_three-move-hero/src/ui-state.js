import { simulateBattle } from './battle-core.js';
import { createPlayback, playbackDelay } from './battle-playback.js';
import { createSessionProgress } from './session-progress.js';

export const defaultPreferences = { reducedMotion: false, battleSpeed: 'normal' };

export function createGame({ manifest, storage, settings, simulate = simulateBattle,
  playback = createPlayback(), canPersist = true, osReduced = () => false, change = () => {} }) {
  const progress = createSessionProgress(manifest, storage, canPersist);
  const state = { screen: 'loading', group: 'main', plan: [], hints: 0, usedHint: false,
    preferences: defaultPreferences, settingsStatus: 'empty', frames: 0, mode: 'recovery', busy: false };
  let departed = false;
  let returnScreen = 'stage-select';
  let preview;
  const emit = () => { if (!departed) change(state); };
  const currentStage = () => manifest.stages.find(stage => stage.stageId === state.stageId);
  const nextStage = () => progress.stages().find(stage => stage.unlockAfter === state.stageId && stage.unlocked);
  const canStart = () => state.screen === 'planning' && state.plan.length === 3;

  function initialize() {
    progress.load();
    const value = settings.load();
    state.preferences = value.preferences ?? defaultPreferences;
    state.settingsStatus = value.status;
    state.screen = 'stage-select';
    emit();
  }

  function enter(id = state.stageId) {
    if (!['stage-select', 'result'].includes(state.screen) || !progress.stages().some(s => s.stageId === id && s.unlocked)) return false;
    const stage = manifest.stages.find(item => item.stageId === id);
    Object.assign(state, { screen: 'planning', group: stage.group, stageId: id,
      plan: [], hints: 0, usedHint: false, battle: undefined, frames: 0, saveStatus: undefined });
    emit();
    return true;
  }

  function select(card) {
    if (state.screen !== 'planning' || !currentStage().hand.includes(card)) return;
    const index = state.plan.indexOf(card);
    if (index >= 0) state.plan.splice(index, 1);
    else if (state.plan.length < 3) state.plan.push(card);
    emit();
  }

  function move(index, delta) {
    if (state.screen !== 'planning' || ![-1, 1].includes(delta) || !Number.isInteger(index)) return;
    const target = index + delta;
    if (Math.min(index, target) < 0 || Math.max(index, target) >= state.plan.length) return;
    [state.plan[index], state.plan[target]] = [state.plan[target], state.plan[index]];
    emit();
  }

  function hint(level) {
    if (state.screen !== 'planning' || ![0, 1, 2].includes(level)) return;
    state.hints = level;
    if (level > 0) state.usedHint = true;
    emit();
  }

  function finish() {
    if (departed || state.screen !== 'playing') return;
    playback.stop();
    state.frames = state.battle.log.length;
    state.screen = 'result';
    if (state.battle.outcome === 'win') {
      const battle = state.battle;
      const result = progress.win({ stageId: state.stageId, stars: battle.stars, usedHint: state.usedHint });
      state.saveStatus = 'checking';
      result.then(value => {
        if (battle === state.battle) state.saveStatus = value.status;
        emit();
      });
    }
    emit();
  }

  function start() {
    if (departed || !canStart()) return false;
    state.screen = 'playing';
    state.battle = simulate(currentStage(), [...state.plan]);
    state.frames = 0;
    emit();
    playback.play(state.battle.log, playbackDelay(state.preferences.battleSpeed,
      state.preferences.reducedMotion || osReduced()), frames => { state.frames = frames; emit(); }, finish);
    return true;
  }

  function stageSelect() {
    if (state.screen === 'playing' || state.busy) return;
    state.screen = 'stage-select';
    emit();
  }

  function show(screen) {
    if (state.screen === 'playing' || state.busy || !['settings', 'recovery-preview'].includes(screen)) return;
    if (!['settings', 'recovery-preview'].includes(state.screen)) returnScreen = state.screen;
    preview = undefined;
    state.preview = undefined;
    state.screen = screen;
    emit();
  }

  function back() {
    if (state.busy) return;
    state.screen = returnScreen;
    emit();
  }

  function group(value) {
    if (state.screen !== 'stage-select' || !['main', 'extra'].includes(value)) return;
    state.group = value;
    emit();
  }

  function setPreferences(value) {
    if (state.screen !== 'settings') return;
    const result = settings.save(value);
    state.preferences = result.preferences ?? value;
    state.settingsStatus = result.status;
    emit();
  }

  function showPreview(kind) {
    if (state.screen !== 'recovery-preview' || state.busy || progress.pending || progress.busy) return;
    state.mode = kind;
    preview = kind === 'recovery' ? storage.previewRecovery() : storage.previewMigration();
    state.preview = preview;
    emit();
  }

  async function confirm(kind) {
    if (state.screen !== 'recovery-preview' || state.busy || progress.pending || progress.busy ||
        preview?.status !== 'preview' || (state.mode === 'recovery' ? kind !== 'recover' : !['migrate', 'migrateSettings'].includes(kind))) return;
    state.busy = true;
    emit();
    try {
      const response = await storage[kind](preview, { confirmed: true });
      state.managementStatus = response.status;
      if (kind === 'migrateSettings') {
        if (response.preferences) state.preferences = response.preferences;
        state.settingsStatus = response.status;
      } else progress.manage(response);
      if (kind === 'recover' || response.status === 'unverified') {
        preview = undefined;
        state.preview = undefined;
      }
    } catch { state.managementStatus = 'unverified'; }
    finally { state.busy = false; emit(); }
  }

  async function recheck() {
    if (state.busy || progress.busy || !progress.pending) return;
    state.busy = true;
    emit();
    try {
      const response = await progress.recheck();
      state.managementStatus = response.status;
      if (state.battle?.outcome === 'win' && !progress.stages().find(s => s.stageId === state.stageId)?.waiting) {
        const stage = progress.stages().find(s => s.stageId === state.stageId);
        const verified = stage?.persisted.maxStars >= state.battle.stars &&
          (state.usedHint || stage.persisted.bestNoHintStars >= state.battle.stars);
        state.saveStatus = verified ? 'saved' : response.status === 'saved' ? 'not_saved' : response.status;
      }
    } finally { state.busy = false; emit(); }
  }

  return { state, progress, initialize, enter, select, move, hint, start, finish, stageSelect, show, back, group,
    currentStage, nextStage, canStart, setPreferences, showPreview, confirm, recheck,
    leave() { departed = true; playback.stop(); },
    resume() {
      departed = false;
      if (state.screen === 'playing') Object.assign(state, { screen: 'stage-select', battle: undefined, frames: 0, plan: [] });
      emit();
    },
  };
}
