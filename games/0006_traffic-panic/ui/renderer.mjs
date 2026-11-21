import { FAILURE_DIRECTIONS, QUEUE_KEYS, scoreOf } from "../src/config.mjs";
import { PLAY_CONFIG } from "./browser-controller.mjs";

const DIRECTIONS = { N: "北", E: "東", S: "南", W: "西" };
const ROTATIONS = { N: 0, E: 90, S: 180, W: 270 };
const PHASES = {
  EW_GREEN: ["東西 青", "green"], NS_GREEN: ["南北 青", "green"],
  EW_YELLOW: ["東西 黄", "yellow"], NS_YELLOW: ["南北 黄", "yellow"],
  ALL_RED_TO_NS: ["全赤（次は南北）", "red"], ALL_RED_TO_EW: ["全赤（次は東西）", "red"],
};
const RISKS = ["通常", "注意", "危険"];
const PAUSE_REASONS = {
  manual: "時間と交通の進行を止めました。",
  hidden: "画面が非表示になったため停止しました。",
  gap: "画面の更新が長く途切れたため停止しました。",
};
const SVG_NS = "http://www.w3.org/2000/svg";
const formatRecord = (value) => value === null ? "—" : String(value);
const seconds = (ticks) => (ticks * PLAY_CONFIG.tickDurationMs / 1000).toFixed(1);

export function describeResult(status, session) {
  if (status === "ERROR") return ["技術的問題による停止", "診断情報を確認するか、新しいセッションで再試行できます。"];
  if (session.result === "CLEAR") return ["CLEAR", "60秒間、交差点を守り切りました。"];
  const direction = Object.keys(FAILURE_DIRECTIONS).find((key) => FAILURE_DIRECTIONS[key] === session.failureDirection);
  return ["GRIDLOCK", `${DIRECTIONS[direction]}から9台目が到着し、渋滞が発生しました。`];
}

export function createRenderer(doc) {
  const byId = (id) => doc.getElementById(id);
  const text = (node, value) => {
    if (node.textContent !== String(value)) node.textContent = value;
  };
  const shell = byId("game");
  const queueNodes = {};
  const lampNodes = {};
  const cars = byId("cars");
  const passing = byId("passing");
  const lamps = byId("road-signals");
  const pause = byId("pause-dialog");
  const result = byId("result-dialog");
  let priorStatus;
  let signalPhase;
  const priorQueues = {};
  let priorSession;

  function svg(tag, attrs) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }
  function approach(direction) {
    return svg("g", { transform: `rotate(${ROTATIONS[direction]} 240 240)` });
  }
  for (const direction of Object.keys(DIRECTIONS)) {
    const queue = doc.querySelector(`[data-direction="${direction}"]`);
    const group = approach(direction);
    const lamp = svg("circle", { cx: 188, cy: 158, r: 7, class: "road-lamp" });
    group.append(lamp);
    lamps.append(group);
    const lane = approach(direction);
    cars.append(lane);
    queueNodes[direction] = { queue, lane, count: queue.querySelector("strong"), label: queue.querySelector("small") };
    lampNodes[direction] = lamp;
  }

  function drawSnapshot(session, announce) {
    const { snapshot, config } = session;
    const { elapsedTick, signal, queues } = snapshot;
    const phase = signal.phase;
    text(byId("remaining"), seconds(config.endTick - elapsedTick));
    text(byId("score"), scoreOf(snapshot, config));
    if (phase !== signalPhase) {
      const [label, color] = PHASES[phase];
      text(byId("signal-label"), label);
      byId("signal-dot").dataset.color = color;
      const axis = phase.slice(0, 2);
      for (const [direction, lamp] of Object.entries(lampNodes)) {
        const approachAxis = direction === "N" || direction === "S" ? "NS" : "EW";
        lamp.dataset.light = axis === approachAxis ? color : "red";
      }
      if (signalPhase !== undefined) announce.push(label);
      signalPhase = phase;
    }
    text(byId("transition-time"), signal.nextTransitionTick === null || elapsedTick >= config.endTick
      ? "" : `切替まで ${seconds(signal.nextTransitionTick - elapsedTick)} 秒`);

    for (const [direction, { queue, lane, count, label }] of Object.entries(queueNodes)) {
      const size = queues[QUEUE_KEYS[direction]];
      if (priorQueues[direction] === size) continue;
      const risk = size >= 7 ? 2 : size >= 5 ? 1 : 0;
      if (priorQueues[direction] !== undefined && Number(queue.dataset.risk) !== risk) {
        announce.push(`${DIRECTIONS[direction]} ${RISKS[risk]} ${size}台`);
      }
      priorQueues[direction] = size;
      text(count, size);
      text(label, RISKS[risk]);
      queue.dataset.risk = risk;
      lane.replaceChildren(...Array.from({ length: size }, (_, i) => svg("use", {
        href: "#car", x: 214, y: 151 - i * 18, class: "vehicle",
      })));
    }
  }

  function animatePassages(events) {
    if (doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const { direction, type } of events) {
      if (type !== "VEHICLE_PASSED") continue;
      const lane = approach(direction);
      const car = svg("use", { href: "#car", class: "pass-car" });
      car.addEventListener("animationend", () => lane.remove(), { once: true });
      lane.append(car);
      passing.append(lane);
    }
  }

  function drawButtons(status, phase) {
    for (const [axis, id] of [["EW", "east-west"], ["NS", "north-south"]]) {
      const button = byId(id);
      const green = phase === `${axis}_GREEN`;
      const open = phase === "EW_GREEN" || phase === "NS_GREEN";
      button.disabled = !open || status !== "RUNNING" || green;
      text(button.querySelector("small"), open ? (green ? "現在青" : "切替先") : "信号切替中");
    }
  }

  function drawRecords(records) {
    text(byId("best-clear"), formatRecord(records.bestClear));
    text(byId("best-attempt"), formatRecord(records.bestAttempt));
    byId("storage-warning").hidden = records.warning === null;
    text(byId("storage-warning"), records.warning ?? "");
  }

  function drawResult(status, session, fault, records) {
    const [heading, explanation] = describeResult(status, session);
    const isError = status === "ERROR";
    result.dataset.result = isError ? "ERROR" : session.result;
    text(byId("result-heading"), heading);
    text(byId("result-reason"), explanation);
    byId("result-stats").hidden = isError;
    byId("fault-info").hidden = !isError;
    byId("fault-info").open = false;
    text(byId("fault-code"), isError ? JSON.stringify(fault, null, 2) : "");
    text(byId("session-reference"), session ? `HARD-A · seed ${session.seedId}` : "HARD-A");
    const warning = byId("result-storage-warning");
    warning.hidden = records.warning === null;
    text(warning, records.warning ?? "");
    if (isError) return;
    const { snapshot, config } = session;
    text(byId("final-score"), scoreOf(snapshot, config));
    text(byId("final-passed"), `${snapshot.passedVehicles} 台`);
    text(byId("final-time"), `${seconds(snapshot.elapsedTick)} 秒`);
    text(byId("final-switches"), `${snapshot.switchCount} 回`);
    text(byId("final-best-clear"), formatRecord(records.bestClear));
    text(byId("final-best-attempt"), formatRecord(records.bestAttempt));
  }

  function render({ status, session, fault, events, pauseReason }, records) {
    const announce = [];
    shell.dataset.status = status;
    if (status === "READY" && session?.seedId !== priorSession) {
      passing.replaceChildren();
      signalPhase = undefined;
      for (const direction of Object.keys(priorQueues)) delete priorQueues[direction];
      text(byId("announcements"), "");
    }
    if (session) {
      priorSession = session.seedId;
      drawSnapshot(session, announce);
    }
    const title = status === "READY" || !session;
    byId("title-panel").hidden = !title;
    byId("start").disabled = status !== "READY";
    byId("dashboard").hidden = title;
    byId("controls").hidden = title;
    byId("pause").disabled = status !== "RUNNING";
    drawButtons(status, session?.snapshot.signal.phase);
    drawRecords(records);
    animatePassages(events);
    if (announce.length) text(byId("announcements"), announce.join("。"));
    if (status === priorStatus) return;

    if (pause.open) pause.close();
    if (result.open) result.close();
    if (status === "PAUSED") {
      text(byId("pause-reason"), PAUSE_REASONS[pauseReason]);
      pause.showModal();
    } else if (status === "FINISHED" || status === "ERROR") {
      drawResult(status, session, fault, records);
      result.showModal();
    } else if (status === "RUNNING") {
      (byId("north-south").disabled ? byId("east-west").disabled ? byId("pause") : byId("east-west") : byId("north-south")).focus();
    } else if (priorStatus !== undefined) byId("start").focus();
    priorStatus = status;
  }

  return render;
}
