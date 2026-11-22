import { DAY_COUNT, MAX_BAKE, PRICES, UNIT_COST } from "./config.js";
import { createGameState, dispatch, forecastDemand, rankForProfit, totalProfit } from "./game-core.js";
import { getScenario, SCENARIOS } from "./scenario-catalog.js";
import { createBestStorage } from "./storage.js";

const game = document.querySelector("#game");
const dialog = document.querySelector("#abort-dialog");
const storage = createBestStorage();
const weatherIcons = { はれ: "☀", くもり: "☁", あめ: "☂" };
const ranks = ["未達", "クリア", "上手に経営", "大繁盛"];
const saveMessages = {
  saved: "自己ベストを保存しました。",
  unchanged: "保存済みの自己ベストを維持しました。",
  "read-error": "記録を確認できないため、今回の結果は保存されていません。",
  "write-error": "書き込みに失敗したため、今回の結果は保存されていません。",
};

let state = createGameState();
let finalSave;

function coins(amount) {
  return `${amount.toLocaleString("ja-JP")} コイン`;
}

function rankLabel(id, profit) {
  const rank = rankForProfit(id, profit);
  return `星 ${rank} / 3・${ranks[rank]}`;
}

function bestLabel(id, best) {
  switch (best.status) {
    case "found": return `${coins(best.value)}（${rankLabel(id, best.value)}）`;
    case "unregistered": return "未挑戦";
    case "corrupt": return "記録破損";
    case "read-error": return "記録を確認できません";
  }
}

function button(action, label, className = "", disabled = false) {
  return `<button type="button" class="${className}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function titleScreen() {
  const records = SCENARIOS.map((week) => ({ week, best: storage.readBest(week.id) }));
  const completed = records.filter(({ week, best }) =>
    best.status === "found" && rankForProfit(week.id, best.value) === 3).length;
  return `
    <header class="hero">
      <div>
        <h1 tabindex="-1">おてんき<br class="hero-break">ベーカリー</h1>
        <p>天気を見て、パンの値段と焼く数を決めよう。<br>一週間は${DAY_COUNT}営業日。遊ぶ時間のめやすは2〜4分。</p>
        <p class="rules">原価 ${UNIT_COST} コイン／個 <span>価格 ${PRICES.join("・")} コイン</span></p>
      </div>
      <div class="bakery-art" aria-hidden="true">
        <span class="sun"></span><span class="awning"></span><span class="loaf"></span>
      </div>
    </header>
    <section class="surface">
      <fieldset>
        <legend>遊ぶ週をえらぶ</legend>
        <p class="muted">星3達成 ${completed} / ${SCENARIOS.length} 週（確認できた記録）</p>
        <div class="week-grid">
          ${records.map(({ week, best }) => {
            const { star1, star2, star3 } = week.starThresholds;
            return `<label class="choice week-card">
              <input id="week-${week.id}" type="radio" name="week" value="${week.id}" ${week.id === state.selectedScenarioId ? "checked" : ""}>
              <span><strong><span class="week-id">${week.id}</span> ${week.name}</strong>
              <small>星1 ${star1}・星2 ${star2}・星3 ${star3} コイン</small>
              <small>自己ベスト ${bestLabel(week.id, best)}</small></span>
            </label>`;
          }).join("")}
        </div>
      </fieldset>
      <div class="actions">${button("START", "はじめる", "primary")}</div>
    </section>`;
}

function heading(week, title, dayNumber) {
  return `<header class="screen-header">
    <p class="week-id">${week.id} ${week.name}${dayNumber ? ` · ${dayNumber} / ${DAY_COUNT} 日目` : ""}</p>
    <h1 tabindex="-1">${title}</h1>
  </header>`;
}

function planScreen(week) {
  const day = week.days[state.dayIndex];
  const max = Math.min(MAX_BAKE, Math.floor(state.cash / UNIT_COST));
  return `
    ${heading(week, "開店準備", day.dayNo)}
    <section class="surface">
      <div class="summary">
        <p><span class="weather" aria-hidden="true">${weatherIcons[day.weather]}</span> ${day.weather}<br><small>基礎客数 ${day.baseDemand} 人</small></p>
        <p>所持金<br><strong>${coins(state.cash)}</strong></p>
      </div>
      <fieldset>
        <legend>販売価格</legend>
        <p class="muted">予報は今日の客数の可能範囲です。客数を保証するものではありません。</p>
        <div class="price-grid">
          ${PRICES.map((price) => {
            const { low, high } = forecastDemand(day, price);
            return `<label class="choice">
              <input id="price-${price}" type="radio" name="price" value="${price}" ${price === state.selectedPrice ? "checked" : ""}>
              <span><strong>${coins(price)}</strong><small>予報 ${low}〜${high} 人</small></span>
            </label>`;
          }).join("")}
        </div>
      </fieldset>
      <div class="quantity">
        <label for="bake-count">焼く数</label>
        <select id="bake-count" name="quantity">
          ${Array.from({ length: max + 1 }, (_, n) =>
            `<option value="${n}" ${n === state.bakeCount ? "selected" : ""}>${n} 個</option>`).join("")}
        </select>
        <p>製造費 <strong>${coins(state.bakeCount * UNIT_COST)}</strong><br><small>現在の上限 ${max} 個</small></p>
      </div>
      ${state.bakeCount === 0 ? '<p id="zero-warning" class="notice">0個で開店すると売上0コインです。開店後は取り消せません</p>' : ""}
      <button type="button" data-action="OPEN_SHOP" class="primary full" ${state.bakeCount === 0 ? 'aria-describedby="zero-warning"' : ""}>開店する</button>
    </section>
    <div class="actions">${button("REQUEST_ABORT", "途中でやめる", "quiet")}</div>`;
}

function dayResultScreen(week) {
  const day = state.dailyResult;
  const last = day.dayNo === DAY_COUNT;
  return `
    ${heading(week, "営業結果", day.dayNo)}
    <section class="surface">
      <dl class="metrics">
        <div><dt>実際の客数</dt><dd>${day.demand} 人</dd></div>
        <div><dt>販売数</dt><dd>${day.sold} 個</dd></div>
        <div><dt>売れ残り</dt><dd>${day.leftovers} 個</dd></div>
        <div><dt>売上</dt><dd>${coins(day.revenue)}</dd></div>
        <div><dt>原価</dt><dd>${coins(day.cost)}</dd></div>
        <div><dt>当日利益</dt><dd>${coins(day.profit)}</dd></div>
      </dl>
      <p class="cash">現在資金 <strong>${coins(state.cash)}</strong></p>
      <div class="actions">${last
        ? button("SHOW_FINAL", "最終結果へ", "primary")
        : button("NEXT_DAY", "次の日へ", "primary")}</div>
    </section>
    <div class="actions">${button("REQUEST_ABORT", "途中でやめる", "quiet")}</div>`;
}

function finalScreen(week) {
  const profit = totalProfit(state);
  return `
    ${heading(week, "最終結果")}
    <section class="surface">
      <div class="summary">
        <p>${DAY_COUNT}日間の累計利益<br><strong>${coins(profit)}</strong></p>
        <p>評価<br><strong>${rankLabel(week.id, profit)}</strong></p>
      </div>
      <p>保存済み自己ベスト <strong>${bestLabel(week.id, finalSave.best)}</strong></p>
      <p class="notice">${saveMessages[finalSave.status]}</p>
      <table>
        <caption>日別結果</caption>
        <thead><tr><th scope="col">営業日</th><th scope="col">天気</th><th scope="col">客数</th><th scope="col">利益</th></tr></thead>
        <tbody>${state.history.map((day) => `
          <tr><th scope="row">${day.dayNo}日目</th><td>${day.weather}</td><td>${day.demand} 人</td><td>${coins(day.profit)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="actions">
        ${button("RETRY_SAME_WEEK", "同じ週に再挑戦", "primary")}
        ${button("CHOOSE_WEEK", "別の週を選ぶ")}
      </div>
    </section>`;
}

function render() {
  const week = getScenario(state.activeScenarioId);
  const screens = { TITLE: titleScreen, PLAN: planScreen, DAY_RESULT: dayResultScreen, FINAL: finalScreen };
  game.dataset.phase = state.phase;
  game.innerHTML = screens[state.phase](week);
}

function act(action, focusId) {
  const previous = state;
  state = dispatch(state, action);
  if (state === previous) return;

  if (state.abortPending) {
    dialog.showModal();
    return;
  }
  if (previous.abortPending) {
    dialog.close();
    if (action.type === "CANCEL_ABORT") {
      game.querySelector('[data-action="REQUEST_ABORT"]').focus();
      return;
    }
  }

  if (state.phase === "FINAL" && previous.phase !== "FINAL") {
    finalSave = storage.saveBest(state.activeScenarioId, totalProfit(state));
  }
  render();
  if (state.phase !== previous.phase) game.querySelector("h1").focus();
  else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

document.body.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-action]");
  if (control && !control.disabled) act({ type: control.dataset.action });
});

game.addEventListener("change", (event) => {
  const input = event.target;
  const actions = {
    week: { type: "SELECT_WEEK", scenarioId: input.value },
    price: { type: "SET_PRICE", price: Number(input.value) },
    quantity: { type: "SET_BAKE_COUNT", bakeCount: Number(input.value) },
  };
  if (Object.hasOwn(actions, input.name)) act(actions[input.name], input.id);
});

dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  act({ type: "CANCEL_ABORT" });
});

render();
