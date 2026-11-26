import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canNavigate, guardCommand, isCommandCandidate, isReachable,
  type CommandGuardContext, type Screen,
} from '../../src/app/session-command-guards';
import type { GameCommand, GameSettings, GameState } from '../../src/contracts/interface_contracts';

const settings: GameSettings = {
  musicVolume: 70, sfxVolume: 50, noteSpeed: 1, timingOffsetMs: 0, showFastSlow: true,
  effectQuality: 'NORMAL', vibrationEnabled: false, keyBindings: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
};

function context(overrides: Partial<CommandGuardContext>): CommandGuardContext {
  return {
    screen: 'MENU', state: 'READY', sessionId: null, mode: null, writer: 'OWNED',
    unlockedMusicIds: ['music-01'], selectedMusicId: 'music-01', saveStatus: 'IDLE', pendingSessionId: null,
    selectionReady: true, sessionReady: true, previewAvailable: true, previewActive: true,
    audioGesture: true, clockReady: true, initializationRetry: true, retryReady: true,
    tutorialReady: true, calibrationActive: false, calibrationProposalMs: 15, settingsValid: true,
    ...overrides,
  };
}

function command(kind: GameCommand['kind'], sessionId: string | null): GameCommand {
  const identity = { requestId: 'request', sessionId };
  switch (kind) {
    case 'SELECT_TRACK':
    case 'START_PREVIEW': return { ...identity, kind, musicId: 'music-01' };
    case 'SELECT_DIFFICULTY': return { ...identity, kind, difficulty: 'HARD' };
    case 'APPLY_SETTINGS': return { ...identity, kind, settings };
    case 'START_TUTORIAL': return { ...identity, kind, tutorialId: 'TUT-01' };
    case 'DISCARD_RESULT':
    case 'RESET_PROGRESS': return { ...identity, kind, confirmed: true };
    case 'APPLY_CALIBRATION': return { ...identity, kind, confirmed: true, offsetMs: 15 };
    default: return { ...identity, kind };
  }
}

function error(result: ReturnType<typeof guardCommand>) {
  return result.ok ? null : result.error.code;
}

describe('A-2c command admission', () => {
  it('matches reachability and admission candidates in all 2850 canonical rows', () => {
    const path = new URL('../../../../handoffs/game-0011/v1.0/approved_v08/command_state_crosscheck.csv', import.meta.url);
    const rows = readFileSync(path, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
    const eligible = new Set<string>();
    expect(rows).toHaveLength(2850);
    for (const row of rows) {
      const match = /^([^,]+),([^,]+),([^,]+),([^,]+),.*,(YES|NO),[^,]+$/.exec(row);
      if (!match) throw new Error(`Unexpected canonical row: ${row}`);
      const [, rawKind, rawScreen, rawState, decision, reach] = match;
      const kind = rawKind as GameCommand['kind'];
      const screen = rawScreen as Screen;
      const sessionId = rawState === 'NONE' ? null : 'current';
      const state = rawState === 'NONE' ? 'READY' : rawState as GameState;
      let mode: CommandGuardContext['mode'] = sessionId === null ? null : 'FORMAL';
      if (sessionId && kind === 'SKIP_TUTORIAL' && screen !== 'TUTORIAL') mode = 'PRACTICE';
      const pending = kind === 'RETRY_SAVE' || kind === 'DISCARD_RESULT';
      const stateContext = context({
        screen, state, sessionId, mode,
        pendingSessionId: pending ? 'current' : null,
        saveStatus: pending ? 'SAVE_ERROR' : 'IDLE',
      });
      // Non-session operations always use null even while a previous terminal session is displayed.
      const usesId = ['PAUSE_GAME', 'RESUME_GAME', 'RETRY_GAME', 'ABORT_GAME', 'RETRY_SAVE', 'DISCARD_RESULT'].includes(kind)
        || (kind === 'START_GAME' && screen === 'GAME') || (kind === 'SKIP_TUTORIAL' && screen !== 'TUTORIAL');
      const request = command(kind, usesId ? sessionId : null);
      expect(isReachable(screen, state, sessionId), row).toBe(reach === 'YES');
      expect(isCommandCandidate(kind, screen, state, sessionId), row).toBe(decision === 'CONDITIONAL');
      expect(guardCommand(request, stateContext).ok, row).toBe(decision === 'CONDITIONAL');
      if (decision === 'CONDITIONAL') {
        eligible.add(kind);
        expect(guardCommand({ ...request, sessionId: usesId ? 'superseded' : 'current' }, stateContext).ok, row).toBe(false);
      }
    }
    expect(eligible.size).toBe(19);
  });

  it('preserves preview access in non-owning tabs while requiring owners for stateful operations', () => {
    const pick = context({ screen: 'MUSIC_SELECT', writer: 'UNOWNED' });
    expect(guardCommand(command('SELECT_TRACK', null), pick).ok).toBe(true);
    expect(guardCommand(command('START_PREVIEW', null), pick).ok).toBe(true);
    expect(error(guardCommand(command('START_GAME', null), pick))).toBe('ERR-009');
    expect(error(guardCommand(command('START_GAME', null), { ...pick, writer: 'UNSUPPORTED' }))).toBe('ERR-010');
    expect(error(guardCommand(command('START_GAME', null), { ...pick, writer: 'LOST' }))).toBe('ERR-011');
    expect(guardCommand(command('START_TUTORIAL', null), { ...pick, screen: 'TUTORIAL' }).ok).toBe(false);
    expect(guardCommand(command('START_CALIBRATION', null), { ...pick, screen: 'SETTINGS' }).ok).toBe(false);
    expect(guardCommand(command('APPLY_SETTINGS', null), { ...pick, screen: 'SETTINGS' }).ok).toBe(false);
    expect(guardCommand(command('RESET_PROGRESS', null), { ...pick, screen: 'SETTINGS' }).ok).toBe(false);
  });

  it('applies locked-track, audio gesture, preparation and latest start guards', () => {
    const pick = context({ screen: 'MUSIC_SELECT' });
    expect(guardCommand({ requestId: 'r', sessionId: null, kind: 'START_PREVIEW', musicId: 'music-05' }, pick).ok).toBe(false);
    expect(error(guardCommand(command('START_PREVIEW', null), { ...pick, audioGesture: false }))).toBe('ERR-004');
    expect(error(guardCommand(command('START_PREVIEW', null), { ...pick, previewAvailable: false }))).toBe('ERR-003');
    expect(guardCommand(command('STOP_PREVIEW', null), { ...pick, previewActive: false }).ok).toBe(false);
    expect(guardCommand(command('START_GAME', null), { ...pick, selectionReady: false }).ok).toBe(false);

    const retry = context({ screen: 'GAME', sessionId: 'current', mode: 'FORMAL', state: 'INITIALIZING' });
    const start = command('START_GAME', 'current');
    expect(guardCommand(start, retry).ok).toBe(true);
    expect(guardCommand(start, { ...retry, initializationRetry: false }).ok).toBe(false);
    expect(guardCommand(start, { ...retry, playbackReserved: true }).ok).toBe(false);
    expect(guardCommand(start, { ...retry, sessionReady: false }).ok).toBe(false);
    expect(guardCommand(start, { ...retry, mode: 'PRACTICE' }).ok).toBe(false);
    expect(guardCommand({ ...start, requestId: ' ' }, retry).ok).toBe(false);
  });

  it('permits nonpersistent owner options with an unresolved save and blocks persistent commands', () => {
    const unresolved = context({
      sessionId: 'finished', mode: 'FORMAL', state: 'CLEAR', saveStatus: 'SAVE_ERROR', pendingSessionId: 'finished',
    });
    expect(guardCommand(command('START_TUTORIAL', null), { ...unresolved, screen: 'TUTORIAL' }).ok).toBe(true);
    expect(guardCommand(command('START_CALIBRATION', null), { ...unresolved, screen: 'SETTINGS' }).ok).toBe(true);
    expect(guardCommand(command('SELECT_TRACK', null), { ...unresolved, screen: 'MUSIC_SELECT' }).ok).toBe(true);
    expect(error(guardCommand(command('START_GAME', null), { ...unresolved, screen: 'MUSIC_SELECT' }))).toBe('ERR-013');
    expect(error(guardCommand(command('RETRY_GAME', 'finished'), { ...unresolved, screen: 'RESULT' }))).toBe('ERR-013');
    for (const kind of ['APPLY_SETTINGS', 'RESET_SETTINGS', 'RESET_PROGRESS'] as const) {
      expect(error(guardCommand(command(kind, null), { ...unresolved, screen: 'SETTINGS' }))).toBe('ERR-013');
    }
    expect(error(guardCommand(command('APPLY_CALIBRATION', null), { ...unresolved, screen: 'CALIBRATION' }))).toBe('ERR-013');
  });

  it('checks the result pending identity, formal mode, save failure, and confirmation', () => {
    const failed = context({
      screen: 'RESULT', state: 'FAILED', sessionId: 'current', mode: 'FORMAL',
      saveStatus: 'SAVE_ERROR', pendingSessionId: 'current',
    });
    expect(guardCommand(command('RETRY_SAVE', 'current'), failed).ok).toBe(true);
    expect(guardCommand(command('DISCARD_RESULT', 'current'), failed).ok).toBe(true);
    expect(guardCommand({ ...command('DISCARD_RESULT', 'current'), confirmed: false } as unknown as GameCommand, failed).ok).toBe(false);
    expect(guardCommand(command('RETRY_SAVE', 'current'), { ...failed, pendingSessionId: 'older' }).ok).toBe(false);
    expect(guardCommand(command('DISCARD_RESULT', 'current'), { ...failed, saveStatus: 'SAVED' }).ok).toBe(false);
    expect(guardCommand(command('RETRY_SAVE', 'current'), { ...failed, mode: 'PRACTICE' }).ok).toBe(false);
  });

  it('demands valid settings, current calibration proposal, and explicit destructive confirmation', () => {
    expect(error(guardCommand(command('APPLY_SETTINGS', null), context({ screen: 'SETTINGS', settingsValid: false })))).toBe('ERR-018');
    expect(guardCommand({ ...command('RESET_PROGRESS', null), confirmed: false } as unknown as GameCommand, context({ screen: 'SETTINGS' })).ok).toBe(false);
    const calibration = context({ screen: 'CALIBRATION' });
    expect(guardCommand(command('APPLY_CALIBRATION', null), calibration).ok).toBe(true);
    expect(guardCommand(command('APPLY_CALIBRATION', null), { ...calibration, calibrationProposalMs: 10 }).ok).toBe(false);
    expect(guardCommand(command('APPLY_CALIBRATION', null), { ...calibration, calibrationProposalMs: null }).ok).toBe(false);
  });

  it('keeps ordinary routes separate from play commands and lets pending results be revisited', () => {
    expect(canNavigate('TITLE', 'MENU', 'READY', null)).toBe(true);
    expect(canNavigate('MENU', 'MUSIC_SELECT', 'READY', null)).toBe(true);
    expect(canNavigate('MUSIC_SELECT', 'GAME', 'READY', null)).toBe(false);
    expect(canNavigate('GAME', 'MENU', 'PLAYING', 'current')).toBe(false);
    expect(canNavigate('RESULT', 'MUSIC_SELECT', 'CLEAR', 'finished')).toBe(true);
    expect(canNavigate('MUSIC_SELECT', 'RESULT', 'CLEAR', 'finished')).toBe(false);
    expect(canNavigate('MUSIC_SELECT', 'RESULT', 'CLEAR', 'finished', 'superseded')).toBe(false);
    expect(canNavigate('MUSIC_SELECT', 'RESULT', 'CLEAR', 'finished', 'finished')).toBe(true);
    expect(canNavigate('MENU', 'RESULT', 'ABORTED', 'aborted', 'aborted')).toBe(false);
  });
});
