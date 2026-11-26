import type { AudioEvent, Ms, PlaybackAnchor, PreparedTrack, Sec, Token, Us } from '../../../src/contracts/interface_contracts';
import { clockSampleIntervalMs, createFixedAudioClock } from '../../../src/domain/audio-clock';
import { buildMetadata, type BuildMetadata } from './build-metadata';
import { hasExpectedPcm, TEST_CASES, type ClockObservation, type DeviceInput, type FixtureId, type Outcome, type TestCaseId, type Trial, type Viewport } from './model';
import { createMeasuredProduct, prepareProduct } from './product';

type Phase = 'idle' | 'preparing' | 'prepared' | 'enabling' | 'enabled' | 'playing' | 'stopped'
  | 'releasing' | 'awaiting-export' | 'rerun-ready' | 'finished';
type Product = ReturnType<typeof createMeasuredProduct>;
type Clock = Extract<ReturnType<typeof createFixedAudioClock>, { ok: true }>['value'];

interface Playback {
  token: Token;
  anchor: PlaybackAnchor;
  clock: Clock;
  lastObservationMs: number | null;
  validSamples: number;
}

export interface HarnessState {
  phase: Phase;
  selectedTestCase: TestCaseId;
  selectedFixture: FixtureId;
  device: DeviceInput;
  diagnosticsEnabled: boolean;
  current: Trial | null;
  trials: readonly Trial[];
  contextState: string | null;
  elapsedSec: number | null;
  generation: number | null;
  note: string;
  downloadPending: boolean;
  metadata: BuildMetadata;
}

const activationObservationLimitMs = 1800;
const anchorObservationLimitMs = 1800;
const releaseObservationLimitMs = 3000;
const restartSamples = 10;
const nativeRenderQuantumFrames = 128;

function viewport(): Viewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    orientation: screen.orientation?.type ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'),
  };
}

function browserBudget<T>(operation: Promise<T>, ms: number): Promise<T | null> {
  let timeout: number | undefined;
  const limit = new Promise<null>((resolve) => { timeout = window.setTimeout(() => resolve(null), ms); });
  return Promise.race([operation, limit]).finally(() => window.clearTimeout(timeout));
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function trialId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createHarnessController() {
  const runId = trialId();
  const listeners = new Set<(state: HarnessState) => void>();
  const completed: Trial[] = [];
  let phase: Phase = 'idle';
  let selectedTestCase: TestCaseId = 'DEV-AUD-01';
  let selectedFixture: FixtureId = 'rotation-24';
  let device: DeviceInput = {
    environmentId: '', deviceType: '', os: '', browser: '', browserVersion: '', audioOutputType: '', powerState: '',
  };
  let diagnosticsEnabled = true;
  let current: Trial | null = null;
  let product: Product | null = null;
  let track: PreparedTrack | null = null;
  let unsubscribeProduct: (() => void) | null = null;
  let rendering: Promise<Awaited<ReturnType<typeof prepareProduct>>> | null = null;
  let playback: Playback | null = null;
  let monitorId: number | undefined;
  let note = '試験を選択して音源を準備してください。';
  let contextState: string | null = null;
  let elapsedSec: number | null = null;
  let generation = 0;
  let lastPaintMs = 0;
  let releaseUnconfirmed = false;
  let positionUs = 0 as Us;
  let exportVerified = false;
  let downloadPending = false;
  let manualFallbackPending = false;
  let lastViewport = viewport();

  const testCase = () => TEST_CASES.find((entry) => entry.id === selectedTestCase)!;
  const getState = (): HarnessState => ({
    phase, selectedTestCase, selectedFixture, device, diagnosticsEnabled, current,
    trials: [...completed], contextState: product?.state() ?? contextState,
    elapsedSec, generation: playback?.anchor.generation ?? (current?.anchors.at(-1)?.generation ?? null),
    note, downloadPending, metadata: buildMetadata,
  });
  function publish(nextNote?: string) {
    if (nextNote !== undefined) note = nextNote;
    const state = getState();
    for (const listener of listeners) listener(state);
  }
  function event(kind: string, detail?: string) {
    current?.events.push({ atMs: performance.now(), kind, ...(detail === undefined ? {} : { detail }) });
  }
  function createTrial(): Trial {
    return {
      schemaVersion: 1, qaHarnessVersion: buildMetadata.qaHarnessVersion,
      qaHarnessCommit: buildMetadata.qaHarnessCommit,
      productImplementationCommit: buildMetadata.productImplementationCommit,
      baselineCommit: buildMetadata.baselineCommit,
      fixtureId: selectedFixture, fixtureHash: buildMetadata.fixtureHashes[selectedFixture],
      runId, trialId: trialId(), testCaseId: selectedTestCase, testProfile: testCase().profile,
      recordedAt: new Date().toISOString(),
      deviceType: device.deviceType || null, os: device.os || null, browser: device.browser || null,
      browserVersion: device.browserVersion || null, audioOutputType: device.audioOutputType || null,
      viewport: viewport(),
      testConditions: {
        source: 'browser-qa', physicalDeviceVerified: false, diagnosticsEnabled,
        environmentId: device.environmentId || null, powerState: device.powerState || null,
        deviceFieldsSource: 'user', viewportSource: 'browser', visibilityAtStart: document.visibilityState,
        activationObservationLimitMs,
      },
      status: 'NOT RUN', activation: 'NOT RUN', anchor: 'NOT RUN', naturalCompletion: false,
      restarted: false, released: null, reason: null, anchors: [], observations: [], preparations: [], events: [],
    };
  }

  function cancelMonitor() {
    window.clearTimeout(monitorId);
    monitorId = undefined;
  }
  function stopPlayback() {
    cancelMonitor();
    const owner = playback;
    playback = null;
    if (owner) product?.audio.stop(owner.token);
  }

  async function settle(status: Outcome, reason: string, after: 'finished' | 'awaiting-export' = 'finished') {
    const trial = current;
    if (!trial || phase === 'releasing' || phase === 'finished') return;
    phase = 'releasing';
    event('finish', reason);
    const owned = product;
    let closed = true;
    try {
      stopPlayback();
    } catch {
      event('stop-error', 'audio.stopFailed');
      closed = false;
    }
    unsubscribeProduct?.();
    unsubscribeProduct = null;
    publish('音声リソースを解放しています。');
    if (owned) {
      try {
        const result = await browserBudget(owned.audio.dispose().then(() => true), releaseObservationLimitMs);
        closed &&= result === true;
      } catch {
        closed = false;
      }
    }
    // Pending offline synthesis must return before another context may render.
    if (rendering) {
      const settled = await browserBudget(rendering.then(() => true, () => true), releaseObservationLimitMs);
      closed &&= settled === true;
      event(settled ? 'aborted-render-settled' : 'aborted-render-not-confirmed');
    }
    const usage = owned?.audio.diagnostics();
    closed &&= !usage || (usage.cached === 0 && usage.rendering === 0 && usage.sources === 0 && usage.voices === 0);
    const finalState = owned?.state();
    closed &&= finalState === undefined || finalState === null || finalState === 'closed';
    contextState = finalState ?? contextState;
    product = null;
    track = null;
    trial.released = closed;
    releaseUnconfirmed ||= !closed;
    if (!closed) {
      event('release-unconfirmed', 'audio.releaseUnconfirmed');
      if (status === 'PASS' || after === 'awaiting-export') status = 'BLOCKED';
      after = 'finished';
    }
    trial.status = status;
    trial.reason = closed ? reason : `${reason} / audio.releaseUnconfirmed`;
    phase = after;
    if (after === 'finished') completed.push(trial);
    publish(after === 'awaiting-export'
      ? '結果を保存またはコピーしてから、同じ試行を再実行してください。'
      : closed ? `${status} · ${trial.reason}` : `${status} · 音声解放を確認できません。結果を保存してからページを再読み込みしてください。`);
  }

  function onProductEvent(notification: AudioEvent, owner: Product) {
    const active = playback;
    if (!active || product !== owner || notification.sessionId !== active.token.sessionId
      || notification.generation !== active.token.generation || !('playbackId' in notification)
      || notification.playbackId !== active.anchor.playbackId) return;
    if (notification.kind === 'INTERRUPTED') {
      void settle('FAIL', 'audio.interrupted');
    } else if (notification.kind === 'ENDED' && notification.clockGeneration === active.anchor.generation) {
      cancelMonitor();
      playback = null;
      if (!current || !track) return;
      const endAudioSec = owner.audio.currentTime() ?? null;
      const expectedFrames = Math.round((track.durationUs - active.anchor.startSongUs) * track.sampleRate / 1_000_000);
      const playedFrames = endAudioSec === null || !Number.isFinite(endAudioSec)
        ? null : Math.round((endAudioSec - active.anchor.startAudioSec) * track.sampleRate);
      const frameDelta = playedFrames === null ? null : playedFrames - expectedFrames;
      event('native-ended', JSON.stringify({ endAudioSec, playedFrames, expectedFrames, frameDelta, nativeRenderQuantumFrames }));
      // Web Audio exposes currentTime at render-quantum resolution. This only validates the end event.
      const natural = testCase().mode === 'natural' && active.validSamples > 0
        && frameDelta !== null && frameDelta >= -nativeRenderQuantumFrames;
      current.naturalCompletion = natural;
      void settle(natural ? 'PASS' : 'FAIL', natural ? 'trial.naturalComplete' : 'trial.unexpectedEnd');
    }
  }

  async function prepare() {
    if ((phase !== 'idle' && phase !== 'rerun-ready') || releaseUnconfirmed) return;
    if (document.visibilityState !== 'visible') { publish('前景で試行してください。'); return; }
    if (phase === 'idle') {
      current = createTrial();
      exportVerified = false;
      downloadPending = false;
      manualFallbackPending = false;
    }
    const trial = current!;
    phase = 'preparing';
    elapsedSec = null;
    positionUs = 0 as Us;
    contextState = null;
    trial.released = null;
    trial.anchor = 'NOT RUN';
    trial.activation = 'NOT RUN';
    const owned = createMeasuredProduct();
    product = owned;
    unsubscribeProduct = owned.audio.subscribeAudioEvents((notification) => onProductEvent(notification, owned));
    event('cold-render-start');
    publish('冷音源を生成しています。');
    try {
      rendering = prepareProduct(owned, selectedFixture, { sessionId: trial.trialId, requestId: 'prepare', generation });
      const prepared = await rendering;
      if (product !== owned || phase !== 'preparing') return;
      if (prepared.preparation) trial.preparations.push(prepared.preparation);
      if (!prepared.result.ok) {
        void settle('BLOCKED', prepared.result.error.messageKey);
      } else if (!prepared.preparation || !hasExpectedPcm(prepared.preparation, selectedFixture)) {
        void settle('FAIL', 'audio.pcmEvidenceInvalid');
      } else {
        track = prepared.result.value;
        phase = 'prepared';
        event('cold-render-done');
        publish('音声を有効化してください。');
      }
    } catch {
      if (product === owned && phase === 'preparing') void settle('BLOCKED', 'audio.offlineContextUnavailable');
    } finally {
      rendering = null;
    }
  }

  async function enable(trusted: boolean) {
    if (phase !== 'prepared' || !product || !current || !trusted) return;
    const owned = product;
    const trial = current;
    phase = 'enabling';
    trial.activation = 'PENDING';
    event('trusted-enable');
    const operation = owned.audio.enable();
    publish('音声有効化の結果を確認しています。');
    const enabled = await browserBudget(operation, activationObservationLimitMs);
    if (product !== owned || phase !== 'enabling') return;
    if (!enabled?.ok) {
      trial.activation = enabled ? 'FAIL' : 'PENDING';
      void settle('BLOCKED', enabled ? enabled.error.messageKey : 'qa.activationObservationEnded');
      return;
    }
    trial.activation = 'SUCCESS';
    phase = 'enabled';
    publish('音声を有効化しました。再生を開始してください。');
  }

  function monitor(active: Playback, owned: Product) {
    monitorId = window.setTimeout(() => {
      monitorId = undefined;
      const trial = current;
      if (playback !== active || product !== owned || phase !== 'playing' || !trial) return;

      owned.beginRead();
      const sample = owned.audio.outputTimestamp();
      const observation = active.clock.observe(sample);
      const raw = owned.read();
      const overLimit = !observation.ok && observation.error.messageKey === 'clock.outOfSync';
      const valid = observation.ok || overLimit;
      const residual = sample
        ? (sample.contextTime - active.anchor.anchorAudioSec) * 1000
          - (sample.performanceTime - active.anchor.anchorPerformanceMs)
        : null;
      const reason = observation.ok ? null : observation.error.messageKey;
      if (reason) {
        // Apply the product clock's decision before UI updates or statistics.
        try { stopPlayback(); } catch { event('stop-error', 'audio.stopFailed'); }
      }
      const point: ClockObservation = {
        generation: active.anchor.generation,
        a0: active.anchor.anchorAudioSec,
        p0: active.anchor.anchorPerformanceMs,
        ...raw,
        intervalMs: active.lastObservationMs === null ? null : raw.performanceNow - active.lastObservationMs,
        signedResidualMs: residual !== null && Number.isFinite(residual) ? residual : null,
        absoluteDifferenceMs: residual !== null && Number.isFinite(residual) ? Math.abs(residual) : null,
        valid, overLimit, reason, safetyStopReason: reason,
      };
      trial.observations.push(point);
      active.lastObservationMs = raw.performanceNow;
      if (!observation.ok) { void settle('FAIL', observation.error.messageKey); return; }

      active.validSamples++;
      const converted = active.clock.convertEventTime(raw.performanceNow as Ms, active.anchor.generation);
      if (!converted.ok) { void settle('FAIL', converted.error.messageKey); return; }
      elapsedSec = Math.max(0, converted.value.songTimeUs / 1_000_000);
      positionUs = Math.max(0, converted.value.songTimeUs) as Us;
      const mode = testCase().mode;
      if (mode === 'anchor') { void settle('PASS', 'trial.anchorVerified'); return; }
      if (mode === 'export') {
        void settle(exportVerified ? 'PASS' : 'NOT RUN', exportVerified ? 'trial.exportAndRerunVerified' : 'trial.awaitingExport',
          exportVerified ? 'finished' : 'awaiting-export');
        return;
      }
      if (mode === 'restart' && trial.anchors.length >= 2 && active.validSamples >= restartSamples) {
        trial.restarted = true;
        void settle('PASS', 'trial.restartVerified');
        return;
      }
      monitor(active, owned);
      if (raw.performanceNow - lastPaintMs >= (diagnosticsEnabled ? 250 : 750)) {
        lastPaintMs = raw.performanceNow;
        publish();
      }
    }, clockSampleIntervalMs);
  }

  async function play(trusted: boolean, resuming: boolean) {
    if (phase !== (resuming ? 'stopped' : 'enabled') || !trusted || !product || !current || !track) return;
    const owned = product;
    const trial = current;
    const prepared = track;
    phase = 'enabling';
    event(resuming ? 'trusted-resume' : 'trusted-start');
    const resumed = resuming ? owned.audio.enable() : null;
    publish('初期アンカーを確認しています。');
    if (resumed) {
      const enabled = await browserBudget(resumed, activationObservationLimitMs);
      if (product !== owned || phase !== 'enabling') return;
      if (!enabled?.ok) { trial.anchor = 'FAIL'; void settle('BLOCKED', 'audio.resumeUnavailable'); return; }
    }

    const expires = performance.now() + anchorObservationLimitMs;
    let ready = false;
    while (product === owned && phase === 'enabling' && owned.hasNativeTimestamp()) {
      owned.beginRead();
      ready = !!owned.audio.outputTimestamp();
      event('anchor-readiness', JSON.stringify(owned.read()));
      if (ready) break;
      if (performance.now() >= expires) break;
      await wait(clockSampleIntervalMs);
    }
    if (product !== owned || phase !== 'enabling') return;
    const currentTime = owned.audio.currentTime();
    if (!ready || currentTime === undefined) {
      trial.anchor = 'FAIL';
      event('anchor-unavailable', JSON.stringify(owned.read()));
      void settle('BLOCKED', 'clock.noAnchor');
      return;
    }

    const token = { sessionId: trial.trialId, requestId: 'playback', generation: ++generation };
    const offset = Math.min(positionUs, prepared.durationUs - 1) as Us;
    owned.beginRead();
    let result;
    try {
      result = owned.audio.playAt(prepared, offset, (currentTime + 0.05) as Sec, token);
    } catch {
      trial.anchor = 'FAIL';
      void settle('FAIL', 'audio.playbackFailed');
      return;
    }
    if (!result.ok) {
      trial.anchor = 'FAIL';
      event('anchor-rejected', JSON.stringify(owned.read()));
      void settle(result.error.code === 'ERR-005' ? 'BLOCKED' : 'FAIL', result.error.messageKey);
      return;
    }
    const anchor = result.value;
    const clock = createFixedAudioClock(anchor, 0 as Us);
    if (!clock.ok) {
      trial.anchor = 'FAIL';
      owned.audio.stop(token);
      void settle('FAIL', clock.error.messageKey);
      return;
    }
    trial.anchor = 'SUCCESS';
    trial.anchors.push({
      generation: anchor.generation, a0: anchor.anchorAudioSec, p0: anchor.anchorPerformanceMs, ...owned.read(),
      startAudioSec: anchor.startAudioSec, startSongUs: anchor.startSongUs,
    });
    const active = { token, anchor, clock: clock.value, lastObservationMs: null, validSamples: 0 };
    playback = active;
    phase = 'playing';
    event('anchor-fixed', String(anchor.generation));
    monitor(active, owned);
    publish(resuming ? '新時計世代で再生しています。' : '再生中です。');
  }

  function stop() {
    if (phase !== 'playing' || !playback) return;
    if (testCase().mode !== 'restart') { void settle('ABORTED', 'trial.manualStop'); return; }
    if (!playback.validSamples) { publish('初回観測を待ってから停止してください。'); return; }
    if (current && current.anchors.length > 1) { void settle('ABORTED', 'trial.manualStop'); return; }
    const converted = playback.clock.convertEventTime(performance.now() as Ms, playback.anchor.generation);
    if (!converted.ok) { void settle('FAIL', converted.error.messageKey); return; }
    positionUs = Math.max(0, converted.value.songTimeUs) as Us;
    elapsedSec = positionUs / 1_000_000;
    try { stopPlayback(); } catch { void settle('FAIL', 'audio.stopFailed'); return; }
    phase = 'stopped';
    event('manual-stop');
    publish('停止しました。再開すると新しい時計世代を取得します。');
  }

  function nextTrial() {
    if (phase !== 'finished' || releaseUnconfirmed) return;
    current = null;
    contextState = null;
    elapsedSec = null;
    phase = 'idle';
    publish('次の試行を準備できます。');
  }

  function setTestCase(id: TestCaseId) {
    if (phase !== 'idle') return;
    const entry = TEST_CASES.find((item) => item.id === id);
    if (!entry) return;
    selectedTestCase = id;
    selectedFixture = entry.fixtureId;
    publish();
  }

  function setFixture(id: FixtureId) {
    if (phase !== 'idle' || selectedFixture === id) return;
    const target = TEST_CASES.find((item) => item.mode === 'natural' && item.fixtureId === id
      && item.profile === testCase().profile);
    if (target) setTestCase(target.id);
  }

  function confirmExport() {
    if (phase !== 'awaiting-export') return;
    downloadPending = false;
    manualFallbackPending = false;
    exportVerified = true;
    event('export-verified');
    phase = 'rerun-ready';
    publish('保存を確認しました。冷音源を再生成して試行を続けてください。');
  }
  function recordExport(method: 'download' | 'clipboard', status: 'requested' | 'confirmed' | 'failed', reason?: string | null) {
    event(`export-${method}-${status}`, reason ?? undefined);
    if (method === 'download' && status === 'requested' && phase === 'awaiting-export') downloadPending = true;
    if (status === 'failed' && phase === 'awaiting-export') manualFallbackPending = true;
    if (method === 'clipboard' && status === 'confirmed') confirmExport();
    publish();
  }

  function updateViewport() {
    const next = viewport();
    if (lastViewport.orientation !== next.orientation) {
      event('viewport-orientation', JSON.stringify(next));
    }
    lastViewport = next;
  }

  function abortWhenHidden() {
    if (document.visibilityState !== 'visible' && current && phase !== 'finished' && phase !== 'awaiting-export') {
      void settle('ABORTED', 'qa.background');
    }
  }
  document.addEventListener('visibilitychange', abortWhenHidden);
  window.addEventListener('resize', updateViewport);
  window.addEventListener('orientationchange', updateViewport);
  window.addEventListener('pagehide', () => {
    if (current && phase !== 'finished' && phase !== 'awaiting-export') void settle('ABORTED', 'qa.pageHidden');
  });

  return {
    subscribe(listener: (state: HarnessState) => void) {
      listeners.add(listener);
      listener(getState());
      return () => { listeners.delete(listener); };
    },
    getState, setTestCase, setFixture, prepare, enable, stop, nextTrial, recordExport,
    setDevice(value: DeviceInput) { if (phase === 'idle') { device = { ...value }; publish(); } },
    setDiagnostics(value: boolean) { if (phase === 'idle') { diagnosticsEnabled = value; publish(); } },
    start: (trusted: boolean) => play(trusted, false),
    resume: (trusted: boolean) => play(trusted, true),
    release: () => settle('ABORTED', 'trial.userReleased'),
    abort: () => settle('ABORTED', 'trial.userAborted'),
    confirmDownload() {
      if (!downloadPending) return;
      event('download-user-confirmed');
      confirmExport();
    },
    confirmManualCopy() {
      if (!manualFallbackPending || phase !== 'awaiting-export') return;
      event('export-manual-user-confirmed');
      confirmExport();
    },
  };
}
