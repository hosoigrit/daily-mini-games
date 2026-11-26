import type {
  AnimationEvent, AudioEvent, CommandResult, CompiledChart, Contracts, Difficulty, ErrorCode, FinalResult, GameCommand, GameError,
  GameSettings, GameState, GameUiSnapshot, Gen, InputReceipt, LifecycleEvent, Ms, MusicDefinition, MusicId,
  NormalizedInput, PendingCommit, PlaybackAnchor, PreparedTrack, Result, SaveDataV1, SaveStatus, Token, TutorialId, Us, WriterLease,
} from '../contracts/interface_contracts';
import type { SessionAudioPort } from '../contracts/session-ports';
import { tickToUs } from '../domain/audio-clock';
import { createCalibration } from '../domain/calibration';
import { createGameSession, type GameSession, type SessionResumePlan } from '../domain/game-session';
import { createSignal } from '../domain/signal';
import { createGameStore } from './game-store';
import { createRenderPort } from './render-port';
import { canNavigate, guardCommand, type Screen, type WriterStatus } from './session-command-guards';

type Completion<T> = Result<T> | Promise<Result<T>>;

export interface SessionStorage<Binding> {
  read(): {
    readonly data: SaveDataV1 | null;
    readonly pending: PendingCommit | null;
    readonly preparingResult: FinalResult | null;
    readonly saveStatus: SaveStatus;
    readonly error: GameError | null;
    readonly unresolved: boolean;
  };
  beginFormal(sessionId: string, lease: WriterLease): Result<Binding>;
  abortFormal(binding: Binding): void;
  prepareCommit(result: FinalResult, binding: Binding, recordedAt: string): Completion<PendingCommit>;
  commitResult: Contracts['commitResult'];
  retrySave(lease: WriterLease): Completion<unknown>;
  discardResult(confirmed: boolean, lease: WriterLease): Completion<unknown>;
  updateSettings(settings: GameSettings, lease: WriterLease): Completion<unknown>;
  resetSettings(lease: WriterLease): Completion<unknown>;
  resetProgress(confirmed: boolean, lease: WriterLease): Completion<unknown>;
  completePractice(tutorialId: TutorialId, lease: WriterLease): Completion<unknown>;
  pageHide(): unknown;
  pageShow(): Promise<{ readonly lease: Result<WriterLease>; readonly save: Result<SaveDataV1> }>;
  guard(action: 'PREVIEW' | 'PRACTICE' | 'CALIBRATION' | 'WRITE', lease?: WriterLease, musicId?: MusicId): Result<void>;
}

export interface SessionSelection {
  readonly definition: MusicDefinition;
  readonly chart: CompiledChart;
}

interface ControllerOptions<Binding> {
  readonly audio: SessionAudioPort;
  readonly storage: SessionStorage<Binding>;
  readonly writer: { readonly status: () => WriterStatus; readonly currentLease: () => WriterLease | null };
  readonly getMusic: (id: MusicId) => MusicDefinition | null;
  readonly getChart: (id: MusicId, difficulty: Difficulty) => CompiledChart | null;
  readonly getTutorial: (id: TutorialId) => SessionSelection | null;
  readonly settingsValid: (data: GameSettings) => boolean;
  readonly nextSessionId: () => string;
  readonly now: () => Ms;
  readonly recordedAt: () => string;
}

interface ActiveSession<Binding> {
  readonly game: GameSession;
  readonly selection: SessionSelection;
  readonly settings: GameSettings;
  readonly track: PreparedTrack;
  readonly tutorialId: TutorialId | null;
  binding: Binding | null;
  settled: boolean;
  resumeEnabled: Result<void> | null;
  resumeRequest: object | null;
  scheduled: { readonly anchor: PlaybackAnchor; readonly plan: SessionResumePlan | null } | null;
}

const zeroUs = 0 as Us;
const empty = { ok: true, value: undefined } as const;
const isTerminal = (state: GameState) => ['CLEAR', 'FAILED', 'ABORTED', 'ERROR'].includes(state);
const canPause = (state: GameState) => ['COUNTDOWN', 'PREROLL', 'PLAYING', 'FINALIZING'].includes(state);

function failure(code: ErrorCode, messageKey: string): Result<never> {
  return { ok: false, error: { code, messageKey, severity: 'ERROR', recoverable: false } };
}

export function createSessionController<Binding>(options: ControllerOptions<Binding>) {
  const { audio, storage, writer } = options;
  const updates = createSignal<void>();
  const usedRequests = new Set<string>();
  const animation = createSignal<AnimationEvent>();
  const animationIds = new Set<string>();
  let screen: Screen = 'TITLE';
  let selectedMusicId: MusicId = 'music-01';
  let difficulty: Difficulty = 'EASY';
  let generation = 0;
  let prepared: { readonly definition: MusicDefinition; readonly track: PreparedTrack } | null = null;
  let prepareToken: Token | null = null;
  let previewToken: Token | null = null;
  let active: ActiveSession<Binding> | null = null;
  let pendingResult: { readonly result: FinalResult; readonly snapshot: GameUiSnapshot } | null = null;
  let showingRecovery = false;
  let initialization: Token | null = null;
  let initializeReady = false;
  let retryAudio = false;
  let calibration: { token: Token; measure: ReturnType<typeof createCalibration> } | null = null;
  let applicationError: GameError | null = null;
  let lifecycleGeneration = 0;
  let pageAvailable = false;
  let pageShowing = false;
  let disposed = false;
  let dispatching = false;

  const recovery = () => screen === 'RESULT' && showingRecovery ? pendingResult : null;
  const state = () => recovery()?.result.outcome ?? active?.game.read().state ?? 'READY';
  const currentSessionId = () => recovery()?.result.sessionId ?? active?.game.read().sessionId ?? null;
  const token = (requestId: string, sessionId: string | null = null, atGeneration = ++generation as Gen): Token =>
    Object.freeze({ requestId, generation: atGeneration, sessionId });
  const sessionToken = (session: ActiveSession<Binding>) => {
    const info = session.game.read();
    return token(info.sessionId, info.sessionId, info.generation);
  };
  const selectedChart = () => options.getChart(selectedMusicId, difficulty);
  const publish = () => updates.publish();
  const lease = () => writer.currentLease();

  function recordError(error: GameError) {
    applicationError = error;
    publish();
  }

  function background(operation: Promise<void>) {
    void operation.catch(() => recordError({
      code: 'ERR-017', messageKey: 'controller.backgroundFailure', severity: 'ERROR', recoverable: false,
    }));
  }

  function stopPreview() {
    const current = previewToken;
    previewToken = null;
    if (current) audio.stop(current);
  }

  function prepare(definition: MusicDefinition, requestId: string) {
    if (prepared?.definition === definition || (prepareToken && prepareToken.requestId === requestId)) return;
    const request = token(requestId);
    prepareToken = request;
    prepared = null;
    background(audio.prepare(definition, request).then(result => {
      if (prepareToken !== request || disposed || !pageAvailable) return;
      prepareToken = null;
      if (result.ok) prepared = { definition, track: result.value };
      else recordError(result.error);
      publish();
    }));
  }

  function stopCalibration() {
    if (!calibration) return;
    calibration.measure.interrupt();
    audio.stop(calibration.token);
    if (calibration.token.sessionId) audio.forgetSession(calibration.token.sessionId);
    calibration = null;
    if (screen === 'CALIBRATION') screen = 'SETTINGS';
  }

  function resetInitialization() {
    initialization = null;
    initializeReady = false;
    retryAudio = false;
  }

  function cancelScheduled(session: ActiveSession<Binding>) {
    const previous = session.scheduled;
    session.scheduled = null;
    if (!previous) return;
    const { sessionId, generation } = previous.anchor;
    audio.stop(token(sessionId, sessionId, generation));
    audio.forgetGeneration(generation);
  }

  function endSessionResources(session: ActiveSession<Binding>) {
    session.resumeRequest = null;
    cancelScheduled(session);
    audio.stop(sessionToken(session));
    audio.forgetSession(session.game.read().sessionId);
    if (session.binding !== null) {
      storage.abortFormal(session.binding);
      session.binding = null;
    }
  }

  function retire() {
    if (active) endSessionResources(active);
    active = null;
    animationIds.clear();
    resetInitialization();
  }

  function completeTerminal(session: ActiveSession<Binding>) {
    if (session.settled || active !== session || !isTerminal(session.game.read().state)) return;
    session.settled = true;
    session.resumeRequest = null;
    cancelScheduled(session);
    audio.stop(sessionToken(session));
    resetInitialization();
    const terminal = session.game.read();
    showingRecovery = false;
    screen = terminal.state === 'CLEAR' || terminal.state === 'FAILED' ? 'RESULT' : 'MENU';

    const result = session.game.getFinalResult();
    const binding = session.binding;
    if (result && binding !== null) {
      pendingResult = Object.freeze({ result, snapshot: Object.freeze(view()) });
      const owner = lease();
      const page = lifecycleGeneration;
      background((async () => {
        const pending = await storage.prepareCommit(result, binding, options.recordedAt());
        if (!pending.ok) {
          if (storage.read().error === null) recordError(pending.error);
          else publish();
          return;
        }
        publish();
        if (owner && pageAvailable && page === lifecycleGeneration) {
          await storage.commitResult(result, owner);
        }
        publish();
      })());
    } else if (terminal.mode === 'PRACTICE' && terminal.state === 'CLEAR' && session.tutorialId) {
      const owner = lease();
      if (owner && !storage.read().unresolved) {
        const tutorialId = session.tutorialId;
        background((async () => {
          const saved = await storage.completePractice(tutorialId, owner);
          if (!saved.ok) recordError(saved.error);
          publish();
        })());
      }
    } else if (binding !== null) {
      storage.abortFormal(binding);
      session.binding = null;
    }
    publish();
  }

  function updateSession(session: ActiveSession<Binding>) {
    if (session !== active) return;
    const next = session.game.read().state;
    if (isTerminal(next)) completeTerminal(session);
    else if (next === 'PAUSED' || next === 'REHOLD_WAIT' || next === 'RESUMING') screen = 'PAUSE';
    else if (next !== 'PAUSING') screen = 'GAME';
    publish();
  }

  function createSession(selection: SessionSelection, track: PreparedTrack, tutorialId: TutorialId | null): Result<ActiveSession<Binding>> {
    const settings = storage.read().data?.settings;
    const owner = lease();
    if (!settings || !owner) return failure('ERR-011', 'controller.noWriterOrSave');
    const sessionId = options.nextSessionId();
    const game = createGameSession(selection.chart, {
      sessionId, generation: ++generation as Gen, offsetUs: (settings.timingOffsetMs * 1000) as Us,
      mode: tutorialId ? 'PRACTICE' : 'FORMAL',
    });
    if (!game.ok) return game;
    return {
      ok: true, value: {
        game: game.value, selection, settings, track, tutorialId, binding: null, settled: false,
        resumeEnabled: null, resumeRequest: null, scheduled: null,
      },
    };
  }

  function beginInitialization(session: ActiveSession<Binding>, requestId: string): Result<unknown> {
    const { game } = session;
    if (!session.tutorialId && session.binding === null) {
      const owner = lease();
      if (!owner) return failure('ERR-011', 'controller.noWriter');
      const opened = storage.beginFormal(game.read().sessionId, owner);
      if (!opened.ok) return opened;
      session.binding = opened.value;
    }
    const begun = game.beginInitialization();
    if (!begun.ok) return begun;
    stopPreview();
    resetInitialization();
    const identity = game.read();
    const request = token(requestId, identity.sessionId, identity.generation);
    initialization = request;
    screen = 'GAME';
    audio.applySettings(session.settings);
    background(audio.enable().then(result => {
      if (initialization !== request || active !== session || disposed || !pageAvailable) return;
      if (!result.ok) {
        retryAudio = true;
        game.initializationDenied({ ...result.error, recoverable: true });
      } else initializeReady = true;
      publish();
    }));
    return begun;
  }

  function requestPause(session: ActiveSession<Binding>, at: Ms): Result<unknown> {
    const info = session.game.read();
    const converted = info.state === 'COUNTDOWN' ? null : audio.convert(at, info.generation);
    if (converted && !converted.ok) {
      session.game.fail(converted.error);
      updateSession(session);
      return converted;
    }
    const result = session.game.requestPause(at, converted?.value);
    if (result.ok) {
      cancelScheduled(session);
      audio.stop(sessionToken(session));
    }
    updateSession(session);
    return result;
  }

  function startPlayback(session: ActiveSession<Binding>, at: Ms) {
    const info = session.game.read();
    const started = audio.start({
      token: { ...sessionToken(session), sessionId: info.sessionId, generation: info.generation },
      track: session.track, songTimeUs: info.startSongUs, offsetUs: (session.settings.timingOffsetMs * 1000) as Us,
      atMs: at, playBgm: true,
    });
    if (!started.ok) {
      session.game.fail(started.error);
      return;
    }
    session.scheduled = { anchor: started.value, plan: null };
    commitScheduled(session, at);
  }

  function commitScheduled(session: ActiveSession<Binding>, at: Ms) {
    const scheduled = session.scheduled;
    if (!scheduled) return;
    const { anchor, plan } = scheduled;
    const checked = audio.monitor(at);
    const converted = audio.convert(at, anchor.generation);
    if (!checked.ok || !converted.ok) {
      const error = !checked.ok ? checked.error : !converted.ok ? converted.error : null;
      cancelScheduled(session);
      if (error) session.game.fail(error);
      return;
    }
    const anchorStartsAt = audio.startPerformanceMs(anchor.generation);
    if (converted.value.songTimeUs < anchor.startSongUs || (anchorStartsAt !== null && at < anchorStartsAt)) return;
    session.scheduled = null;
    const accepted = plan
      ? session.game.completeResume(plan, plan.playBgm ? anchor : undefined, at,
        anchorStartsAt ?? at)
      : session.game.startPlayback(at, anchor);
    if (!accepted.ok) {
      audio.stop(token(anchor.sessionId, anchor.sessionId, anchor.generation));
      audio.forgetGeneration(anchor.generation);
      session.game.fail(accepted.error);
    }
  }

  function resumePlayback(session: ActiveSession<Binding>, at: Ms) {
    const plan = session.game.getResumePlan(at);
    if (!plan.ok) return;
    const permission = session.resumeEnabled;
    if (!permission) return;
    const info = plan.value;
    if (!permission.ok) {
      session.game.resumeDenied(info, { ...permission.error, recoverable: true });
      return;
    }
    generation = Math.max(generation, info.generation);
    // A canceled initial countdown still has no song position or source.
    if (info.songTimeUs === null) {
      session.game.completeResume(info, undefined, at);
      return;
    }
    const request = {
      token: { ...token(info.sessionId, info.sessionId, info.generation), sessionId: info.sessionId, generation: info.generation },
      songTimeUs: info.songTimeUs, offsetUs: (session.settings.timingOffsetMs * 1000) as Us, atMs: at,
    };
    const started = audio.start(info.playBgm ? { ...request, playBgm: true, track: session.track } : { ...request, playBgm: false });
    if (!started.ok) {
      session.game.resumeDenied(info, { ...started.error, recoverable: true });
      return;
    }
    session.scheduled = { anchor: started.value, plan: info };
    commitScheduled(session, at);
  }

  function advance(at: Ms) {
    if (disposed || !pageAvailable) return;
    if (calibration && !calibration.measure.read()) {
      const measured = audio.convert(at, calibration.token.generation as Gen);
      const monitor = audio.monitor(at);
      if (measured.ok && monitor.ok) {
        const result = calibration.measure.advance(measured.value.songTimeUs);
        if (result) audio.stop(calibration.token);
      } else stopCalibration();
    }
    const session = active;
    if (!session) return;
    const info = session.game.read();
    if (session.scheduled) {
      commitScheduled(session, at);
      updateSession(session);
      return;
    }
    switch (info.state) {
      case 'INITIALIZING':
        if (initializeReady && audio.anchorAvailable()) session.game.initializationReady(at);
        break;
      case 'COUNTDOWN':
        if (info.countdownEndsAtMs !== null && at >= info.countdownEndsAtMs) startPlayback(session, at);
        break;
      case 'PREROLL':
      case 'PLAYING':
      case 'FINALIZING': {
        const observed = audio.monitor(at);
        const converted = audio.convert(at, info.generation);
        if (!observed.ok) session.game.fail(observed.error);
        else if (!converted.ok) session.game.fail(converted.error);
        else session.game.advance(converted.value, at);
        break;
      }
      case 'PAUSING':
        session.game.advancePause(at);
        break;
      case 'RESUMING':
        resumePlayback(session, at);
        break;
    }
    updateSession(session);
  }

  function onAudio(event: AudioEvent) {
    const session = active;
    if (!session || disposed || !pageAvailable) return;
    const info = session.game.read();
    const scheduled = session.scheduled;
    if (scheduled && event.kind === 'INTERRUPTED' && event.sessionId === scheduled.anchor.sessionId
        && event.generation === scheduled.anchor.generation && event.playbackId === scheduled.anchor.playbackId) {
      cancelScheduled(session);
      if (scheduled.plan) {
        session.game.resumeDenied(scheduled.plan, {
          code: 'ERR-004', messageKey: 'audio.interruptedWhileReserved', severity: 'ERROR', recoverable: true,
        });
      } else session.game.requestPause(event.at);
      updateSession(session);
      return;
    }
    if (event.sessionId !== info.sessionId || event.generation !== info.generation
        || (event.kind !== 'ENDED' && event.kind !== 'INTERRUPTED')) return;
    const at = event.kind === 'INTERRUPTED' ? event.at : options.now();
    const time = audio.convert(at, info.generation);
    session.game.handleAudioEvent(event, at, time.ok ? time.value : undefined);
    updateSession(session);
  }

  function view(): GameUiSnapshot {
    const saved = storage.read();
    const archived = recovery();
    if (archived) return { ...archived.snapshot, saveStatus: saved.saveStatus, error: saved.error ?? applicationError };
    const shown = active?.game.read();
    const summary = shown?.judgement.summary;
    return {
      sessionId: shown?.sessionId ?? null, state: shown?.state ?? 'READY', revision: shown?.revision ?? 0,
      score: summary?.ok ? summary.value.score : 0, combo: summary?.ok ? summary.value.combo : 0,
      maxCombo: summary?.ok ? summary.value.maxCombo : 0, lifeUnits: shown?.judgement.lifeUnits ?? 200,
      saveStatus: saved.saveStatus, reholdLanes: shown?.reholdLanes ?? [],
      error: shown?.error ?? saved.error ?? applicationError,
    };
  }

  const store = createGameStore({ read: view, subscribe: updates.subscribe });
  const render = createRenderPort(() => {
    if (!active) return null;
    const { game, settings, selection } = active;
    const info = game.read();
    const durationUs = selection.chart.durationUs;
    return {
      sessionId: info.sessionId, generation: info.generation, state: info.state,
      songTimeUs: info.songTimeUs ?? zeroUs, judgeTimeUs: info.judgeTimeUs ?? zeroUs, durationUs,
      notes: game.renderNotes(), activeHoldLanes: info.judgement.activeHolds.map(hold => hold.lane),
      pressedLanes: info.judgement.pressedLanes, factoryId: selection.definition.master.factoryId,
      progress: Math.max(0, Math.min(1, (info.songTimeUs ?? 0) / durationUs)), startingSettings: settings,
    };
  }, () => storage.read().data?.settings ?? null);
  const disconnect = audio.subscribeAudioEvents(onAudio);

  function navigate(to: Screen): boolean {
    const save = storage.read();
    const pendingSessionId = save.pending?.result.sessionId ?? save.preparingResult?.sessionId;
    const archived = to === 'RESULT' && pendingResult?.result.sessionId === pendingSessionId ? pendingResult : null;
    const result = archived?.result;
    const previousState = result?.outcome ?? state();
    const previousId = result?.sessionId ?? currentSessionId();
    if (!canNavigate(screen, to, previousState, previousId, pendingSessionId)) return false;
    if (screen === 'MUSIC_SELECT') {
      stopPreview();
      prepareToken = null;
    }
    showingRecovery = archived !== null;
    screen = to;
    if (to === 'MUSIC_SELECT') {
      const music = options.getMusic(selectedMusicId);
      if (music) prepare(music, 'navigation-selection');
    }
    publish();
    return true;
  }

  function startSelected(requestId: string, tutorialId: TutorialId | null): Result<unknown> {
    if (active && screen === 'GAME' && !tutorialId) return beginInitialization(active, requestId);
    const definition = options.getMusic(selectedMusicId);
    const chart = selectedChart();
    const selection = tutorialId ? options.getTutorial(tutorialId) : definition && chart && { definition, chart };
    if (!selection || !prepared || prepared.definition !== selection.definition) return failure('ERR-003', 'controller.notPrepared');
    const created = createSession(selection, prepared.track, tutorialId);
    if (!created.ok) return created;
    retire();
    active = created.value;
    return beginInitialization(active, requestId);
  }

  function retry(session: ActiveSession<Binding>, requestId: string): Result<unknown> {
    const created = createSession(session.selection, session.track, session.tutorialId);
    if (!created.ok) return created;
    retire();
    active = created.value;
    screen = 'GAME';
    return session.tutorialId ? beginInitialization(active, requestId) : empty;
  }

  function preview(command: Extract<GameCommand, { kind: 'SELECT_TRACK' | 'START_PREVIEW' }>): Result<void> {
    const definition = options.getMusic(command.musicId);
    if (!definition) return failure('ERR-001', 'controller.unknownMusic');
    const permission = storage.guard('PREVIEW', undefined, command.musicId);
    if (!permission.ok) return permission;
    stopPreview();
    const request = token(command.requestId);
    previewToken = request;
    const cached = prepared?.definition === definition ? prepared.track : null;
    if (!cached) {
      prepareToken = null;
      prepared = null;
    }
    const preparation = cached ? Promise.resolve({ ok: true, value: cached } as const) : audio.prepare(definition, request);
    background((async () => {
      const enabled = await audio.enable();
      const track = await preparation;
      if (request !== previewToken || screen !== 'MUSIC_SELECT' || !pageAvailable) return;
      if (!enabled.ok || !track.ok) {
        previewToken = null;
        if (!enabled.ok) recordError(enabled.error);
        else if (!track.ok) recordError(track.error);
        return;
      }
      prepared = { definition, track: track.value };
      const played = audio.preview(track.value, tickToUs(definition.master.previewStartTick, definition.master.bpm),
        (definition.master.previewDurationMs * 1000) as Us, request);
      if (!played.ok) {
        previewToken = null;
        recordError(played.error);
      }
    })());
    return empty;
  }

  async function dispatch(command: GameCommand, audioGesture = false): Promise<Result<CommandResult>> {
    try {
      if (disposed || !pageAvailable) return failure('ERR-008', 'controller.inactive');
      if (dispatching) return failure('ERR-008', 'controller.reentrantCommand');
      if (!command || usedRequests.has(command.requestId)) return failure('ERR-008', 'controller.repeatedRequest');
      const info = active?.game.read();
      const save = storage.read();
      const proposal = calibration?.measure.read();
      const tutorial = command.kind === 'START_TUTORIAL' ? options.getTutorial(command.tutorialId) : null;
      const chosen = options.getMusic(selectedMusicId);
      const guard = guardCommand(command, {
        screen, state: state(), sessionId: currentSessionId(), mode: recovery() ? 'FORMAL' : info?.mode ?? null,
        writer: writer.status(), unlockedMusicIds: save.data?.progress.unlockedMusicIds ?? ['music-01'],
        selectedMusicId, saveStatus: save.saveStatus, pendingSessionId: (save.pending?.result.sessionId ?? save.preparingResult?.sessionId) ?? null,
        selectionReady: prepared?.definition === chosen && !!selectedChart(), sessionReady: !!active,
        previewAvailable: command.kind === 'START_PREVIEW' && options.getMusic(command.musicId) !== null,
        previewActive: previewToken !== null, audioGesture, clockReady: audio.anchorAvailable() || info?.state === 'PAUSED',
        initializationRetry: retryAudio, playbackReserved: !retryAudio && initialization !== null,
        retryReady: !!active && !recovery(), tutorialReady: tutorial !== null && prepared?.definition === tutorial.definition,
        calibrationActive: calibration !== null, calibrationProposalMs: proposal?.kind === 'PROPOSED' ? proposal.proposedOffsetMs : null,
        settingsValid: command.kind === 'APPLY_SETTINGS' && options.settingsValid(command.settings),
      });
      usedRequests.add(command.requestId);
      if (!guard.ok) return guard;
      const owner = lease();
      const at = options.now();
      dispatching = true;
      let effect: Completion<unknown>;
      try {
        effect = execute(command, at, owner);
      } finally {
        dispatching = false;
      }
      const acceptedState = state();
      const result = 'ok' in effect ? effect : await effect;
      if (result.ok && ['APPLY_SETTINGS', 'RESET_SETTINGS', 'APPLY_CALIBRATION'].includes(command.kind)) {
        const applied = storage.read().data?.settings;
        if (applied) audio.applySettings(applied);
      }
      publish();
      return result.ok ? { ok: true, value: { requestId: command.requestId, state: acceptedState, accepted: true } } : result;
    } catch {
      return failure('ERR-017', 'controller.unexpectedCommand');
    }
  }

  function execute(command: GameCommand, at: Ms, owner: WriterLease | null): Completion<unknown> {
    const session = active;
    switch (command.kind) {
      case 'SELECT_TRACK': {
        const definition = options.getMusic(command.musicId);
        if (!definition) return failure('ERR-001', 'controller.unknownMusic');
        selectedMusicId = command.musicId;
        stopPreview();
        prepare(definition, command.requestId);
        return empty;
      }
      case 'SELECT_DIFFICULTY':
        difficulty = command.difficulty;
        return empty;
      case 'START_PREVIEW': return preview(command);
      case 'STOP_PREVIEW':
        stopPreview();
        return empty;
      case 'START_GAME': return startSelected(command.requestId, null);
      case 'START_TUTORIAL': {
        const ready = storage.guard('PRACTICE', owner ?? undefined);
        return ready.ok ? startSelected(command.requestId, command.tutorialId) : ready;
      }
      case 'PAUSE_GAME': return session ? requestPause(session, at) : failure('ERR-008', 'controller.noSession');
      case 'RESUME_GAME': {
        if (!session) return failure('ERR-008', 'controller.noSession');
        const accepted = session.game.requestResume(at);
        if (accepted.ok) {
          session.resumeEnabled = null;
          const request = {};
          session.resumeRequest = request;
          const started = audio.enable();
          background(started.then(result => {
            if (session !== active || session.resumeRequest !== request || !pageAvailable) return;
            session.resumeEnabled = result;
            if (!result.ok && ['RESUMING', 'REHOLD_WAIT'].includes(session.game.read().state)) {
              session.game.interruptResume();
              recordError(result.error);
              updateSession(session);
            }
          }));
        }
        return accepted;
      }
      case 'RETRY_GAME': return session ? retry(session, command.requestId) : failure('ERR-008', 'controller.noSession');
      case 'SKIP_TUTORIAL':
        if (!session || isTerminal(session.game.read().state)) {
          screen = 'MENU';
          return empty;
        }
        if (session.game.read().mode !== 'PRACTICE') return failure('ERR-008', 'controller.notPractice');
        // A running practice session uses the same orderly ABORT path.
        {
          const result = session.game.abort();
          updateSession(session);
          return result;
        }
      case 'ABORT_GAME':
        if (session) {
          const result = session.game.abort();
          updateSession(session);
          return result;
        }
        return failure('ERR-008', 'controller.noSession');
      case 'START_CALIBRATION': {
        const ready = storage.guard('CALIBRATION', owner ?? undefined);
        if (!ready.ok) return ready;
        const calibrationToken = token(command.requestId, `calibration-${generation + 1}`);
        const result = audio.start({
          atMs: at, offsetUs: zeroUs, playBgm: false, songTimeUs: zeroUs,
          token: { ...calibrationToken, sessionId: calibrationToken.sessionId!, generation: calibrationToken.generation as Gen },
        });
        if (!result.ok) return result;
        calibration = { token: calibrationToken, measure: createCalibration() };
        screen = 'CALIBRATION';
        return empty;
      }
      case 'STOP_CALIBRATION':
        stopCalibration();
        return empty;
      case 'APPLY_CALIBRATION': {
        const settings = storage.read().data?.settings;
        if (!owner || !settings) return failure('ERR-011', 'controller.noWriter');
        return Promise.resolve(storage.updateSettings({ ...settings, timingOffsetMs: command.offsetMs }, owner)).then(result => {
          if (result.ok) stopCalibration();
          return result;
        });
      }
      case 'APPLY_SETTINGS': return owner ? storage.updateSettings(command.settings, owner) : failure('ERR-011', 'controller.noWriter');
      case 'RESET_SETTINGS': return owner ? storage.resetSettings(owner) : failure('ERR-011', 'controller.noWriter');
      case 'RESET_PROGRESS': return owner ? storage.resetProgress(command.confirmed, owner) : failure('ERR-011', 'controller.noWriter');
      case 'RETRY_SAVE':
        return owner ? storage.retrySave(owner) : failure('ERR-011', 'controller.noResultOrWriter');
      case 'DISCARD_RESULT': return owner ? storage.discardResult(command.confirmed, owner) : failure('ERR-011', 'controller.noWriter');
    }
  }

  function enqueueInput(input: NormalizedInput): Result<InputReceipt> {
    const ignored = { ok: true, value: { eventId: input.eventId, accepted: false, reason: 'IGNORED_STATE' } } as const;
    if (disposed || !pageAvailable) return ignored;
    if (calibration && input.sessionId === calibration.token.sessionId && input.clockGeneration === calibration.token.generation) {
      calibration.measure.acceptInput(input);
      return ignored;
    }
    const session = active;
    if (!session) return ignored;
    let info = session.game.read();
    if (input.sessionId === info.sessionId && session.scheduled) {
      commitScheduled(session, input.receivedPerformanceMs);
      info = session.game.read();
    }
    if (input.sessionId === info.sessionId && (info.state === 'REHOLD_WAIT' || info.state === 'RESUMING')
        && input.clockGeneration === info.generation) {
      const oldDelivery = info.pauseBoundary && input.eventPerformanceMs <= info.pauseBoundary.atPerformanceMs;
      if (!oldDelivery) {
        const held = session.game.rehold(input, input.receivedPerformanceMs);
        if (session.game.read().state === 'REHOLD_WAIT') cancelScheduled(session);
        publish();
        if (!held.ok) return held;
        return ignored;
      }
    }
    const result = session.game.enqueueInput(input);
    updateSession(session);
    return result;
  }

  const handleLifecycleEvent: Contracts['handleLifecycleEvent'] = async event => {
    const previous = state();
    const transition = () => ({
      ok: true, value: { previous, current: state(), sessionId: currentSessionId() },
    } as const);
    try {
      if (disposed) return transition();
      const session = active;
      const info = session?.game.read();
      if (event.sessionId !== null && (!info || event.sessionId !== info.sessionId || event.generation !== info.generation)) {
        return transition();
      }
      if (event.kind === 'PAGEHIDE') {
        if (!pageAvailable && !pageShowing) return transition();
        pageAvailable = false;
        pageShowing = false;
        lifecycleGeneration++;
        prepareToken = null;
        stopPreview();
        stopCalibration();
        if (session && info && !isTerminal(info.state)) session.game.abort();
        retire();
        showingRecovery = false;
        screen = 'MENU';
        await storage.pageHide();
      } else if (event.kind === 'PAGESHOW') {
        if (pageAvailable || pageShowing) return transition();
        pageShowing = true;
        const intent = ++lifecycleGeneration;
        const ready = await storage.pageShow();
        if (intent !== lifecycleGeneration) return transition();
        pageShowing = false;
        pageAvailable = true;
        if (!ready.save.ok) recordError(ready.save.error);
      } else if (event.kind === 'VISIBLE') {
        if (session && info && !isTerminal(info.state) && writer.status() !== 'OWNED') {
          session.game.fail({ code: 'ERR-011', messageKey: 'controller.writerLost', severity: 'ERROR', recoverable: false });
          updateSession(session);
        }
      } else {
        stopPreview();
        stopCalibration();
        const invalidation = event.kind === 'LOCK_LOST' ? storage.pageHide() : null;
        if (session && info && !isTerminal(info.state)) {
          interruptSession(session, event, info.state);
          updateSession(session);
        }
        await invalidation;
      }
      publish();
      return transition();
    } catch {
      return failure('ERR-017', 'controller.unexpectedLifecycle');
    }
  };

  function interruptSession(session: ActiveSession<Binding>, event: LifecycleEvent, phase: GameState) {
    if (event.kind === 'LOCK_LOST') {
      session.game.fail({ code: 'ERR-011', messageKey: 'controller.writerLost', severity: 'ERROR', recoverable: false });
    } else if (phase === 'INITIALIZING') {
      resetInitialization();
      audio.stop(sessionToken(session));
      session.game.initializationInterrupted();
    } else if (phase === 'REHOLD_WAIT' || phase === 'RESUMING') {
      session.resumeRequest = null;
      cancelScheduled(session);
      session.game.interruptResume();
    } else if (canPause(phase)) {
      requestPause(session, event.atPerformanceMs);
    }
  }

  return {
    dispatch, navigate, advance, enqueueInput, handleLifecycleEvent,
    contextAt: audio.contextAt, getRenderSnapshot: render.getRenderSnapshot,
    subscribeAnimation: animation.subscribe,
    publishAnimationEvent(event: AnimationEvent) {
      const info = active?.game.read();
      if (!info || disposed || event.sessionId !== info.sessionId || info.generation !== event.generation
          || animationIds.has(event.eventId)) return;
      animationIds.add(event.eventId);
      animation.publish(Object.freeze({ ...event, lanes: Object.freeze([...event.lanes]) }));
    },
    getFinalResult: () => recovery()?.result ?? active?.game.getFinalResult() ?? null,
    store,
    read: () => ({ screen, session: active?.game.read() ?? null, prepared: prepared !== null,
      preview: previewToken !== null, calibration: calibration?.measure.read() ?? null, pending: storage.read().pending }),
    enableAudio: audio.enable,
    prepareTutorial(tutorialId: TutorialId) {
      const selection = screen === 'TUTORIAL' ? options.getTutorial(tutorialId) : null;
      if (selection) prepare(selection.definition, `prepare-${tutorialId}`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycleGeneration++;
      prepareToken = null;
      stopPreview();
      stopCalibration();
      retire();
      pendingResult = null;
      disconnect();
      store.dispose();
      void storage.pageHide();
    },
  };
}
