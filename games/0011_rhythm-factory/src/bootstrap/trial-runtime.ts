import { createSessionController } from '../app/session-controller';
import { stageA2TrialChart } from '../content/stage-a2b-trial-chart';
import { stageA2TrialMusic } from '../content/stage-a2-trial';
import type {
  CommittedJudgementGroup, GameCommand, GameError, GameUiSnapshot, Ms, NormalizedInput, Result, Tick,
} from '../contracts/interface_contracts';
import type { SessionAudioPort, SessionClockFactory } from '../contracts/session-ports';
import type { TrialCommand, TrialJudgement, TrialRuntime, TrialScreen, TrialSnapshot } from '../contracts/trial-runtime';
import { clockSampleIntervalMs, createFixedAudioClock, tickToUs } from '../domain/audio-clock';
import { compileChart, createChartMusicContext } from '../domain/chart-compiler';
import { createSaveRules } from '../domain/save-data';
import { createSignal } from '../domain/signal';
import { attachKeyboardPointerInput } from '../infrastructure/keyboard-pointer-input';
import { createSessionAudioBridge } from '../infrastructure/session-audio-bridge';
import { attachSessionLifecycle } from '../infrastructure/session-lifecycle';
import { createStorageCoordinator } from '../infrastructure/storage-coordinator';
import { mountTrialCanvas } from '../infrastructure/trial-canvas';
import { createWebAudio } from '../infrastructure/web-audio';
import { createWriterLock } from '../infrastructure/writer-lock';

const logicTickMs = 10;
const noJudgements: readonly TrialJudgement[] = Object.freeze([]);
const noLanes = Object.freeze([]);
const pauseStates = ['COUNTDOWN', 'PREROLL', 'PLAYING', 'FINALIZING'];
const sessionCommands = [
  'PAUSE_GAME', 'RESUME_GAME', 'RETRY_GAME', 'ABORT_GAME', 'RETRY_SAVE', 'DISCARD_RESULT',
];

function storageOf(view: Window): Storage | undefined {
  try { return view.localStorage; } catch { return undefined; }
}

function snapshotEqual(first: TrialSnapshot, second: TrialSnapshot): boolean {
  return (Object.keys(first) as (keyof TrialSnapshot)[]).every(key => first[key] === second[key]);
}

export function createTrialRuntime(view: Window): TrialRuntime & { dispose(): void } {
  const document = view.document;
  const now = () => view.performance.now() as Ms;
  const diagnostic = new URLSearchParams(view.location.search).get('stage-a2d-diagnostics') === '1';
  const emit = (kind: string, detail: object) => {
    if (diagnostic) view.dispatchEvent(new CustomEvent(`stage-a2d:${kind}`, { detail: { atMs: now(), ...detail } }));
  };
  const identify = () => view.crypto.randomUUID?.()
    ?? Array.from(view.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const definition = stageA2TrialMusic;
  const compiled = compileChart(stageA2TrialChart, createChartMusicContext(definition), 'complete');
  if (!compiled.ok) throw new Error(compiled.error.messageKey);
  const chart = compiled.value;
  const rules = createSaveRules([chart]);
  let reportLost = () => {};
  let lost = false;
  const writer = createWriterLock({ locks: view.navigator.locks, ownerId: identify(), onLost: () => reportLost() });
  const storage = createStorageCoordinator({ storage: storageOf(view), lock: writer, rules, createEpoch: identify });
  const settings = () => storage.read().data?.settings ?? null;
  const writerStatus = () => writer.currentLease() ? 'OWNED' : !writer.available ? 'UNSUPPORTED' : lost ? 'LOST' : 'UNOWNED';

  const webAudio = createWebAudio(tickToUs);
  const inspectedClock: SessionClockFactory = (anchor, offset) => {
    const fixed = createFixedAudioClock(anchor, offset);
    if (!fixed.ok || !diagnostic) return fixed;
    return {
      ok: true, value: {
        convertEventTime: fixed.value.convertEventTime,
        observe(stamp) {
          const result = fixed.value.observe(stamp);
          const rawDifferenceUs = stamp
            ? Math.abs((stamp.contextTime - anchor.anchorAudioSec) - (stamp.performanceTime - anchor.anchorPerformanceMs) / 1000) * 1_000_000
            : null;
          const sample = { rawDifferenceUs, generation: anchor.generation };
          if (result.ok) emit('audio', { ...sample, differenceUs: result.value.differenceUs });
          else emit('audio', { ...sample, error: result.error.messageKey, errorCode: result.error.code });
          return result;
        },
      },
    };
  };
  const bridge = createSessionAudioBridge(tickToUs, inspectedClock, clockSampleIntervalMs, webAudio);
  const audio: SessionAudioPort = !diagnostic ? bridge : {
    ...bridge,
    async prepare(music, token) {
      const detail = { requestId: token.requestId, trackId: music.master.musicId };
      emit('prepare', { ...detail, phase: 'start' });
      const rendering = bridge.prepare(music, token);
      reportResources();
      const result = await rendering;
      emit('prepare', { ...detail, phase: result.ok ? 'end' : 'failure' });
      reportResources();
      return result;
    },
  };
  const controller = createSessionController({
    audio, storage, writer: { status: writerStatus, currentLease: writer.currentLease },
    initialDifficulty: chart.difficulty,
    getMusic: id => id === chart.musicId ? definition : null,
    getChart: (id, level) => id === chart.musicId && level === chart.difficulty ? chart : null,
    getTutorial: id => id === 'TUT-01' ? { definition, chart } : null,
    settingsValid: value => {
      const current = storage.read().data;
      return current !== null && rules.updateSettings(current, value).ok;
    },
    nextSessionId: identify,
    now, recordedAt: () => new Date().toISOString(),
  });

  const updates = createSignal<void>();
  let disposed = false;
  let suspended = false;
  let actionVersion = 0;
  let pageVersion = 0;
  let localError: GameError | null = null;
  let baseUi: GameUiSnapshot | null = null;
  let previousLocalError: GameError | null = null;
  let shownUi = controller.store.getSnapshot();
  let lastGroup: CommittedJudgementGroup | null = null;
  let judgements = noJudgements;
  let lastBeat = -1;
  let calibrationGeneration: number | null = null;
  let previousResources = '';
  let activeRafLoops = 0;

  function reportResources() {
    if (!diagnostic) return;
    const meters = webAudio.diagnostics();
    const summary = { cacheTracks: meters.cached, activeRenders: meters.rendering, activeSources: meters.sources,
      voices: meters.voices, activeRafLoops };
    const serial = JSON.stringify(summary);
    if (serial === previousResources) return;
    previousResources = serial;
    emit('resources', summary);
  }

  function readSnapshot(): TrialSnapshot {
    const activity = controller.read();
    const save = storage.read();
    const source = controller.store.getSnapshot();
    if (source !== baseUi || localError !== previousLocalError) {
      baseUi = source;
      previousLocalError = localError;
      shownUi = localError ? Object.freeze({ ...source, error: localError }) : source;
    }
    const session = activity.session;
    const official = session?.judgement.official ?? [];
    let group: CommittedJudgementGroup | null = null;
    for (let i = official.length - 1; i >= 0; i--) {
      const change = official[i];
      if (change?.kind === 'GROUP') { group = change.group; break; }
    }
    if (lastGroup !== group) {
      lastGroup = group;
      judgements = group ? Object.freeze(group.results.map(result => Object.freeze({
        id: result.eventId,
        label: result.judgement,
        timing: result.errorUs === null || result.errorUs === 0 ? null : result.errorUs < 0 ? 'FAST' : 'SLOW',
      } as const))) : noJudgements;
    }
    const deadline = session?.countdownEndsAtMs ?? session?.resumeReadyAtMs ?? null;
    return Object.freeze({
      screen: activity.screen, ui: shownUi, prepared: activity.prepared, preview: activity.preview,
      writer: writerStatus(), pending: save.pending !== null || save.preparingResult !== null,
      settings: save.data?.settings ?? null, mode: session?.mode ?? null,
      result: controller.getFinalResult(), calibration: activity.calibration,
      calibrationBeat: activity.screen === 'CALIBRATION' && lastBeat >= 0 ? lastBeat : null, generation: session?.generation ?? null,
      progress: Math.round(Math.max(0, Math.min(1, (session?.songTimeUs ?? 0) / chart.durationUs)) * 100) / 100,
      countdownSeconds: deadline === null ? null : Math.max(0, Math.ceil((deadline - now()) / 1000)),
      reheldLanes: stableLanes(session?.reheldLanes ?? noLanes), judgements, save: save.data,
    });
  }

  let reheldLanes: TrialSnapshot['reheldLanes'] = noLanes;
  function stableLanes(next: TrialSnapshot['reheldLanes']) {
    if (next.length !== reheldLanes.length || next.some((lane, index) => lane !== reheldLanes[index])) reheldLanes = next;
    return reheldLanes;
  }

  let snapshot = readSnapshot();
  function publish() {
    if (disposed) return;
    const next = readSnapshot();
    if (snapshotEqual(snapshot, next)) return;
    snapshot = next;
    updates.publish();
  }

  function calibrationTick(at: Ms) {
    if (snapshot.screen !== 'CALIBRATION' || snapshot.calibration) {
      calibrationGeneration = null;
      lastBeat = -1;
      return;
    }
    const context = controller.contextAt(at);
    if (!context || !context.sessionId.startsWith('calibration-')) return;
    const time = context.clock.convertEventTime(at, context.clockGeneration);
    if (!time.ok || time.value.songTimeUs < 0) return;
    if (calibrationGeneration !== context.clockGeneration) {
      calibrationGeneration = context.clockGeneration;
      lastBeat = -1;
    }
    const beat = Math.floor(time.value.songTimeUs / tickToUs(480 as Tick, 100));
    if (beat < 16 && beat !== lastBeat) {
      lastBeat = beat;
      webAudio.playTick();
    }
  }

  function tick() {
    const at = now();
    controller.advance(at);
    publish();
    calibrationTick(at);
    if (diagnostic && ['PREROLL', 'PLAYING', 'FINALIZING'].includes(snapshot.ui.state)) {
      const clock = controller.read().session;
      if (clock) emit('clock', { atMs: at, judgeTimeUs: clock.judgeTimeUs, songTimeUs: clock.songTimeUs,
        state: clock.state, generation: clock.generation });
    }
    reportResources();
  }

  let timer: number | undefined;
  function startTimer() {
    if (timer !== undefined || disposed || suspended) return;
    timer = view.setInterval(tick, logicTickMs);
  }

  function stopTimer() {
    if (timer === undefined) return;
    view.clearInterval(timer);
    timer = undefined;
  }

  function sessionId(command: TrialCommand) {
    const state = snapshot.screen;
    const sessionBound = sessionCommands.includes(command.kind)
      || (command.kind === 'START_GAME' && state === 'GAME')
      || (command.kind === 'SKIP_TUTORIAL' && ['GAME', 'PAUSE', 'RESULT'].includes(state));
    return sessionBound ? snapshot.ui.sessionId : null;
  }

  async function dispatch(command: TrialCommand) {
    const version = ++actionVersion;
    localError = null;
    const request = { ...command, requestId: identify(), sessionId: sessionId(command) } as GameCommand;
    const outcome = await controller.dispatch(request, true);
    if (!outcome.ok && version === actionVersion) localError = Object.freeze({ ...outcome.error });
    publish();
    return outcome;
  }

  interface ViewMount { activate(): void; deactivate(): void }
  const mounts = new Set<ViewMount>();

  function bind(factory: () => () => void): () => void {
    let detached: (() => void) | undefined;
    const mount = {
      activate() { if (!detached) detached = factory(); },
      deactivate() { detached?.(); detached = undefined; },
    };
    mounts.add(mount);
    if (!disposed && !suspended) mount.activate();
    return () => { mounts.delete(mount); mount.deactivate(); };
  }

  function suspend() {
    suspended = true;
    stopTimer();
    for (const mount of mounts) mount.deactivate();
  }

  function resume() {
    if (disposed) return;
    suspended = false;
    for (const mount of mounts) mount.activate();
    startTimer();
  }

  const unsubscribeStore = controller.store.subscribe(publish);
  const detachLifecycle = attachSessionLifecycle({
    window: view, document, now,
    onEvent(event) {
      if (event.kind === 'PAGEHIDE' || event.kind === 'PAGESHOW') pageVersion++;
      const version = pageVersion;
      if (event.kind === 'PAGEHIDE') suspend();
      void controller.handleLifecycleEvent(event).then(() => {
        if (event.kind === 'PAGESHOW' && version === pageVersion) resume();
        publish();
      });
    },
  });
  reportLost = () => {
    lost = true;
    void controller.handleLifecycleEvent({ kind: 'LOCK_LOST', atPerformanceMs: now(), sessionId: null, generation: null }).then(publish);
  };
  void controller.handleLifecycleEvent({ kind: 'PAGESHOW', atPerformanceMs: now(), sessionId: null, generation: null }).then(publish);
  startTimer();

  function accept(input: NormalizedInput) {
    emit('input', {
      eventPerformanceMs: input.eventPerformanceMs, receivedPerformanceMs: input.receivedPerformanceMs,
      action: input.action, lane: input.lane, judgeTimeUs: input.judgeTimeUs,
    });
    const queued = controller.enqueueInput(input);
    if (queued.ok && queued.value.accepted && input.action === 'DOWN' && input.inputId.startsWith('pointer:')
        && snapshot.settings?.vibrationEnabled) view.navigator.vibrate?.(10);
  }

  function inputContext(at: Ms, calibration: boolean) {
    if (calibration ? snapshot.screen !== 'CALIBRATION' : snapshot.screen !== 'GAME' && snapshot.screen !== 'PAUSE') return null;
    return controller.contextAt(at);
  }

  return {
    subscribe: updates.subscribe,
    getSnapshot: () => snapshot,
    dispatch,
    navigate(screen: TrialScreen) {
      actionVersion++;
      localError = null;
      const changed = controller.navigate(screen);
      publish();
      return changed;
    },
    prepareTutorial() { controller.prepareTutorial('TUT-01'); publish(); },
    async prepareAudio() {
      const version = ++actionVersion;
      localError = null;
      const result: Result<void> = await controller.enableAudio();
      if (!result.ok && version === actionVersion) localError = Object.freeze({ ...result.error });
      publish();
      return result;
    },
    mountPlayfield(canvas, buttons, onPhysical) {
      return bind(() => {
        let painted = false;
        const frame = diagnostic ? (atMs: number) => {
          if (!painted) { painted = true; activeRafLoops++; }
          emit('frame', { atMs, state: snapshot.ui.state, sessionId: snapshot.ui.sessionId, generation: snapshot.generation });
        } : undefined;
        const detachCanvas = mountTrialCanvas(canvas, controller, frame);
        const current = settings();
        const input = attachKeyboardPointerInput({
          keyboardTarget: view, laneButtons: buttons,
          ...(current ? { keyBindings: current.keyBindings } : {}),
          ...(onPhysical ? { onPhysicalChange: onPhysical } : {}),
          contextAt: at => inputContext(at, false),
          onInput: accept, onCancel: event => { void controller.handleLifecycleEvent(event).then(publish); },
        });
        const escape = (event: KeyboardEvent) => {
          if (event.code !== 'Escape' || event.repeat || snapshot.screen !== 'GAME'
              || !pauseStates.includes(snapshot.ui.state)) return;
          event.preventDefault();
          void dispatch({ kind: 'PAUSE_GAME' });
        };
        view.addEventListener('keydown', escape);
        return () => {
          input.dispose();
          detachCanvas();
          if (painted) activeRafLoops--;
          reportResources();
          view.removeEventListener('keydown', escape);
        };
      });
    },
    mountCalibration(button, onPhysical) {
      return bind(() => {
        const buttons = [button, document.createElement('button'), document.createElement('button'), document.createElement('button')] as const;
        const current = settings();
        const input = attachKeyboardPointerInput({
          keyboardTarget: view, laneButtons: buttons,
          ...(current ? { keyBindings: current.keyBindings } : {}),
          ...(onPhysical ? { onPhysicalChange: onPhysical } : {}),
          contextAt: at => inputContext(at, true),
          onInput: accept, onCancel: event => { void controller.handleLifecycleEvent(event).then(publish); },
        });
        return () => input.dispose();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      actionVersion++;
      suspend();
      mounts.clear();
      detachLifecycle();
      unsubscribeStore();
      controller.dispose();
      void bridge.dispose().catch(() => emit('resources', { disposalError: true }));
    },
  };
}
