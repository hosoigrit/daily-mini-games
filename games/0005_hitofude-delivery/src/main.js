import { STAGES, getStage } from "./stages.js";
import {
  applyHintResult,
  calculateScore,
  coordKey,
  createGameState,
  currentCell,
  evaluateScore,
  getCollectedParcelKeys,
  moveTo,
  resetRoute,
  sameCoord,
  summarizeState,
  undoMove,
} from "./game-core.js";
import { directionLabel, solveHint } from "./hint-solver.js";
import { PointerInputAdapter } from "./input.js";
import { createProgressStore, getTotalBest, recordClear } from "./storage.js";

const screens = [...document.querySelectorAll(".screen")];
const elements = {
  title: document.querySelector("#title-screen"),
  stages: document.querySelector("#stage-screen"),
  play: document.querySelector("#play-screen"),
  result: document.querySelector("#result-screen"),
  stageGrid: document.querySelector("#stage-grid"),
  storageWarning: document.querySelector("#storage-warning"),
  allClearSummary: document.querySelector("#all-clear-summary"),
  board: document.querySelector("#board"),
  stageNumber: document.querySelector("#stage-number"),
  score: document.querySelector("#score-value"),
  parcels: document.querySelector("#parcel-value"),
  hints: document.querySelector("#hint-value"),
  message: document.querySelector("#play-message"),
  undo: document.querySelector("#undo-button"),
  reset: document.querySelector("#reset-button"),
  hint: document.querySelector("#hint-button"),
  resultStars: document.querySelector("#result-stars"),
  resultLabel: document.querySelector("#result-label"),
  resultScore: document.querySelector("#result-score"),
  bestMessage: document.querySelector("#best-message"),
  resultStorageWarning: document.querySelector("#result-storage-warning"),
  totalScore: document.querySelector("#total-score"),
  next: document.querySelector("#next-button"),
};

const store = createProgressStore();
let progress = store.load();
let stage = null;
let game = null;
let hintedCell = null;
let hintBusy = false;
let lastClear = null;
let hintTimer = null;
let hintTimerRevision = 0;
const HINT_HIGHLIGHT_MS = 2500;

function cancelHintHighlight(redraw = false) {
  hintTimerRevision += 1;
  if (hintTimer !== null) clearTimeout(hintTimer);
  hintTimer = null;
  const hadHint = hintedCell !== null;
  hintedCell = null;
  if (redraw && hadHint && game && stage && !elements.play.hidden) renderBoard();
}

function scheduleHintHighlightEnd() {
  const revision = ++hintTimerRevision;
  if (hintTimer !== null) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    if (revision !== hintTimerRevision) return;
    hintTimer = null;
    hintedCell = null;
    if (game && stage && !elements.play.hidden) renderBoard();
  }, HINT_HIGHLIGHT_MS);
}

function showScreen(target) {
  for (const screen of screens) screen.hidden = screen !== target;
}

function messageFor(outcome) {
  const messages = {
    start: "となりのマスをタップするか、道をなぞってください",
    moved: "配達中です。すべての荷物を集めましょう",
    "dead-end": "これ以上進めません。1マス戻るかリセットしてください",
    undo: "1マス戻りました（−50点）",
    reset: "経路をリセットしました（−100点）",
    "empty-undo": "これ以上戻れません",
    "empty-reset": "経路はすでにスタート地点です",
    wall: "壁は通れません",
    visited: "同じ道は通れません。直前のマスなら戻れます",
    "not-adjacent": "上下左右のとなりのマスへ進んでください",
    "out-of-bounds": "盤面の中を進んでください",
    "early-goal": "まだ荷物が残っています！",
    "same-cell": "現在地です",
    "hint-limit": "この挑戦のヒントは2回までです",
    "no-solution": "今の道からは配達できません。少し戻ってみましょう",
    "hint-unavailable": "ヒントを表示できませんでした。回数は減っていません",
    "stale-hint": "道が変わったため、古いヒントは取り消しました",
  };
  return messages[outcome] ?? messages.start;
}

function renderStageSelect(note = "") {
  progress = store.snapshot().progress;
  elements.stageGrid.replaceChildren();
  for (const item of STAGES) {
    const unlocked = item.id <= progress.unlockedStage;
    const best = progress.bestScores[item.id];
    const evaluation = best === null ? null : evaluateScore(best);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `stage-card${unlocked ? "" : " locked"}`;
    button.disabled = !unlocked;
    button.dataset.stageId = String(item.id);
    button.setAttribute("aria-label", unlocked
      ? `ステージ${item.id}${best === null ? " 未クリア" : ` ベスト${best}点 星${evaluation.stars}`}`
      : `ステージ${item.id} 未解放`);
    button.innerHTML = unlocked
      ? `<strong>STAGE ${item.id}</strong><span class="stars">${evaluation ? "★".repeat(evaluation.stars) + "☆".repeat(3 - evaluation.stars) : "☆☆☆"}</span><span class="stage-meta">${best === null ? "未クリア" : `BEST ${best}`}</span>`
      : `<strong>🔒 STAGE ${item.id}</strong><span class="stage-meta">ひとつ前をクリア</span>`;
    if (unlocked) button.addEventListener("click", () => startStage(item.id));
    elements.stageGrid.append(button);
  }
  const snapshot = store.snapshot();
  elements.storageWarning.hidden = !snapshot.warning;
  elements.storageWarning.textContent = snapshot.warning;
  const allCleared = Object.values(progress.bestScores).every((score) => score !== null);
  elements.allClearSummary.hidden = !allCleared && !note;
  elements.allClearSummary.textContent = note || (allCleared ? `全ステージ配達完了！ 総合ベスト ${getTotalBest(progress)}点` : "");
  showScreen(elements.stages);
}

function startStage(stageId) {
  const selected = getStage(stageId);
  if (!selected || selected.id > progress.unlockedStage) return false;
  stage = selected;
  game = createGameState(stage);
  cancelHintHighlight();
  hintBusy = false;
  elements.stageNumber.textContent = String(stage.id);
  showScreen(elements.play);
  renderPlay();
  return true;
}

function cellIcon(cell) {
  const key = coordKey(cell);
  if (sameCoord(cell, stage.start)) return "🚚";
  if (sameCoord(cell, stage.goal)) return "🏁";
  if (stage.parcels.some((parcel) => coordKey(parcel) === key)) return "📦";
  if (stage.walls.some((wall) => coordKey(wall) === key)) return "✕";
  return "";
}

function renderBoard() {
  const routeKeys = new Set(game.route.map(coordKey));
  const endpointKey = coordKey(currentCell(game));
  const wallKeys = new Set(stage.walls.map(coordKey));
  const fragment = document.createDocumentFragment();
  elements.board.style.setProperty("--size", stage.size);
  elements.board.replaceChildren();
  for (let row = 0; row < stage.size; row += 1) {
    for (let col = 0; col < stage.size; col += 1) {
      const cell = [row, col];
      const key = coordKey(cell);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${row + 1}行${col + 1}列 ${cellIcon(cell) || "道"}`);
      if (routeKeys.has(key)) button.classList.add("route");
      if (endpointKey === key) button.classList.add("endpoint");
      if (wallKeys.has(key)) button.classList.add("wall");
      if (hintedCell && coordKey(hintedCell) === key) button.classList.add("hint");
      button.innerHTML = `<span class="cell-icon">${cellIcon(cell)}</span><span class="cell-coordinate">${row + 1},${col + 1}</span>`;
      button.addEventListener("click", (event) => {
        if (event.detail === 0) handleCell(cell);
      });
      fragment.append(button);
    }
  }
  elements.board.append(fragment);
}

function renderPlay(outcome = game.message) {
  const summary = summarizeState(game, stage);
  elements.score.textContent = String(summary.score);
  elements.parcels.textContent = `${summary.collected}/${stage.parcels.length}`;
  elements.hints.textContent = `${summary.hintsRemaining}/2`;
  elements.message.textContent = messageFor(outcome);
  elements.undo.disabled = game.status !== "playing" || game.route.length <= 1;
  elements.reset.disabled = game.status !== "playing" || game.route.length <= 1;
  elements.hint.disabled = game.status !== "playing" || game.hintCount >= 2 || hintBusy;
  renderBoard();
}

function handleCell(cell) {
  if (!game || game.status !== "playing") return;
  cancelHintHighlight();
  const result = moveTo(game, stage, cell);
  game = result.state;
  if (game.status === "cleared") {
    finishStage();
    return;
  }
  renderPlay(result.outcome);
}

function finishStage() {
  cancelHintHighlight();
  const score = calculateScore(game);
  const evaluation = evaluateScore(score, game);
  const recorded = recordClear(progress, stage.id, score);
  progress = store.save(recorded.progress);
  const storageSnapshot = store.snapshot();
  lastClear = { stageId: stage.id, score, evaluation, ...recorded };
  elements.resultStars.textContent = "★".repeat(evaluation.stars) + "☆".repeat(3 - evaluation.stars);
  elements.resultStars.setAttribute("aria-label", `星${evaluation.stars}`);
  elements.resultLabel.textContent = evaluation.label;
  elements.resultScore.textContent = String(score);
  elements.bestMessage.textContent = recorded.bestUpdated ? "自己ベスト更新！" : `自己ベスト ${progress.bestScores[stage.id]}点`;
  elements.resultStorageWarning.hidden = !storageSnapshot.warning;
  elements.resultStorageWarning.textContent = storageSnapshot.warning
    ? `${storageSnapshot.warning} 再読み込み後には今回の記録が残りません`
    : "";
  elements.totalScore.textContent = `総合ベスト ${getTotalBest(progress)} / 6000点`;
  elements.next.hidden = stage.id >= 6;
  elements.next.disabled = stage.id >= progress.unlockedStage;
  showScreen(elements.result);
}

async function requestHint() {
  if (!game || hintBusy || game.hintCount >= 2 || game.status !== "playing") return;
  hintBusy = true;
  const revision = game.inputRevision;
  renderPlay();
  await Promise.resolve();
  const result = solveHint(stage, game);
  const applied = applyHintResult(game, result, revision);
  game = applied.state;
  if (applied.outcome === "hint-found") {
    hintedCell = result.nextCell;
  }
  hintBusy = false;
  renderPlay(applied.outcome);
  if (applied.outcome === "hint-found") {
    elements.message.textContent = `${directionLabel(currentCell(game), result.nextCell)}へ1マス進めます（−100点）`;
    scheduleHintHighlightEnd();
  }
}

function eventCell(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".cell");
  if (!target || !elements.board.contains(target)) return null;
  return [Number(target.dataset.row), Number(target.dataset.col)];
}

const pointerInput = new PointerInputAdapter(handleCell);
elements.board.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button > 0) return;
  const cell = eventCell(event);
  if (!cell || !pointerInput.pointerDown(event.pointerId, cell)) return;
  elements.board.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
elements.board.addEventListener("pointermove", (event) => {
  if (pointerInput.pointerMove(event.pointerId, eventCell(event))) event.preventDefault();
});
elements.board.addEventListener("pointerup", (event) => pointerInput.pointerUp(event.pointerId));
elements.board.addEventListener("pointercancel", (event) => pointerInput.pointerCancel(event.pointerId));
elements.board.addEventListener("lostpointercapture", (event) => pointerInput.pointerCancel(event.pointerId));

document.querySelector("#start-button").addEventListener("click", () => renderStageSelect());
document.querySelector("#back-title-button").addEventListener("click", () => showScreen(elements.title));
elements.undo.addEventListener("click", () => {
  const result = undoMove(game);
  game = result.state;
  cancelHintHighlight();
  renderPlay(result.outcome);
});
elements.reset.addEventListener("click", () => {
  const result = resetRoute(game, stage);
  game = result.state;
  cancelHintHighlight();
  renderPlay(result.outcome);
});
elements.hint.addEventListener("click", requestHint);
document.querySelector("#exit-button").addEventListener("click", () => {
  if (game?.route.length > 1 && !window.confirm("この挑戦を終了してステージ選択へ戻りますか？")) return;
  cancelHintHighlight();
  game = null;
  renderStageSelect();
});
document.querySelector("#retry-button").addEventListener("click", () => startStage(lastClear.stageId));
elements.next.addEventListener("click", () => startStage(lastClear.stageId + 1));
document.querySelector("#result-stage-button").addEventListener("click", () => renderStageSelect());

const navigationType = performance.getEntriesByType?.("navigation")?.[0]?.type;
if (navigationType === "reload") renderStageSelect();
else showScreen(elements.title);

