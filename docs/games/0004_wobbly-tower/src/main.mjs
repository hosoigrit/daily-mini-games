import { LANDING } from "./rules.mjs";
import {
  PHASES,
  advanceAnimation,
  advanceMoving,
  createGame,
  pauseGame,
  requestDrop,
  resumeGame,
  startGame,
} from "./state.mjs";
import { createRenderer } from "./renderer.mjs";
import { getBrowserStorage, loadBest, saveBest, updateBest } from "./storage.mjs";

function initialize() {
  const canvas = document.querySelector("#game-canvas");
  const overlay = document.querySelector("#game-overlay");
  const floorValue = document.querySelector("#floor-value");
  const scoreValue = document.querySelector("#score-value");
  const comboValue = document.querySelector("#combo-value");
  const pauseButton = document.querySelector("#pause-button");
  const status = document.querySelector("#status-message");
  const renderer = createRenderer(canvas);
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  renderer.setReducedMotion(motionPreference.matches);

  const game = createGame();
  const storage = getBrowserStorage(window);
  let best = loadBest(storage);
  let lastTimestamp = null;
  let previousPhase = game.phase;
  let lastOverlayKey = null;

  motionPreference.addEventListener?.("change", (event) => renderer.setReducedMotion(event.matches));

  overlay.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start" || action === "retry") {
      startGame(game);
      resetClock();
      canvas.focus({ preventScroll: true });
      syncUi();
    } else if (action === "resume" && resumeGame(game)) {
      resetClock();
      canvas.focus({ preventScroll: true });
      syncUi();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button > 0) return;
    event.preventDefault();
    consumeDrop(event.timeStamp);
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) return;
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    consumeDrop(event.timeStamp);
  });

  pauseButton.addEventListener("click", () => {
    if (pauseGame(game)) {
      resetClock();
      syncUi();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && pauseGame(game)) {
      resetClock();
      syncUi();
    }
  });
  window.addEventListener("pagehide", () => {
    if (pauseGame(game)) syncUi();
    resetClock();
  });
  window.addEventListener("pageshow", resetClock);
  window.addEventListener("resize", renderer.resize);

  function consumeDrop(timestamp) {
    if (game.phase !== PHASES.MOVING) return false;
    if (lastTimestamp !== null && timestamp > lastTimestamp) {
      advanceMoving(game, (timestamp - lastTimestamp) / 1000);
      lastTimestamp = timestamp;
    }
    if (!requestDrop(game)) return false;
    syncUi();
    return true;
  }

  function frame(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const deltaSeconds = elapsedSecondsBetween(lastTimestamp, timestamp);
    lastTimestamp = timestamp;

    if (game.phase === PHASES.MOVING) advanceMoving(game, deltaSeconds);
    if (game.phase === PHASES.FALLING || game.phase === PHASES.SETTLING) {
      advanceAnimation(game, deltaSeconds);
    }

    if (game.phase !== previousPhase) {
      if (game.phase === PHASES.CLEAR || game.phase === PHASES.GAME_OVER) {
        best = updateBest(best, game);
        saveBest(storage, best);
      }
      previousPhase = game.phase;
      syncUi();
    } else {
      syncUi();
    }
    renderer.render(game);
    requestAnimationFrame(frame);
  }

  function resetClock() {
    lastTimestamp = null;
  }

  function syncUi() {
    floorValue.textContent = `${game.floor}/10`;
    scoreValue.textContent = game.score.toLocaleString("ja-JP");
    comboValue.textContent = game.perfectStreak ? `×${game.perfectStreak}` : "—";
    pauseButton.hidden = ![PHASES.MOVING, PHASES.FALLING, PHASES.SETTLING].includes(game.phase);

    const statusText = statusFor(game);
    if (status.textContent !== statusText) status.textContent = statusText;

    const overlayKey = overlayKeyFor(game, best);
    if (overlayKey !== lastOverlayKey) {
      lastOverlayKey = overlayKey;
      renderOverlay();
    }
  }

  function renderOverlay() {
    overlay.hidden = false;
    if (game.phase === PHASES.TITLE) {
      overlay.innerHTML = `
        <section class="panel title-panel" aria-labelledby="title-heading">
          <p class="eyebrow">GAME #0004</p>
          <h1 id="title-heading">ぐらぐら<br>タワー</h1>
          <p>動くブロックを重ねて、10階の頂上を目指そう。</p>
          <ul class="how-to-play">
            <li><strong>PC</strong> クリック / Space</li>
            <li><strong>スマホ</strong> ゲーム画面をタップ</li>
          </ul>
          <p class="best-line">BEST ${best.bestFloor}/10F ・ ${best.bestScore.toLocaleString("ja-JP")}点</p>
          <button type="button" data-action="start">積み上げスタート</button>
        </section>`;
      return;
    }
    if (game.phase === PHASES.PAUSED) {
      overlay.innerHTML = `
        <section class="panel compact-panel" aria-labelledby="pause-heading">
          <p class="eyebrow">PAUSED</p><h2 id="pause-heading">一時停止中</h2>
          <p>再開するまでブロックも演出も進みません。</p>
          <button type="button" data-action="resume">ゲームに戻る</button>
        </section>`;
      return;
    }
    if (game.phase === PHASES.CLEAR || game.phase === PHASES.GAME_OVER) {
      const cleared = game.phase === PHASES.CLEAR;
      overlay.innerHTML = `
        <section class="panel result-panel" aria-labelledby="result-heading">
          <p class="eyebrow">${cleared ? "TOWER COMPLETE" : "GAME OVER"}</p>
          <h2 id="result-heading">${cleared ? "10階クリア！" : "タワーはここまで"}</h2>
          <dl class="result-grid">
            <div><dt>到達</dt><dd>${game.floor}/10F</dd></div>
            <div><dt>スコア</dt><dd>${game.score.toLocaleString("ja-JP")}</dd></div>
            <div><dt>PERFECT</dt><dd>${game.totalPerfect}</dd></div>
            <div><dt>最大コンボ</dt><dd>${game.maxPerfectStreak}</dd></div>
          </dl>
          <p class="best-line">BEST ${best.bestFloor}/10F ・ ${best.bestScore.toLocaleString("ja-JP")}点</p>
          <button type="button" data-action="retry">もう一度挑戦</button>
        </section>`;
      return;
    }
    overlay.hidden = true;
    overlay.innerHTML = "";
  }

  syncUi();
  renderer.render(game);
  requestAnimationFrame(frame);
}

export function elapsedSecondsBetween(previousTimestamp, currentTimestamp) {
  if (!Number.isFinite(previousTimestamp) || !Number.isFinite(currentTimestamp)) return 0;
  return Math.max(0, (currentTimestamp - previousTimestamp) / 1000);
}

export function overlayKeyFor(game, best) {
  if (game.phase === PHASES.TITLE) {
    return `TITLE:${best.bestFloor}:${best.bestScore}`;
  }
  if (game.phase === PHASES.PAUSED) {
    return `PAUSED:${game.pausedFrom}`;
  }
  if (game.phase === PHASES.CLEAR || game.phase === PHASES.GAME_OVER) {
    return [
      game.phase,
      game.floor,
      game.score,
      game.totalPerfect,
      game.maxPerfectStreak,
      best.bestFloor,
      best.bestScore,
    ].join(":");
  }
  return "HIDDEN";
}

function statusFor(game) {
  if (game.phase === PHASES.TITLE) return "ゲーム開始を待っています";
  if (game.phase === PHASES.PAUSED) return "一時停止中。再開ボタンを押してください";
  if (game.phase === PHASES.CLEAR) return `CLEAR。スコア ${game.score}点`;
  if (game.phase === PHASES.GAME_OVER) return `MISS。到達 ${game.floor}階`;
  if (game.phase === PHASES.SETTLING) {
    if (game.lastLanding === LANDING.PERFECT) return "PERFECT";
    if (game.lastLanding === LANDING.NORMAL) return "着地成功";
    return "MISS";
  }
  return `${game.floor + 1}階目。タイミングを合わせて落としてください`;
}

if (typeof document !== "undefined") initialize();
