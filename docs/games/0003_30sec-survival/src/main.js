import {
  CONFIG,
  STATES,
  createGame,
  getCountdownDisplay,
  getElapsedSeconds,
  getRemainingSeconds,
  pauseGame,
  resumeGame,
  startGame,
  stepCountdown,
  stepGame,
} from "./core.js";
import { createInputController } from "./input.js";
import { createRenderer } from "./renderer.js";

export const RECORD_KEYS = Object.freeze({
  stars: "daily-mini-games:0003:best-stars:v1",
  survivalMs: "daily-mini-games:0003:best-survival-ms:v1",
});

export function loadRecords(storage) {
  try {
    const stars = Number(storage.getItem(RECORD_KEYS.stars));
    const survivalMs = Number(storage.getItem(RECORD_KEYS.survivalMs));
    return {
      stars: Number.isInteger(stars) && stars >= 0 && stars <= 3 ? stars : 0,
      survivalMs:
        Number.isInteger(survivalMs) && survivalMs >= 0 && survivalMs <= 30000 ? survivalMs : 0,
    };
  } catch {
    return { stars: 0, survivalMs: 0 };
  }
}

export function calculateUpdatedRecords(records, game) {
  const survivalMs = Math.min(30000, Math.round(getElapsedSeconds(game) * 1000));
  return {
    stars: game.state === STATES.CLEARED ? Math.max(records.stars, game.stars) : records.stars,
    survivalMs: Math.max(records.survivalMs, survivalMs),
  };
}

export function writeRecords(storage, records) {
  try {
    storage.setItem(RECORD_KEYS.stars, String(records.stars));
    storage.setItem(RECORD_KEYS.survivalMs, String(records.survivalMs));
    return true;
  } catch {
    return false;
  }
}

export function getBrowserStorage(browserWindow) {
  try {
    return browserWindow.localStorage;
  } catch {
    return null;
  }
}

export function consumeFixedSteps(accumulatorSeconds, deltaSeconds, update) {
  let accumulator = accumulatorSeconds + Math.min(CONFIG.maxFrameDeltaSeconds, Math.max(0, deltaSeconds));
  let steps = 0;
  while (accumulator + Number.EPSILON >= CONFIG.stepSeconds) {
    update();
    accumulator -= CONFIG.stepSeconds;
    steps += 1;
  }
  return { accumulator: Math.max(0, accumulator), steps };
}

export function pauseForLifecycle(game, input, resetFrameClock, syncUi) {
  const transitioned = pauseGame(game);
  input.clear();
  resetFrameClock();
  if (transitioned) syncUi(true);
  return transitioned;
}

export function prepareLifecycleRestore(game, input, resetFrameClock, syncUi) {
  input.clear();
  resetFrameClock();
  if (game.state === STATES.PAUSED) syncUi(true);
  return game.state;
}

function initialize() {
  const canvas = document.querySelector("#game-canvas");
  const overlay = document.querySelector("#game-overlay");
  const gameShell = document.querySelector("#game-shell");
  const timeValue = document.querySelector("#time-value");
  const livesValue = document.querySelector("#lives-value");
  const difficultyValue = document.querySelector("#difficulty-value");
  const joystick = document.querySelector("#joystick");
  const joystickKnob = document.querySelector("#joystick-knob");

  const game = createGame();
  const renderer = createRenderer(canvas);
  const storage = getBrowserStorage(window);
  let records = loadRecords(storage);
  let lastFrameTime = null;
  let accumulator = 0;
  let lastUiKey = "";
  let previousState = game.state;

  const input = createInputController({
    keyboardTarget: window,
    blurTarget: window,
    joystickElement: joystick,
    joystickKnob,
    isEnabled: () => game.state === STATES.PLAYING,
  });
  input.attach();

  overlay.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start" || action === "retry") {
      input.clear();
      startGame(game);
      resetFrameClock();
      gameShell.focus({ preventScroll: true });
      syncUi(true);
    } else if (action === "resume" && resumeGame(game)) {
      input.clear();
      resetFrameClock();
      gameShell.focus({ preventScroll: true });
      syncUi(true);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseForLifecycle(game, input, resetFrameClock, syncUi);
  });

  window.addEventListener("resize", () => {
    input.clear();
    renderer.resize();
  });
  window.addEventListener("pagehide", () => {
    pauseForLifecycle(game, input, resetFrameClock, syncUi);
  });
  window.addEventListener("pageshow", () => {
    prepareLifecycleRestore(game, input, resetFrameClock, syncUi);
  });

  function resetFrameClock() {
    lastFrameTime = null;
    accumulator = 0;
  }

  function frame(timestamp) {
    if (lastFrameTime === null) lastFrameTime = timestamp;
    const deltaSeconds = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    if (game.state === STATES.COUNTDOWN || game.state === STATES.PLAYING) {
      const result = consumeFixedSteps(accumulator, deltaSeconds, () => {
        if (game.state === STATES.COUNTDOWN) {
          stepCountdown(game);
        } else if (game.state === STATES.PLAYING) {
          stepGame(game, input.getDirection(), Math.random);
        }
      });
      accumulator = result.accumulator;
    } else {
      accumulator = 0;
    }

    if (game.state !== previousState) {
      if (game.state === STATES.CLEARED || game.state === STATES.GAME_OVER) {
        records = calculateUpdatedRecords(records, game);
        writeRecords(storage, records);
        input.clear();
      }
      previousState = game.state;
      syncUi(true);
    } else {
      syncUi(false);
    }

    renderer.render(game);
    requestAnimationFrame(frame);
  }

  function syncUi(force) {
    const remaining = getRemainingSeconds(game);
    timeValue.textContent = remaining.toFixed(1);
    livesValue.textContent = "♥".repeat(game.player.lives) + "♡".repeat(3 - game.player.lives);
    livesValue.setAttribute("aria-label", `ライフ ${game.player.lives}`);
    difficultyValue.textContent = game.difficulty;

    const uiKey = `${game.state}:${getCountdownDisplay(game)}:${game.player.lives}:${game.stars}`;
    if (!force && uiKey === lastUiKey) return;
    lastUiKey = uiKey;
    renderOverlay();
  }

  function renderOverlay() {
    overlay.hidden = false;
    overlay.className = "game-overlay";

    if (game.state === STATES.TITLE) {
      overlay.innerHTML = `
        <div class="panel title-panel">
          <p class="eyebrow">GAME #0003</p>
          <h1>30秒サバイバル</h1>
          <p>宇宙船を動かし、四方から飛来する隕石を30秒間よけよう。</p>
          <ul class="controls-list">
            <li><strong>PC</strong> WASD / 方向キー</li>
            <li><strong>スマホ</strong> 下のジョイスティック</li>
          </ul>
          <button type="button" data-action="start">ミッション開始</button>
        </div>`;
      return;
    }

    if (game.state === STATES.COUNTDOWN) {
      overlay.classList.add("countdown-overlay");
      overlay.innerHTML = `<p class="countdown-number" aria-live="polite">${getCountdownDisplay(game)}</p>`;
      return;
    }

    if (game.state === STATES.PAUSED) {
      overlay.innerHTML = `
        <div class="panel compact-panel">
          <p class="eyebrow">PAUSED</p>
          <h2>一時停止中</h2>
          <p>画面を離れている間、ゲーム時間は進みません。</p>
          <button type="button" data-action="resume">ゲームに戻る</button>
        </div>`;
      return;
    }

    if (game.state === STATES.CLEARED || game.state === STATES.GAME_OVER) {
      const cleared = game.state === STATES.CLEARED;
      const resultTitle = cleared ? "MISSION CLEAR" : "GAME OVER";
      const resultLine = cleared
        ? `<p class="result-stars" aria-label="星 ${game.stars}個">${"★".repeat(game.stars)}${"☆".repeat(3 - game.stars)}</p>`
        : `<p class="survival-result">生存 ${getElapsedSeconds(game).toFixed(1)}秒</p>`;
      overlay.innerHTML = `
        <div class="panel compact-panel">
          <p class="eyebrow">${resultTitle}</p>
          <h2>${cleared ? "30秒、生き残った！" : "隕石に阻まれた…"}</h2>
          ${resultLine}
          <p>残りライフ ${game.player.lives} / 最高星 ${records.stars}<br>最長生存 ${(records.survivalMs / 1000).toFixed(1)}秒</p>
          <button type="button" data-action="retry">もう一度挑戦</button>
        </div>`;
      return;
    }

    overlay.hidden = true;
    overlay.innerHTML = "";
  }

  syncUi(true);
  renderer.render(game);
  requestAnimationFrame(frame);
}

if (typeof document !== "undefined") initialize();
