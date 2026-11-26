import { createSessionController } from '../../src/app/session-controller';
import { stageA2TrialChart } from '../../src/content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../../src/content/stage-a2-trial';
import type { GameCommand, Ms } from '../../src/contracts/interface_contracts';
import { clockSampleIntervalMs, createFixedAudioClock, tickToUs } from '../../src/domain/audio-clock';
import { compileChart, createChartMusicContext } from '../../src/domain/chart-compiler';
import { createSaveRules } from '../../src/domain/save-data';
import { attachKeyboardPointerInput } from '../../src/infrastructure/keyboard-pointer-input';
import { createSessionAudioBridge } from '../../src/infrastructure/session-audio-bridge';
import { attachSessionLifecycle } from '../../src/infrastructure/session-lifecycle';
import { createStorageCoordinator } from '../../src/infrastructure/storage-coordinator';
import { createWriterLock } from '../../src/infrastructure/writer-lock';

if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.search !== '?a2c-test-only=1') {
  throw new Error('The A-2c technical fixture requires an isolated loopback origin.');
}

function button(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing ${id}`);
  return element;
}

const definition = stageA2TrialMusic;
const chart = compileChart(stageA2TrialChart, createChartMusicContext(definition), 'complete');
if (!chart.ok) throw new Error(chart.error.messageKey);
const rules = createSaveRules([chart.value]);
let reportLost = () => {};
const writer = createWriterLock({ locks: navigator.locks, ownerId: crypto.randomUUID(), onLost: () => reportLost() });
const storage = createStorageCoordinator({ storage: localStorage, lock: writer, rules, createEpoch: () => crypto.randomUUID() });
const audio = createSessionAudioBridge(tickToUs, createFixedAudioClock, clockSampleIntervalMs);
const now = () => performance.now() as Ms;
const app = createSessionController({
  audio, storage,
  writer: { status: () => writer.currentLease() ? 'OWNED' : navigator.locks ? 'UNOWNED' : 'UNSUPPORTED',
    currentLease: writer.currentLease },
  getMusic: id => id === definition.master.musicId ? definition : null,
  getChart: (id, difficulty) => id === definition.master.musicId && difficulty === 'HARD' ? chart.value : null,
  getTutorial: () => null,
  settingsValid: value => {
    const data = storage.read().data;
    return data !== null && rules.updateSettings(data, value).ok;
  },
  nextSessionId: () => crypto.randomUUID(),
  now, recordedAt: () => new Date().toISOString(),
});

reportLost = () => {
  void app.handleLifecycleEvent({ kind: 'LOCK_LOST', atPerformanceMs: now(), sessionId: null, generation: null });
};

const prepare = button('prepare');
const start = button('start');
const pause = button('pause');
const resume = button('resume');
const state = document.getElementById('state')!;
const input = attachKeyboardPointerInput({
  keyboardTarget: window, laneButtons: [1, 2, 3, 4].map(lane => button(`lane-${lane}`)) as
    [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement, HTMLButtonElement],
  contextAt: app.contextAt,
  onInput: value => { app.enqueueInput(value); },
  onCancel: event => { void app.handleLifecycleEvent(event); },
});
const disposeLifecycle = attachSessionLifecycle({
  window, document, now, onEvent: event => { void app.handleLifecycleEvent(event); },
});

function show() {
  const activity = app.read();
  const snapshot = app.store.getSnapshot();
  state.textContent = JSON.stringify({
    state: snapshot.state, sessionId: snapshot.sessionId, screen: activity.screen, selectedReady: activity.prepared,
    ownsWriter: !!writer.currentLease(), life: snapshot.lifeUnits, score: snapshot.score,
  });
  start.disabled = !activity.prepared || !writer.currentLease() || activity.screen !== 'MUSIC_SELECT';
  pause.disabled = !['COUNTDOWN', 'PREROLL', 'PLAYING', 'FINALIZING'].includes(snapshot.state);
  resume.disabled = snapshot.state !== 'PAUSED';
}

function send(kind: 'START_GAME' | 'PAUSE_GAME' | 'RESUME_GAME') {
  const command: GameCommand = { requestId: crypto.randomUUID(), kind, sessionId: app.store.getSnapshot().sessionId };
  return app.dispatch(command, true);
}

prepare.addEventListener('click', () => {
  app.navigate('MENU');
  app.navigate('MUSIC_SELECT');
  void app.dispatch({ requestId: crypto.randomUUID(), kind: 'SELECT_DIFFICULTY', difficulty: 'HARD', sessionId: null });
});
start.addEventListener('click', () => { void send('START_GAME'); });
pause.addEventListener('click', () => { void send('PAUSE_GAME'); });
resume.addEventListener('click', () => { void send('RESUME_GAME'); });

let frame: number;
function advance(at: number) {
  app.advance(at as Ms);
  show();
  frame = requestAnimationFrame(advance);
}
show();
frame = requestAnimationFrame(advance);
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  cancelAnimationFrame(frame);
  input.dispose();
  disposeLifecycle();
  app.dispose();
  void audio.dispose();
}, { once: false });
