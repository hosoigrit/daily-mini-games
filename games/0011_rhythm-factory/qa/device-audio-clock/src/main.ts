import { createHarnessController, type HarnessState } from './controller';
import { copyJson, downloadJson, exportJson } from './export';
import {
  makeEvidence, summarize, TEST_CASES, type ClockObservation, type DeviceInput,
  type FixtureId, type TestCaseId, type Trial,
} from './model';
import './style.css';

const controller = createHarnessController();

function element<T extends Element = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`QA UI element missing: ${id}`);
  return node as unknown as T;
}

function setText(node: Element, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function milliseconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(3)} ms`;
}

function seconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} 秒`;
}

const readout = {
  harnessVersion: element('harness-version'),
  harnessCommit: element('harness-commit'),
  productCommit: element('product-commit'),
  baselineCommit: element('baseline-commit'),
  fixtureId: element('fixture-id'),
  viewport: element('viewport'),
  runtime: element('runtime-summary'),
  note: element('run-note'),
  phase: element('phase'),
  current: element('sync-current'),
  maximum: element('sync-max'),
  renderTime: element('render-time'),
  elapsedTime: element('elapsed-time'),
  context: element('context-state'),
  anchor: element('anchor-state'),
  generation: element('clock-generation'),
  valid: element('valid-samples'),
  overLimit: element('excess-samples'),
  progress: element('progress'),
  reason: element('stop-reason'),
  hint: element('case-hint'),
};

const options = {
  testCase: element<HTMLSelectElement>('test-case'),
  fixture: element<HTMLSelectElement>('fixture'),
  diagnostics: element<HTMLInputElement>('diagnostics'),
  environment: element<HTMLSelectElement>('environment'),
  deviceType: element<HTMLSelectElement>('device-type'),
  os: element<HTMLSelectElement>('os'),
  osVersion: element<HTMLInputElement>('os-version'),
  browser: element<HTMLSelectElement>('browser'),
  browserVersion: element<HTMLInputElement>('browser-version'),
  output: element<HTMLSelectElement>('audio-output'),
  powerMode: element<HTMLSelectElement>('power-mode'),
};

const buttons = {
  prepare: element<HTMLButtonElement>('prepare'),
  enable: element<HTMLButtonElement>('enable'),
  play: element<HTMLButtonElement>('play'),
  stop: element<HTMLButtonElement>('stop'),
  resume: element<HTMLButtonElement>('resume'),
  release: element<HTMLButtonElement>('release'),
  next: element<HTMLButtonElement>('next'),
  abort: element<HTMLButtonElement>('abort'),
  save: element<HTMLButtonElement>('save-json'),
  copy: element<HTMLButtonElement>('copy-json'),
  confirm: element<HTMLButtonElement>('confirm-download'),
  confirmManual: element<HTMLButtonElement>('confirm-manual-copy'),
};

const chart = {
  figure: element('clock-chart'),
  plot: element<SVGSVGElement>('chart-plot'),
  path: element<SVGPathElement>('chart-series'),
  limit: element<SVGLineElement>('chart-limit'),
  label: element('chart-label'),
};

const results = {
  list: element('trial-results'),
  summary: element('result-summary'),
  exportStatus: element('export-status'),
  fallback: element('export-fallback'),
  output: element<HTMLTextAreaElement>('json-output'),
};

const safetyActions = element('safety-actions');
const phaseNames: Record<HarnessState['phase'], string> = {
  idle: '未開始',
  preparing: '冷音源生成中',
  prepared: '音源準備済み',
  enabling: '音声有効化を観測中',
  enabled: '音声有効',
  playing: '再生中',
  stopped: '停止中',
  releasing: '解放中',
  'awaiting-export': '結果の保存待ち',
  'rerun-ready': '再実行の準備待ち',
  finished: '試行終了',
};

const caseHints: Record<(typeof TEST_CASES)[number]['mode'], string> = {
  anchor: '再生開始後、初回観測でアンカーを検証します。',
  natural: '冷生成 → 音声有効化 → 再生開始。曲が終わるまで前景のままお待ちください。',
  restart: '再生中に停止し、新世代で再開します。',
  export: '最初の結果を保存またはコピーし、冷生成から再実行します。',
};

const activationLabels: Record<Trial['activation'], string> = {
  SUCCESS: '成功', FAIL: '失敗', PENDING: '保留', 'NOT RUN': '未実施',
};

const audioStateLabels: Record<string, string> = {
  running: '稼働中 (running)',
  suspended: '停止中 (suspended)',
  interrupted: '中断中 (interrupted)',
  closed: '解放済み (closed)',
};

const stopReasons: Record<string, string> = {
  'clock.outOfSync': '同期差が20 msを超過しました',
  'clock.notAdvancing': '出力時計が進まないか、逆行しました',
  'clock.unavailable': '有効な出力タイムスタンプを取得できませんでした',
  'clock.noAnchor': '固定アンカーを取得できませんでした',
  'audio.interrupted': 'AudioContext が中断しました',
  'audio.gestureRequired': 'ブラウザが音声を有効化できませんでした',
  'audio.resumeUnavailable': 'AudioContext を再開できませんでした',
  'audio.pcmEvidenceInvalid': '生成した音源が検証形式を満たしませんでした',
  'audio.releaseUnconfirmed': '音声リソースの解放を確認できませんでした',
  'qa.activationObservationEnded': '音声有効化を観測できる時間を過ぎました',
  'qa.background': 'ブラウザがバックグラウンドへ移動しました',
  'qa.pageHidden': 'QA画面から移動しました',
  'trial.userAborted': '操作により試験を中止しました',
  'trial.userReleased': '操作により音声リソースを解放しました',
  'trial.manualStop': '操作により再生を停止しました',
  'trial.naturalComplete': '曲の自然終了を確認しました',
  'trial.anchorVerified': '音声有効化と初期アンカーを確認しました',
  'trial.restartVerified': '停止後に別の時計世代で再開しました',
  'trial.exportAndRerunVerified': '結果保存と再実行を確認しました',
};

function describeReason(reason: string): string {
  return reason.split('; ').map(code => stopReasons[code] ? `${stopReasons[code]} (${code})` : code).join('／');
}

let displayedTrialId: string | null = null;
let knownSampleCount = 0;
let validCount = 0;
let excessCount = 0;
let currentDifference: number | null = null;
let maxDifference: number | null = null;
let lastPlotAt = -Infinity;
let lastRenderedHistory = '';
let lastSummary = '';
let exporting = false;
let manualFallbackTrialId: string | null = null;

function collectReadings(trial: Trial | null): void {
  const id = trial?.trialId ?? null;
  if (id !== displayedTrialId || (trial?.observations.length ?? 0) < knownSampleCount) {
    displayedTrialId = id;
    knownSampleCount = 0;
    validCount = 0;
    excessCount = 0;
    currentDifference = null;
    maxDifference = null;
    lastPlotAt = -Infinity;
  }
  if (!trial) return;

  for (const observation of trial.observations.slice(knownSampleCount)) {
    const difference = acceptedDifference(observation);
    currentDifference = difference;
    if (difference === null) continue;
    validCount++;
    if (observation.overLimit) excessCount++;
    maxDifference = Math.max(maxDifference ?? 0, difference);
  }
  knownSampleCount = trial.observations.length;
}

function acceptedDifference(sample: ClockObservation): number | null {
  const difference = sample.absoluteDifferenceMs;
  return sample.valid && difference !== null && Number.isFinite(difference) && difference >= 0 ? difference : null;
}

function plotClock(observations: readonly ClockObservation[], live: boolean): void {
  const visible = live ? observations.slice(-150) : observations;
  const start = visible.at(0)?.performanceNow ?? 0;
  const end = visible.at(-1)?.performanceNow ?? start;
  const range = Math.max(end - start, 1);
  const scale = Math.max(25, maxDifference ?? 0);
  const toY = (value: number) => 128 - value * 112 / scale;
  const limit = toY(20).toFixed(2);
  chart.limit.setAttribute('y1', limit);
  chart.limit.setAttribute('y2', limit);

  const segments: string[] = [];
  let lastGeneration: number | null = null;
  for (const sample of visible) {
    const difference = acceptedDifference(sample);
    if (difference === null) {
      lastGeneration = null;
      continue;
    }
    const x = 16 + (sample.performanceNow - start) * 408 / range;
    const point = `${x.toFixed(2)} ${toY(difference).toFixed(2)}`;
    if (lastGeneration !== sample.generation) {
      segments.push(`M ${point} l 0.01 0`);
    } else {
      segments.push(`L ${point}`);
    }
    lastGeneration = sample.generation;
  }

  chart.path.setAttribute('d', segments.join(' '));
  const description = validCount > 0
    ? `全有効 ${validCount} 件 · 全試行内最大 ${milliseconds(maxDifference)} · 表示区間 ${seconds((end - start) / 1_000)}`
    : '有効観測なし';
  setText(chart.label, description);
  chart.plot.setAttribute('aria-label', `同期差の時系列グラフ・${description}`);
}

function historyRow(trial: Trial): HTMLElement {
  const observed = summarize([trial], trial.testCaseId);
  const row = document.createElement('li');
  row.dataset.result = trial.status;
  row.dataset.trialId = trial.trialId;
  const title = document.createElement('strong');
  title.textContent = `${trial.testCaseId} · ${trial.status} · ${trial.fixtureId === 'load-84' ? '84秒' : '24秒'}`;
  const timing = document.createElement('p');
  const generationTimes = trial.preparations.map(item => seconds(item.generationMs / 1_000));
  timing.textContent = `生成 ${generationTimes.join('／') || '—'} · 最大同期差 ${milliseconds(observed.syncDifferenceMs.max)} · 超過 ${observed.overLimitCount} 件`;
  const lifecycle = document.createElement('p');
  lifecycle.textContent = `有効化 ${activationLabels[trial.activation]} · アンカー ${activationLabels[trial.anchor]} · 完走 ${trial.naturalCompletion ? '確認' : '未確認'} · 停止再開 ${trial.restarted ? '確認' : '未確認'} · 解放 ${trial.released ? '確認' : '未確認'}`;
  row.append(title, timing, lifecycle);
  if (trial.reason) {
    const reason = document.createElement('p');
    reason.textContent = `停止・判定理由 ${describeReason(trial.reason)}`;
    row.append(reason);
  }
  return row;
}

function updateHistory(state: HarnessState): void {
  const id = state.trials.at(-1)?.trialId ?? '';
  const historyKey = `${state.trials.length}/${id}`;
  const summaryKey = `${historyKey}/${state.selectedTestCase}`;
  if (lastRenderedHistory !== historyKey) {
    lastRenderedHistory = historyKey;
    results.list.replaceChildren(...[...state.trials].reverse().map(historyRow));
  }
  if (lastSummary !== summaryKey) {
    lastSummary = summaryKey;
    const summary = summarize(state.trials, state.selectedTestCase);
    setText(results.summary, state.trials.length === 0
      ? '保存済みの試行はまだありません。'
      : `選択ケース ${summary.executedTrials}/${summary.plannedTrials} 実行 · PASS ${summary.successfulTrials} · FAIL ${summary.failedTrials} · BLOCKED ${summary.blockedTrials} · 中止 ${summary.abortedTrials} · 未実施 ${summary.unexecutedTrials}`);
  }
  const selected = TEST_CASES.find(item => item.id === state.selectedTestCase);
  const completed = state.trials.filter(trial => trial.testCaseId === state.selectedTestCase).length;
  const inProgress = state.current && state.phase !== 'finished' ? 1 : 0;
  setText(readout.progress, selected ? `${completed + inProgress} / ${selected.planned} 試行` : '—');
}

function updateControls(state: HarnessState): void {
  const phase = state.phase;
  const mutable = phase === 'idle' && !exporting;
  for (const control of Object.values(options)) control.disabled = !mutable;
  options.testCase.value = state.selectedTestCase;
  options.fixture.value = state.selectedFixture;
  options.diagnostics.checked = state.diagnosticsEnabled;

  buttons.prepare.disabled = exporting || (phase !== 'idle' && phase !== 'rerun-ready');
  buttons.enable.disabled = phase !== 'prepared';
  buttons.play.disabled = phase !== 'enabled';
  buttons.stop.disabled = phase !== 'playing';
  buttons.resume.disabled = phase !== 'stopped';
  buttons.release.disabled = phase === 'idle' || phase === 'finished' || phase === 'releasing';
  buttons.next.disabled = phase !== 'finished' || exporting || state.current?.released === false;
  buttons.abort.disabled = phase === 'idle' || phase === 'finished' || phase === 'releasing';

  const canExport = (phase === 'idle' || phase === 'finished' || phase === 'awaiting-export')
    && Boolean(state.trials.length || state.current);
  buttons.save.disabled = exporting || !canExport;
  buttons.copy.disabled = exporting || !canExport;
  buttons.confirm.hidden = !state.downloadPending;
  buttons.confirm.disabled = exporting || phase !== 'awaiting-export';
  const canConfirmManual = phase === 'awaiting-export' && manualFallbackTrialId !== null
    && state.current?.trialId === manualFallbackTrialId;
  buttons.confirmManual.hidden = !canConfirmManual;
  buttons.confirmManual.disabled = exporting || !canConfirmManual;

  const showSafetyDock = phase === 'playing' || phase === 'stopped' || phase === 'enabling' || phase === 'preparing';
  const active = String(showSafetyDock);
  if (safetyActions.dataset.active !== active) safetyActions.dataset.active = active;
  document.body.classList.toggle('safety-dock-active', showSafetyDock);
}

function render(state: HarnessState): void {
  collectReadings(state.current);
  setText(readout.harnessVersion, state.metadata.qaHarnessVersion);
  setText(readout.harnessCommit, state.metadata.qaHarnessCommit);
  setText(readout.productCommit, state.metadata.productImplementationCommit);
  setText(readout.baselineCommit, state.metadata.baselineCommit);
  setText(readout.fixtureId, state.selectedFixture);
  const device = state.device;
  const declaredBrowser = [device.browser, device.browserVersion].filter(Boolean).join(' ');
  setText(readout.runtime, [device.environmentId, device.os, declaredBrowser].filter(Boolean).join(' · ') || 'UNAVAILABLE');
  setText(readout.phase, phaseNames[state.phase]);
  const phase = state.phase === 'finished' ? state.current?.status.toLowerCase() ?? state.phase : state.phase;
  if (readout.phase.dataset.phase !== state.phase) readout.phase.dataset.phase = state.phase;
  if (readout.phase.dataset.outcome !== phase) readout.phase.dataset.outcome = phase;
  setText(readout.current, milliseconds(currentDifference));
  setText(readout.maximum, milliseconds(maxDifference));
  const preparation = state.current?.preparations.at(-1);
  setText(readout.renderTime, seconds(preparation ? preparation.generationMs / 1_000 : null));
  setText(readout.elapsedTime, seconds(state.elapsedSec));
  setText(readout.context, state.contextState ? audioStateLabels[state.contextState] ?? state.contextState : 'UNAVAILABLE');
  setText(readout.anchor, state.current ? activationLabels[state.current.anchor] : '未取得');
  setText(readout.generation, state.generation === null ? '—' : String(state.generation));
  setText(readout.valid, String(validCount));
  setText(readout.overLimit, String(excessCount));

  const selected = TEST_CASES.find(item => item.id === state.selectedTestCase);
  setText(readout.hint, selected ? caseHints[selected.mode] : '');
  const outcome = state.current?.status;
  const warning = outcome === 'FAIL' || outcome === 'BLOCKED' || outcome === 'ABORTED';
  const reason = state.current?.reason;
  const nextInstruction = state.current?.released === false
    ? '音声リソースの解放を確認できません。結果を保存してからページを再読み込みしてください。'
    : outcome ?? '';
  setText(readout.note, state.phase === 'finished' ? nextInstruction : state.note);
  readout.reason.hidden = !warning;
  setText(readout.reason, warning && reason ? describeReason(reason) : '');

  const wasHidden = chart.figure.hidden;
  chart.figure.hidden = !state.diagnosticsEnabled;
  if (state.diagnosticsEnabled) {
    const now = performance.now();
    if (wasHidden || now - lastPlotAt >= 250 || state.phase !== 'playing') {
      plotClock(state.current?.observations ?? [], state.phase === 'playing');
      lastPlotAt = now;
    }
  }
  updateHistory(state);
  updateControls(state);
}

function reportViewport(): void {
  setText(readout.viewport, `${window.innerWidth} × ${window.innerHeight} CSS px`);
}

function declaredVersion(input: HTMLInputElement): string {
  const value = input.value.trim();
  // Limit collection to numeric version identifiers and Windows feature-update suffixes.
  const valid = value === '' || /^(?:\d{1,4}(?:\.\d{1,5}){0,4}(?: ?\d{2}H[12])?|\d{2}H[12])$/.test(value);
  input.setCustomValidity(valid ? '' : 'バージョン番号のみ入力してください');
  input.setAttribute('aria-invalid', String(!valid));
  return valid ? value : '';
}

function recordDevice(): void {
  const osVersion = declaredVersion(options.osVersion);
  const browserVersion = declaredVersion(options.browserVersion);
  const device: DeviceInput = {
    environmentId: options.environment.value,
    deviceType: options.deviceType.value,
    os: [options.os.value, osVersion].filter(Boolean).join(' '),
    browser: options.browser.value,
    browserVersion,
    audioOutputType: options.output.value,
    powerState: options.powerMode.value,
  };
  controller.setDevice(device);
}

function currentJson(): string {
  const state = controller.getState();
  const trials = [...state.trials];
  if (state.current && !trials.some(trial => trial.trialId === state.current?.trialId)) trials.push(state.current);
  return exportJson(makeEvidence(trials));
}

function hideFallback(): void {
  manualFallbackTrialId = null;
  results.fallback.hidden = true;
}

function fallback(reason: string, json: string): void {
  setText(results.exportStatus, json ? `${reason} 下のJSONを手動で保存・コピーできます。` : reason);
  results.output.value = json;
  results.fallback.hidden = !json;
  const state = controller.getState();
  manualFallbackTrialId = json && state.phase === 'awaiting-export' ? state.current?.trialId ?? null : null;
  updateControls(state);
}

function failedExport(method: 'download' | 'clipboard', error: string, json: string): void {
  controller.recordExport(method, 'failed', error);
  fallback(error, json);
}

function saveResult(): void {
  if (buttons.save.disabled) return;
  let json: string;
  try {
    json = currentJson();
  } catch {
    failedExport('download', 'JSONを生成できませんでした。', '');
    return;
  }

  const result = downloadJson(json);
  if (result.status === 'failed') {
    failedExport('download', result.reason ?? 'JSONの保存を開始できませんでした。', json);
    return;
  }
  hideFallback();
  controller.recordExport('download', result.status, result.reason);
  setText(results.exportStatus, 'JSONの保存を要求しました。端末の保存先をご確認ください。');
}

async function copyResult(): Promise<void> {
  if (buttons.copy.disabled) return;
  let json: string;
  try {
    json = currentJson();
  } catch {
    failedExport('clipboard', 'JSONを生成できませんでした。', '');
    return;
  }

  exporting = true;
  updateControls(controller.getState());
  try {
    const result = await copyJson(json);
    if (result.status === 'failed') {
      failedExport('clipboard', result.reason ?? 'クリップボードに書き込めませんでした。', json);
      return;
    }
    hideFallback();
    controller.recordExport('clipboard', result.status, result.reason);
    setText(results.exportStatus, 'JSONをクリップボードにコピーしました。');
  } catch {
    failedExport('clipboard', 'クリップボードに書き込めませんでした。', json);
  } finally {
    exporting = false;
    updateControls(controller.getState());
  }
}

options.testCase.addEventListener('change', () => controller.setTestCase(options.testCase.value as TestCaseId));
options.fixture.addEventListener('change', () => controller.setFixture(options.fixture.value as FixtureId));
options.diagnostics.addEventListener('change', () => controller.setDiagnostics(options.diagnostics.checked));
for (const control of [options.environment, options.deviceType, options.os, options.browser, options.output, options.powerMode]) {
  control.addEventListener('change', recordDevice);
}
for (const control of [options.osVersion, options.browserVersion]) {
  control.addEventListener('input', recordDevice);
}
buttons.prepare.addEventListener('click', () => { void controller.prepare(); });
buttons.enable.addEventListener('click', (event) => { void controller.enable(event.isTrusted); });
buttons.play.addEventListener('click', (event) => { void controller.start(event.isTrusted); });
buttons.stop.addEventListener('click', () => { void controller.stop(); });
buttons.resume.addEventListener('click', (event) => { void controller.resume(event.isTrusted); });
buttons.release.addEventListener('click', () => { void controller.release(); });
buttons.next.addEventListener('click', () => { void controller.nextTrial(); });
buttons.abort.addEventListener('click', () => { void controller.abort(); });
buttons.save.addEventListener('click', saveResult);
buttons.copy.addEventListener('click', () => { void copyResult(); });
buttons.confirm.addEventListener('click', () => {
  controller.confirmDownload();
  setText(results.exportStatus, '結果保存を確認しました。冷生成から次の実行を開始できます。');
});
buttons.confirmManual.addEventListener('click', (event) => {
  if (!event.isTrusted || buttons.confirmManual.disabled) return;
  controller.confirmManualCopy();
  hideFallback();
  setText(results.exportStatus, '手動での取得を確認しました。冷生成から次の実行を開始できます。');
});
window.addEventListener('resize', reportViewport);
window.addEventListener('orientationchange', reportViewport);
reportViewport();
controller.subscribe(render);
