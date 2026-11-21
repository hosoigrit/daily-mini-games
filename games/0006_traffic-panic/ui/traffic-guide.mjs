// Presentation-only derivation. No balance values are duplicated in HTML.
export function trafficGuideModel(config) {
  const toSeconds = (ticks) => (ticks * config.tickDurationMs / 1000).toFixed(1);
  const rows = config.phases.map((phase, index) => {
    // firstTick is one interval after this phase starts.
    const start = phase.firstTick - phase.interval;
    const end = index + 1 < config.phases.length
      ? config.phases[index + 1].firstTick - config.phases[index + 1].interval
      : config.endTick;
    const ns = (phase.weights.N + phase.weights.S) / 100;
    const ew = (phase.weights.E + phase.weights.W) / 100;
    return {
      window: `${toSeconds(start)}〜${toSeconds(end)}秒`,
      cadence: `${toSeconds(phase.interval)}秒ごと`,
      ratio: `${ns}% / ${ew}%`,
    };
  });
  return {
    rows,
    switchText: `切替中は黄 ${toSeconds(config.yellowTicks)}秒 → 全赤 ${toSeconds(config.allRedTicks)}秒。切替中はどちらも通過できません。`,
    lossText: `各流入方向は${config.maxQueuePerDirection}台まで待機できます。同じ方向に${config.maxQueuePerDirection + 1}台目が到着すると即ゲームオーバー。`,
  };
}

export function renderTrafficGuide(doc, config) {
  const model = trafficGuideModel(config);
  const body = doc.getElementById("traffic-guide-rows");
  const rows = model.rows.map(({ window, cadence, ratio }) => {
    const tr = doc.createElement("tr");
    for (const value of [window, cadence, ratio]) {
      const td = doc.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    return tr;
  });
  body.replaceChildren(...rows);
  doc.getElementById("traffic-guide-switch").textContent = model.switchText;
  doc.getElementById("traffic-guide-loss").textContent = model.lossText;
}
