import {
  PHASE,
  beginActivationKey,
  clampTargetPosition,
  createInitialState,
  finishRound,
  loadBestScoreFromStorageOwner,
  randomTargetPosition,
  releaseActivationKey,
  resizeTarget,
  saveBestScoreToStorageOwner,
  scoreTarget,
  startRound,
  updateTimer,
} from "./game-logic.js";

const elements = {
  readyScreen: document.querySelector("#ready-screen"),
  playScreen: document.querySelector("#play-screen"),
  resultScreen: document.querySelector("#result-screen"),
  startButton: document.querySelector("#start-button"),
  replayButton: document.querySelector("#replay-button"),
  playfield: document.querySelector("#playfield"),
  targetButton: document.querySelector("#target-button"),
  scoreValue: document.querySelector("#score-value"),
  timeValue: document.querySelector("#time-value"),
  readyBestScore: document.querySelector("#ready-best-score"),
  finalScore: document.querySelector("#final-score"),
  resultBestScore: document.querySelector("#result-best-score"),
  resultMessage: document.querySelector("#result-message"),
  readyNotice: document.querySelector("#ready-notice"),
  resultNotice: document.querySelector("#result-notice"),
};

const loadedBest = loadBestScoreFromStorageOwner(window);
let state = createInitialState(loadedBest.score);
let animationFrameId = null;
let pressedActivationKey = null;
let suppressKeyboardClickUntil = 0;
let storageAvailable = loadedBest.available;

elements.startButton.addEventListener("click", beginRound);
elements.replayButton.addEventListener("click", beginRound);
elements.targetButton.addEventListener("click", handleTargetClick);
elements.targetButton.addEventListener("keydown", handleTargetKeyDown);
elements.targetButton.addEventListener("keyup", handleTargetKeyUp);
elements.targetButton.addEventListener("blur", clearPressedKey);
window.addEventListener("blur", clearPressedKey);
window.addEventListener("resize", handleResize);
document.addEventListener("visibilitychange", refreshClock);
window.addEventListener("pageshow", refreshClock);

render();

function beginRound() {
  if (state.phase === PHASE.PLAYING) {
    return;
  }

  cancelAnimationFrameIfNeeded();
  pressedActivationKey = null;
  state = startRound(state, Date.now());
  render();

  const nextPosition = randomTargetPosition(
    elements.playfield.clientWidth,
    elements.playfield.clientHeight,
  );
  state = { ...state, targetX: nextPosition.x, targetY: nextPosition.y };
  renderTarget();
  elements.targetButton.focus({ preventScroll: true });
  scheduleClock(state.roundId);
}

function handleTargetClick(event) {
  if (event.detail === 0 && performance.now() <= suppressKeyboardClickUntil) {
    return;
  }
  registerHit();
}

function handleTargetKeyDown(event) {
  if (!isKeyboardActivation(event.key)) {
    return;
  }

  event.preventDefault();
  const result = beginActivationKey(pressedActivationKey, event.key, event.repeat);
  pressedActivationKey = result.pressedKey;
}

function handleTargetKeyUp(event) {
  if (!isKeyboardActivation(event.key)) {
    return;
  }

  event.preventDefault();
  const result = releaseActivationKey(pressedActivationKey, event.key);
  pressedActivationKey = result.pressedKey;
  if (result.activate) {
    suppressKeyboardClickUntil = performance.now() + 250;
    registerHit();
  }
}

function registerHit() {
  const nextPosition = randomTargetPosition(
    elements.playfield.clientWidth,
    elements.playfield.clientHeight,
  );
  const outcome = scoreTarget(state, Date.now(), nextPosition);
  state = outcome.state;

  if (outcome.expired) {
    completeRound();
    return;
  }

  if (outcome.scored) {
    renderScore();
    renderTarget();
  }
}

function scheduleClock(roundId) {
  cancelAnimationFrameIfNeeded();

  const tick = () => {
    if (state.phase !== PHASE.PLAYING || state.roundId !== roundId) {
      animationFrameId = null;
      return;
    }

    const timer = updateTimer(state, Date.now());
    state = timer.state;
    elements.timeValue.textContent = String(state.remainingSec);

    if (timer.expired) {
      animationFrameId = null;
      completeRound();
      return;
    }

    animationFrameId = window.requestAnimationFrame(tick);
  };

  animationFrameId = window.requestAnimationFrame(tick);
}

function refreshClock() {
  if (state.phase !== PHASE.PLAYING) {
    return;
  }

  const timer = updateTimer(state, Date.now());
  state = timer.state;
  elements.timeValue.textContent = String(state.remainingSec);

  if (timer.expired) {
    completeRound();
  } else if (animationFrameId === null) {
    scheduleClock(state.roundId);
  }
}

function completeRound() {
  const previousBest = state.bestScore;
  const outcome = finishRound(state, Date.now());
  if (!outcome.ended) {
    return;
  }

  state = outcome.state;
  cancelAnimationFrameIfNeeded();
  pressedActivationKey = null;

  if (outcome.newBest) {
    storageAvailable = saveBestScoreToStorageOwner(window, state.bestScore);
  }

  render();
  elements.resultMessage.textContent = outcome.newBest && previousBest > 0
    ? "自己ベスト更新！"
    : outcome.newBest
      ? "最初の記録ができました！"
      : "もう一度挑戦して記録を伸ばそう。";
  elements.replayButton.focus({ preventScroll: true });
}

function handleResize() {
  if (state.phase !== PHASE.PLAYING) {
    return;
  }

  state = resizeTarget(
    state,
    elements.playfield.clientWidth,
    elements.playfield.clientHeight,
  );
  renderTarget();
  refreshClock();
}

function render() {
  elements.readyScreen.hidden = state.phase !== PHASE.READY;
  elements.playScreen.hidden = state.phase !== PHASE.PLAYING;
  elements.resultScreen.hidden = state.phase !== PHASE.RESULT;

  elements.readyBestScore.textContent = String(state.bestScore);
  elements.scoreValue.textContent = String(state.score);
  elements.timeValue.textContent = String(state.remainingSec);
  elements.finalScore.textContent = String(state.score);
  elements.resultBestScore.textContent = String(state.bestScore);

  const storageMessage = storageAvailable
    ? ""
    : "自己ベストを保存できません。このページを開いている間はゲームを続けられます。";
  elements.readyNotice.textContent = storageMessage;
  elements.resultNotice.textContent = storageMessage;

  if (state.phase === PHASE.PLAYING) {
    renderTarget();
  }
}

function renderScore() {
  elements.scoreValue.textContent = String(state.score);
  elements.timeValue.textContent = String(state.remainingSec);
}

function renderTarget() {
  const position = clampTargetPosition(
    { x: state.targetX, y: state.targetY },
    elements.playfield.clientWidth,
    elements.playfield.clientHeight,
  );
  elements.targetButton.style.setProperty("--target-x", `${position.x}px`);
  elements.targetButton.style.setProperty("--target-y", `${position.y}px`);
}

function clearPressedKey() {
  pressedActivationKey = null;
}

function cancelAnimationFrameIfNeeded() {
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function isKeyboardActivation(key) {
  return key === "Enter" || key === " " || key === "Space" || key === "Spacebar";
}
