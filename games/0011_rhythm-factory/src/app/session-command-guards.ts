import type { ErrorCode, GameCommand, GameState, MusicId, Result, SaveStatus } from '../contracts/interface_contracts';

export type Screen = 'TITLE' | 'MENU' | 'MUSIC_SELECT' | 'TUTORIAL' | 'COLLECTION' | 'SETTINGS'
  | 'CALIBRATION' | 'GAME' | 'PAUSE' | 'RESULT';
export type SessionMode = 'FORMAL' | 'PRACTICE';
export type WriterStatus = 'UNSUPPORTED' | 'UNOWNED' | 'OWNED' | 'LOST';

export interface CommandGuardContext {
  readonly screen: Screen;
  readonly state: GameState;
  readonly sessionId: string | null;
  readonly mode: SessionMode | null;
  readonly writer: WriterStatus;
  readonly unlockedMusicIds: readonly MusicId[];
  readonly selectedMusicId: MusicId | null;
  readonly saveStatus: SaveStatus;
  readonly pendingSessionId: string | null;
  readonly selectionReady?: boolean;
  readonly sessionReady?: boolean;
  readonly previewAvailable?: boolean;
  readonly previewActive?: boolean;
  readonly audioGesture?: boolean;
  readonly clockReady?: boolean;
  readonly initializationRetry?: boolean;
  readonly playbackReserved?: boolean;
  readonly retryReady?: boolean;
  readonly tutorialReady?: boolean;
  readonly calibrationActive?: boolean;
  readonly calibrationProposalMs?: number | null;
  readonly settingsValid?: boolean;
}

type CommandKind = GameCommand['kind'];
type DesignState = GameState | 'NONE';
type ScreenRule = readonly [screens: readonly Screen[], states: readonly DesignState[]];

const terminalStates = ['CLEAR', 'FAILED', 'ABORTED', 'ERROR'] as const;
const menuStates = ['NONE', ...terminalStates] as const;
const gameStates = ['READY', 'INITIALIZING', 'COUNTDOWN', 'PREROLL', 'PLAYING', 'PAUSING', 'RESUMING', 'FINALIZING'] as const;
const pauseStates = ['PAUSING', 'PAUSED', 'REHOLD_WAIT', 'RESUMING'] as const;
const resultStates = ['CLEAR', 'FAILED'] as const;

const reachable: Readonly<Record<Screen, readonly DesignState[]>> = {
  TITLE: ['NONE'], MENU: menuStates, MUSIC_SELECT: menuStates, TUTORIAL: menuStates,
  COLLECTION: menuStates, SETTINGS: menuStates, CALIBRATION: menuStates,
  GAME: gameStates, PAUSE: pauseStates, RESULT: resultStates,
};

const selection: ScreenRule = [['MUSIC_SELECT'], menuStates];
const settings: ScreenRule = [['SETTINGS'], menuStates];
const calibration: ScreenRule = [['CALIBRATION'], menuStates];
const result: ScreenRule = [['RESULT'], resultStates];

// The reachable screen/state pairs are intersected with the command matrix before any guard or effect.
const commandRules: Readonly<Record<CommandKind, ScreenRule>> = {
  SELECT_TRACK: selection,
  SELECT_DIFFICULTY: selection,
  START_PREVIEW: selection,
  STOP_PREVIEW: selection,
  START_GAME: [['MUSIC_SELECT', 'GAME'], [...menuStates, 'READY', 'INITIALIZING']],
  PAUSE_GAME: [['GAME'], ['COUNTDOWN', 'PREROLL', 'PLAYING', 'FINALIZING']],
  RESUME_GAME: [['PAUSE'], ['PAUSED']],
  RETRY_GAME: [['PAUSE', 'RESULT'], ['PAUSED', ...terminalStates]],
  ABORT_GAME: [['GAME', 'PAUSE'], [...gameStates, 'PAUSED', 'REHOLD_WAIT']],
  APPLY_SETTINGS: settings,
  RETRY_SAVE: result,
  DISCARD_RESULT: result,
  RESET_SETTINGS: settings,
  RESET_PROGRESS: settings,
  START_CALIBRATION: settings,
  STOP_CALIBRATION: calibration,
  APPLY_CALIBRATION: calibration,
  START_TUTORIAL: [['TUTORIAL'], menuStates],
  SKIP_TUTORIAL: [['TUTORIAL', 'GAME', 'PAUSE', 'RESULT'], [...menuStates, ...gameStates, 'PAUSED', 'REHOLD_WAIT']],
};

const navigation: Readonly<Record<Screen, readonly Screen[]>> = {
  TITLE: ['MENU'],
  MENU: ['MUSIC_SELECT', 'TUTORIAL', 'COLLECTION', 'SETTINGS'],
  MUSIC_SELECT: ['MENU'],
  TUTORIAL: ['MENU'],
  COLLECTION: ['MENU'],
  SETTINGS: ['MENU'],
  CALIBRATION: [],
  GAME: [],
  PAUSE: [],
  RESULT: ['MENU', 'MUSIC_SELECT'],
};

export function isReachable(screen: Screen, state: GameState, sessionId: string | null): boolean {
  if (!Object.hasOwn(reachable, screen)) return false;
  if (sessionId === null) return state === 'READY' && reachable[screen].includes('NONE');
  return typeof sessionId === 'string' && sessionId.trim() !== '' && reachable[screen].includes(state);
}

/** Ordinary screen navigation. Accepted commands and session events determine gameplay routes. */
export function canNavigate(
  from: Screen, to: Screen, state: GameState, sessionId: string | null, pendingSessionId: string | null = null,
): boolean {
  if (!isReachable(from, state, sessionId) || !isReachable(to, state, sessionId)) return false;
  if (navigation[from].includes(to)) return true;
  return (from === 'MENU' || from === 'MUSIC_SELECT') && to === 'RESULT'
    && pendingSessionId !== null && pendingSessionId === sessionId;
}

export function isCommandCandidate(
  kind: CommandKind, screen: Screen, state: GameState, sessionId: string | null,
): boolean {
  if (!Object.hasOwn(commandRules, kind) || !isReachable(screen, state, sessionId)) return false;
  const [screens, states] = commandRules[kind];
  return screens.includes(screen) && states.includes(sessionId === null ? 'NONE' : state);
}

function isSessionCommand(kind: CommandKind, screen: Screen): boolean {
  switch (kind) {
    case 'START_GAME': return screen === 'GAME';
    case 'SKIP_TUTORIAL': return screen !== 'TUTORIAL';
    case 'PAUSE_GAME':
    case 'RESUME_GAME':
    case 'RETRY_GAME':
    case 'ABORT_GAME':
    case 'RETRY_SAVE':
    case 'DISCARD_RESULT': return true;
    default: return false;
  }
}

const accepted: Result<void> = { ok: true, value: undefined };

function deny(code: ErrorCode, messageKey: string, sessionId: string | null): Result<never> {
  return {
    ok: false,
    error: { code, messageKey, severity: 'ERROR', recoverable: true, ...(sessionId === null ? {} : { sessionId }) },
  };
}

/** IF-15 admission only. The serial controller claims request IDs and verifies async completion tokens. */
export function guardCommand(command: GameCommand, context: CommandGuardContext): Result<void> {
  const { screen, state, sessionId, mode, writer, pendingSessionId } = context;
  const reject = (key: string, code: ErrorCode = 'ERR-008') => deny(code, `command.${key}`, sessionId);

  if (!command || typeof command.requestId !== 'string' || command.requestId.trim() === ''
      || !isCommandCandidate(command.kind, screen, state, sessionId)
      || (sessionId === null ? mode !== null : mode !== 'FORMAL' && mode !== 'PRACTICE')) {
    return reject('notAllowed');
  }

  if (command.sessionId !== (isSessionCommand(command.kind, screen) ? sessionId : null)) {
    return reject('wrongSession');
  }

  const unlocked = (musicId: MusicId | null) => musicId !== null
    && /^music-0[1-5]$/.test(musicId) && context.unlockedMusicIds.includes(musicId);
  const owner = writer === 'OWNED';
  const pending = pendingSessionId !== null;
  const currentPending = pending && pendingSessionId === sessionId && context.saveStatus === 'SAVE_ERROR';

  switch (command.kind) {
    case 'SELECT_TRACK':
      if (typeof command.musicId !== 'string' || !/^music-0[1-5]$/.test(command.musicId)) {
        return reject('unknownMusic', 'ERR-001');
      }
      return unlocked(command.musicId) ? accepted : reject('musicLocked');
    case 'SELECT_DIFFICULTY':
      return unlocked(context.selectedMusicId) && ['EASY', 'NORMAL', 'HARD'].includes(command.difficulty)
        ? accepted : reject('difficultyUnavailable');
    case 'START_PREVIEW':
      if (!unlocked(command.musicId)) return reject('musicLocked');
      if (!context.audioGesture) return reject('audioGestureRequired', 'ERR-004');
      return context.previewAvailable ? accepted : reject('previewUnavailable', 'ERR-003');
    case 'STOP_PREVIEW':
      return context.previewActive ? accepted : reject('previewInactive');
    case 'START_GAME':
      if (screen === 'GAME' && mode !== 'FORMAL') return reject('wrongMode');
      if (!owner) return reject('writerRequired', writer === 'UNSUPPORTED' ? 'ERR-010' : writer === 'LOST' ? 'ERR-011' : 'ERR-009');
      if (pending) return reject('pendingSave', 'ERR-013');
      if (!unlocked(context.selectedMusicId) || context.playbackReserved) return reject('startUnavailable');
      if (screen === 'MUSIC_SELECT') return context.selectionReady ? accepted : reject('preparationRequired');
      if (!context.sessionReady || (state === 'INITIALIZING' && !context.initializationRetry)) {
        return reject('startUnavailable');
      }
      return accepted;
    case 'PAUSE_GAME':
    case 'ABORT_GAME':
      return accepted;
    case 'RESUME_GAME':
      if (!owner) return reject('writerRequired', 'ERR-011');
      return context.clockReady ? accepted : reject('clockUnavailable', 'ERR-006');
    case 'RETRY_GAME':
      if (!owner) return reject('writerRequired', 'ERR-011');
      if (pending) return reject('pendingSave', 'ERR-013');
      return context.retryReady ? accepted : reject('retryUnavailable');
    case 'RETRY_SAVE':
    case 'DISCARD_RESULT':
      if (mode !== 'FORMAL' || !currentPending) return reject('retryStateUnavailable');
      if (!owner) return reject('writerRequired', 'ERR-011');
      if (command.kind === 'DISCARD_RESULT' && command.confirmed !== true) return reject('confirmationRequired');
      // The save operation rechecks the current lease, epoch, revision and receipt before any effect.
      return accepted;
    case 'START_CALIBRATION':
      if (!owner || context.calibrationActive) return reject('calibrationUnavailable');
      if (!context.audioGesture) return reject('audioGestureRequired', 'ERR-004');
      return context.clockReady ? accepted : reject('clockUnavailable', 'ERR-005');
    case 'STOP_CALIBRATION':
      return context.calibrationActive || typeof context.calibrationProposalMs === 'number'
        ? accepted : reject('calibrationInactive');
    case 'START_TUTORIAL':
      if (!owner) return reject('writerRequired');
      if (typeof command.tutorialId !== 'string' || !/^TUT-0[1-6]$/.test(command.tutorialId)) {
        return reject('unknownTutorial', 'ERR-002');
      }
      return context.tutorialReady ? accepted : reject('tutorialUnavailable');
    case 'SKIP_TUTORIAL':
      return screen === 'TUTORIAL' || mode === 'PRACTICE' ? accepted : reject('wrongMode');
    case 'APPLY_SETTINGS':
    case 'RESET_SETTINGS':
    case 'RESET_PROGRESS':
    case 'APPLY_CALIBRATION':
      if (!owner) return reject('writerRequired', 'ERR-011');
      if (pending) return reject('pendingSave', 'ERR-013');
      if ((command.kind === 'RESET_PROGRESS' || command.kind === 'APPLY_CALIBRATION') && command.confirmed !== true) {
        return reject('confirmationRequired');
      }
      if (command.kind === 'APPLY_SETTINGS' && !context.settingsValid) return reject('invalidSettings', 'ERR-018');
      if (command.kind === 'APPLY_CALIBRATION'
          && (!Number.isFinite(command.offsetMs) || command.offsetMs !== context.calibrationProposalMs)) {
        return reject('calibrationProposalMismatch');
      }
      return accepted;
  }
}
