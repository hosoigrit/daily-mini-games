import { createGame as createBaseGame } from './ui-state.js?base';
import { createAnimatedPlayback, createGameBattleStage, terminalBattleFrame } from './game-battle-animation.js';

// The preview entry point uses the original game's state, renderer and persistence.
export function createGame(options) {
  const document = globalThis.document;
  const media = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  let game;
  let view;
  let visibleBattle;
  let currentFrame;
  let finalFrame;

  function discard() {
    view?.destroy();
    view = undefined;
    visibleBattle = undefined;
    currentFrame = undefined;
    finalFrame = undefined;
  }

  function paint() {
    if (!view) return;
    const result = game.state.screen === 'result';
    view.paint(result ? finalFrame : currentFrame, game.state.preferences.reducedMotion || media.matches);
    if (!result && currentFrame) {
      const skip = document.querySelector('#game [data-action="skip"]');
      const status = skip?.closest('section')?.querySelector('[role="status"]');
      const text = currentFrame.cue.terminal ? '決着' : `第${currentFrame.cue.turn}ターン`;
      if (status && status.textContent !== text) status.textContent = text;
    }
  }

  function attach(state) {
    if (state.screen !== 'playing' && state.screen !== 'result') {
      discard();
      return;
    }
    if (visibleBattle !== state.battle) {
      discard();
      visibleBattle = state.battle;
      view = createGameBattleStage(document);
      finalFrame = terminalBattleFrame(state.battle);
    }

    if (state.screen === 'playing') {
      const skip = document.querySelector('#game [data-action="skip"]');
      const log = document.querySelector('#game .battle-log');
      if (skip && log) {
        const focused = document.activeElement === skip;
        log.before(skip, view.arena);
        if (focused) skip.focus({ preventScroll: true });
      }
    } else {
      document.querySelector('#game .result-head')?.after(view.arena);
    }
    paint();
  }

  const playback = createAnimatedPlayback({
    present(frame) {
      currentFrame = frame;
      paint();
    },
  });
  game = createBaseGame({
    ...options,
    playback,
    change(state) {
      options.change?.(state);
      attach(state);
    },
  });
  media.addEventListener('change', paint);
  return {
    ...game,
    leave() {
      game.leave();
      discard();
      media.removeEventListener('change', paint);
    },
    resume() {
      media.addEventListener('change', paint);
      game.resume();
    },
  };
}
