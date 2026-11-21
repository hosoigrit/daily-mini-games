import { scoreOf } from "../src/config.mjs";
import { createBrowserController, PLAY_CONFIG, shortcutFor } from "./browser-controller.mjs";
import { createRecords } from "./persistence.mjs";
import { createRenderer } from "./renderer.mjs";
import { renderTrafficGuide } from "./traffic-guide.mjs";

renderTrafficGuide(document, PLAY_CONFIG);
const records = createRecords();
const render = createRenderer(document);
let stored = false;
const controller = createBrowserController({
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  isHidden: () => document.hidden,
  onChange(view) {
    if (view.status === "READY") stored = false;
    if (view.status === "FINISHED" && !stored) {
      const { result, snapshot, config } = view.session;
      records.record(result, scoreOf(snapshot, config));
      stored = true;
    }
    render(view, records.read());
  },
});

const actions = {
  start: "START", pause: "PAUSE", resume: "RESUME",
  "east-west": "SWITCH_EW", "north-south": "SWITCH_NS",
  "pause-retry": "RETRY", retry: "RETRY",
};
for (const [id, type] of Object.entries(actions)) {
  document.getElementById(id).addEventListener("click", () => controller.dispatch(type));
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("cancel", (event) => event.preventDefault());
}
document.addEventListener("visibilitychange", controller.visibilityChanged);
document.addEventListener("keydown", (event) => {
  const action = shortcutFor(event, controller.getStatus());
  if (!action) return;
  event.preventDefault();
  controller.dispatch(action);
});
