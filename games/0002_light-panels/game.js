import {
  applyPanelMove,
  createPlayState,
  resolveInitialScreen,
  SCREEN,
} from "./game-logic.mjs";
import {
  FINAL_STAGE_ID,
  getInitialBoard,
  getStage,
  STAGES,
  STAGES_VALID,
} from "./stages.mjs";
import {
  hasCompletedAllStages,
  isStageUnlocked,
  loadProgressFromStorageOwner,
  saveProgressToStorageOwner,
  updateProgressAfterClear,
} from "./progress-store.mjs";

const SCREEN_ORDER = Object.freeze([
  SCREEN.TITLE,
  SCREEN.SELECT,
  SCREEN.PLAYING,
  SCREEN.CLEARED,
  SCREEN.ALL_CLEARED,
  SCREEN.ERROR,
]);

const elements = {
  storageNotice: document.querySelector("#storage-notice"),
  titleScreen: document.querySelector("#title-screen"),
  selectScreen: document.querySelector("#select-screen"),
  playScreen: document.querySelector("#play-screen"),
  clearedScreen: document.querySelector("#cleared-screen"),
  allClearedScreen: document.querySelector("#all-cleared-screen"),
  errorScreen: document.querySelector("#error-screen"),
  startButton: document.querySelector("#start-button"),
  openSelectButton: document.querySelector("#open-select-button"),
  selectBackButton: document.querySelector("#select-back-button"),
  stageList: document.querySelector("#stage-list"),
  stageNumber: document.querySelector("#stage-number"),
  moveCount: document.querySelector("#move-count"),
  board: document.querySelector("#board"),
  restartButton: document.querySelector("#restart-button"),
  playSelectButton: document.querySelector("#play-select-button"),
  progressSummary: document.querySelector("#progress-summary"),
  clearedTitle: document.querySelector("#cleared-title"),
  clearedStage: document.querySelector("#cleared-stage"),
  clearedMoves: document.querySelector("#cleared-moves"),
  clearedBest: document.querySelector("#cleared-best"),
  recordMessage: document.querySelector("#record-message"),
  nextButton: document.querySelector("#next-button"),
  replayButton: document.querySelector("#replay-button"),
  clearedSelectButton: document.querySelector("#cleared-select-button"),
  allClearedTitle: document.querySelector("#all-cleared-title"),
  finalStageMoves: document.querySelector("#final-stage-moves"),
  finalStageBest: document.querySelector("#final-stage-best"),
  allReplayButton: document.querySelector("#all-replay-button"),
  allSelectButton: document.querySelector("#all-select-button"),
};

const screenElements = {
  [SCREEN.TITLE]: elements.titleScreen,
  [SCREEN.SELECT]: elements.selectScreen,
  [SCREEN.PLAYING]: elements.playScreen,
  [SCREEN.CLEARED]: elements.clearedScreen,
  [SCREEN.ALL_CLEARED]: elements.allClearedScreen,
  [SCREEN.ERROR]: elements.errorScreen,
};

const loaded = loadProgressFromStorageOwner(window);
let progress = loaded.progress;
let storageAvailable = loaded.storageAvailable;
let storageMessage = loaded.invalidData
  ? "保存データが破損していたため、進捗を初期状態に戻しました。"
  : loaded.storageAvailable
    ? ""
    : "このブラウザでは進捗を保存できません。ページを開いている間は遊べます。";
let gameState = {
  screen: resolveInitialScreen(STAGES_VALID),
  activeStageId: null,
  board: null,
  moveCount: 0,
};
let lastResult = null;

elements.startButton.addEventListener("click", handleStart);
elements.openSelectButton.addEventListener("click", showStageSelect);
elements.selectBackButton.addEventListener("click", showTitle);
elements.stageList.addEventListener("click", handleStageSelection);
elements.board.addEventListener("click", handlePanelClick);
elements.board.addEventListener("keydown", blockRepeatedActivation);
elements.restartButton.addEventListener("click", restartActiveStage);
elements.playSelectButton.addEventListener("click", showStageSelect);
elements.nextButton.addEventListener("click", startNextStage);
elements.replayButton.addEventListener("click", restartActiveStage);
elements.clearedSelectButton.addEventListener("click", showStageSelect);
elements.allReplayButton.addEventListener("click", restartActiveStage);
elements.allSelectButton.addEventListener("click", showStageSelect);

render();

function handleStart() {
  if (hasCompletedAllStages(progress)) {
    showStageSelect();
    return;
  }
  startStage(progress.highestUnlockedStage);
}

function handleStageSelection(event) {
  const button = event.target.closest("button[data-stage-id]");
  if (!button || button.disabled) {
    return;
  }
  startStage(Number(button.dataset.stageId));
}

function handlePanelClick(event) {
  const button = event.target.closest("button[data-row][data-column]");
  if (!button || gameState.screen !== SCREEN.PLAYING) {
    return;
  }

  const row = Number(button.dataset.row);
  const column = Number(button.dataset.column);
  const outcome = applyPanelMove(gameState, row, column, FINAL_STAGE_ID);
  if (!outcome.moved) {
    return;
  }

  gameState = outcome.state;
  if (outcome.solved) {
    completeStage();
    return;
  }

  render();
  elements.board
    .querySelector(`[data-row="${row}"][data-column="${column}"]`)
    ?.focus({ preventScroll: true });
}

function blockRepeatedActivation(event) {
  if (event.repeat && isActivationKey(event.key)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function completeStage() {
  const outcome = updateProgressAfterClear(
    progress,
    gameState.activeStageId,
    gameState.moveCount,
  );
  progress = outcome.progress;

  if (!saveProgressToStorageOwner(window, progress)) {
    storageAvailable = false;
    storageMessage = "このブラウザでは進捗を保存できません。ページを開いている間は遊べます。";
  }

  lastResult = {
    stageId: gameState.activeStageId,
    moves: gameState.moveCount,
    best: progress.bestMoves[String(gameState.activeStageId)],
    isNewBest: outcome.isNewBest,
  };
  render();

  const heading = gameState.screen === SCREEN.ALL_CLEARED
    ? elements.allClearedTitle
    : elements.clearedTitle;
  heading.focus({ preventScroll: true });
}

function startStage(stageId) {
  if (!isStageUnlocked(progress, stageId)) {
    return false;
  }

  try {
    const stage = getStage(stageId);
    if (!stage) {
      throw new RangeError("Stage not found");
    }
    gameState = createPlayState(stageId, getInitialBoard(stageId));
    lastResult = null;
    render();
    elements.board.querySelector("button")?.focus({ preventScroll: true });
    return true;
  } catch {
    gameState = { ...gameState, screen: SCREEN.ERROR };
    render();
    return false;
  }
}

function restartActiveStage() {
  if (gameState.activeStageId !== null) {
    startStage(gameState.activeStageId);
  }
}

function startNextStage() {
  if (gameState.screen !== SCREEN.CLEARED || gameState.activeStageId >= FINAL_STAGE_ID) {
    return;
  }
  startStage(gameState.activeStageId + 1);
}

function showStageSelect() {
  gameState = {
    screen: SCREEN.SELECT,
    activeStageId: null,
    board: null,
    moveCount: 0,
  };
  lastResult = null;
  render();
  document.querySelector("#select-title")?.focus?.({ preventScroll: true });
}

function showTitle() {
  gameState = {
    screen: SCREEN.TITLE,
    activeStageId: null,
    board: null,
    moveCount: 0,
  };
  lastResult = null;
  render();
  elements.startButton.focus({ preventScroll: true });
}

function render() {
  setVisibleScreen(gameState.screen, screenElements);

  renderStorageNotice();
  if (gameState.screen === SCREEN.ERROR) {
    elements.board.replaceChildren();
    return;
  }
  renderTitle();
  renderStageList();

  if (gameState.screen === SCREEN.PLAYING) {
    renderPlaying();
  } else {
    elements.board.replaceChildren();
  }

  if (lastResult) {
    renderResult();
  }
}

export function setVisibleScreen(activeScreen, elementsByScreen) {
  if (!SCREEN_ORDER.includes(activeScreen)) {
    throw new RangeError(`Unknown screen: ${activeScreen}`);
  }
  if (elementsByScreen === null || typeof elementsByScreen !== "object") {
    throw new TypeError("elementsByScreen must be an object");
  }

  for (const screen of SCREEN_ORDER) {
    const element = elementsByScreen[screen];
    if (!element || !("hidden" in element)) {
      throw new TypeError(`Missing screen element: ${screen}`);
    }
    element.hidden = activeScreen !== screen;
  }
}

function renderStorageNotice() {
  if (!storageAvailable && !storageMessage) {
    storageMessage = "このブラウザでは進捗を保存できません。ページを開いている間は遊べます。";
  }
  elements.storageNotice.textContent = storageMessage;
  elements.storageNotice.hidden = storageMessage === "";
}

function renderTitle() {
  const completedAll = hasCompletedAllStages(progress);
  elements.startButton.textContent = completedAll
    ? "ステージ一覧へ"
    : progress.highestUnlockedStage === 1
      ? "S01を始める"
      : `続きから（S${formatStageId(progress.highestUnlockedStage)}）`;
  elements.progressSummary.textContent = completedAll
    ? "全6ステージ制覇済み。自己ベスト更新に挑戦できます。"
    : `現在はS${formatStageId(progress.highestUnlockedStage)}まで解放されています。`;
}

function renderStageList() {
  const fragment = document.createDocumentFragment();
  for (const stage of STAGES) {
    const unlocked = isStageUnlocked(progress, stage.id);
    const best = progress.bestMoves[String(stage.id)];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage-button";
    button.dataset.stageId = String(stage.id);
    button.disabled = !unlocked;
    button.setAttribute("aria-label", unlocked
      ? `${stage.label}、${stage.size}かける${stage.size}、${best ? `自己ベスト${best}手` : "未クリア"}`
      : `${stage.label}、ロック中`);

    const title = document.createElement("span");
    title.className = "stage-button__title";
    title.textContent = `${stage.label} · ${stage.size}×${stage.size}`;
    const meta = document.createElement("span");
    meta.className = "stage-button__meta";
    meta.textContent = unlocked
      ? best
        ? `自己ベスト ${best}手`
        : "プレイ可能 · 未クリア"
      : "🔒 ロック中";
    button.append(title, meta);
    fragment.append(button);
  }
  elements.stageList.replaceChildren(fragment);
}

function renderPlaying() {
  elements.stageNumber.textContent = formatStageId(gameState.activeStageId);
  elements.moveCount.textContent = String(gameState.moveCount);
  elements.board.style.setProperty("--board-size", String(gameState.board.length));

  const fragment = document.createDocumentFragment();
  gameState.board.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const lit = value === 1;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-cell";
      button.dataset.row = String(rowIndex);
      button.dataset.column = String(columnIndex);
      button.dataset.lit = String(lit);
      button.setAttribute("aria-pressed", String(lit));
      button.setAttribute(
        "aria-label",
        `行${rowIndex + 1} 列${columnIndex + 1}：${lit ? "点灯" : "消灯"}`,
      );

      const symbol = document.createElement("span");
      symbol.className = "panel-symbol";
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = lit ? "ON" : "OFF";
      button.append(symbol);
      fragment.append(button);
    });
  });
  elements.board.replaceChildren(fragment);
}

function renderResult() {
  elements.clearedStage.textContent = formatStageId(lastResult.stageId);
  elements.clearedMoves.textContent = String(lastResult.moves);
  elements.clearedBest.textContent = String(lastResult.best);
  elements.recordMessage.textContent = lastResult.isNewBest
    ? "自己ベストを更新しました！"
    : "記録は維持されました。もう一度挑戦できます。";
  elements.finalStageMoves.textContent = String(lastResult.moves);
  elements.finalStageBest.textContent = String(lastResult.best);
}

function formatStageId(stageId) {
  return String(stageId).padStart(2, "0");
}

function isActivationKey(key) {
  return key === "Enter" || key === " " || key === "Space" || key === "Spacebar";
}
