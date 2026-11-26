// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { FinalResult, GameSettings, Gen, StatisticalUs, Us } from '../../src/contracts/interface_contracts';
import type { TrialRuntime, TrialSnapshot } from '../../src/contracts/trial-runtime';
import { TrialGame } from '../../src/presentation/TrialGame';

const settings: GameSettings = {
  musicVolume: 70, sfxVolume: 50, noteSpeed: 1, timingOffsetMs: 0, showFastSlow: true,
  effectQuality: 'NORMAL', vibrationEnabled: false, keyBindings: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
};
const defaults: TrialSnapshot = {
  screen: 'TITLE',
  ui: {
    sessionId: null, state: 'READY', revision: 0, score: 0, combo: 0, maxCombo: 0, lifeUnits: 200,
    saveStatus: 'IDLE', reholdLanes: [], error: null,
  },
  prepared: false, preview: false, writer: 'OWNED', pending: false, settings,
  mode: null, result: null, calibration: null, generation: null, progress: 0,
  countdownSeconds: null, reheldLanes: [], judgements: [], save: null,
};

function fixture(initial: Partial<TrialSnapshot> = {}) {
  const subscriptions = new Set<() => void>();
  let snapshot = { ...defaults, ...initial };
  let resources = 0;
  let maxResources = 0;
  const release = vi.fn();
  const activeMount: TrialRuntime['mountPlayfield'] = (_canvas, _buttons, onPhysical) => {
    onPhysical?.([]);
    resources += 1;
    maxResources = Math.max(resources, maxResources);
    return () => {
      resources -= 1;
      release();
    };
  };
  const mountPlayfield = vi.fn(activeMount);
  const mountCalibration = vi.fn(() => () => {});
  const dispatch = vi.fn<TrialRuntime['dispatch']>(async () => ({
    ok: true, value: { requestId: 'trial-test', accepted: true, state: snapshot.ui.state },
  }));
  const update = (delta: Partial<TrialSnapshot>) => {
    snapshot = { ...snapshot, ...delta };
    for (const notify of subscriptions) notify();
  };
  const runtime = {
    subscribe(listener) {
      subscriptions.add(listener);
      return () => { subscriptions.delete(listener); };
    },
    getSnapshot: () => snapshot,
    navigate(next) { update({ screen: next }); return true; },
    dispatch, mountPlayfield, mountCalibration, prepareTutorial: vi.fn(),
    prepareAudio: async () => ({ ok: true, value: undefined }),
  } satisfies TrialRuntime;
  return { runtime, update, subscriptions, release, getMaximumResources: () => maxResources };
}

afterEach(cleanup);

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

it('routes to the trial track and preserves preview access while non-owning tabs cannot start', () => {
  const { runtime, update } = fixture({ prepared: true, writer: 'UNOWNED' });
  render(<TrialGame runtime={runtime} />);
  expect(screen.getByRole('heading', { name: 'リズムファクトリー' })).toBeTruthy();
  expect(screen.getByText('A-2d 技術実証版')).toBeTruthy();
  click('メニューへ');
  click('曲を選ぶ');
  expect(screen.getByRole('main').dataset.screen).toBe('MUSIC_SELECT');
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: '選曲' }));
  expect(screen.getByText('閲覧専用')).toBeTruthy();
  const start = screen.getByRole<HTMLButtonElement>('button', { name: '演奏を始める' });
  expect(start.disabled).toBe(true);
  click('試聴する');
  expect(runtime.dispatch).toHaveBeenCalledWith({ kind: 'START_PREVIEW', musicId: 'music-01' });

  act(() => update({ writer: 'OWNED' }));
  expect(start.disabled).toBe(false);
  click('演奏を始める');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'START_GAME' });
});

it('keeps the same playfield and one active subscription through Strict Mode, pause, and rehold', () => {
  const playing = { ...defaults.ui, sessionId: 'test-session', state: 'PLAYING', score: 43210, combo: 2, maxCombo: 10, lifeUnits: 182 } as const;
  const { runtime, update, release, subscriptions, getMaximumResources } = fixture({
    screen: 'GAME', mode: 'FORMAL', generation: 3 as Gen, ui: playing,
    progress: 0.2, judgements: [{ id: '1', label: 'GREAT', timing: 'FAST' }],
  });
  const mounted = render(<StrictMode><TrialGame runtime={runtime} /></StrictMode>);
  const canvas = screen.getByLabelText('4レーンの譜面と判定ライン');
  const key = screen.getByRole('button', { name: 'レーン1 D' });
  expect(screen.getByText('43,210')).toBeTruthy();
  expect(screen.getByText('91')).toBeTruthy();
  expect(screen.getByText('最大コンボ')).toBeTruthy();
  expect(screen.getByText('10')).toBeTruthy();
  expect(screen.getByText('GREAT · FAST')).toBeTruthy();
  expect(subscriptions.size).toBe(1);
  expect(getMaximumResources()).toBe(1);
  expect(runtime.mountPlayfield).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledTimes(1);
  expect(runtime.dispatch).not.toHaveBeenCalled();
  click('一時停止');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'PAUSE_GAME' });

  act(() => update({ screen: 'PAUSE', ui: { ...playing, state: 'PAUSED', reholdLanes: [1] } }));
  click('再開');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'RESUME_GAME' });
  act(() => update({ ui: { ...playing, state: 'REHOLD_WAIT', reholdLanes: [1] }, reheldLanes: [1] }));
  expect(screen.getByLabelText('4レーンの譜面と判定ライン')).toBe(canvas);
  expect(screen.getByRole('button', { name: 'レーン1 D' })).toBe(key);
  expect(key.dataset.reheld).toBe('true');
  expect(screen.getByText('再保持 1 / 1 · レーン 1')).toBeTruthy();
  expect(runtime.mountPlayfield).toHaveBeenCalledTimes(2);

  mounted.unmount();
  expect(release).toHaveBeenCalledTimes(2);
  expect(subscriptions.size).toBe(0);
});

it('uses the settings and progress commands without bypassing confirmation', () => {
  const { runtime } = fixture({ screen: 'SETTINGS' });
  render(<TrialGame runtime={runtime} />);
  const volume = screen.getByRole('spinbutton', { name: '音楽の音量' });
  fireEvent.change(volume, { target: { value: '65' } });
  click('設定を保存');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'APPLY_SETTINGS', settings: { ...settings, musicVolume: 65 } });
  click('進捗を初期化');
  expect(runtime.dispatch).toHaveBeenCalledTimes(1);
  click('キャンセル');
  expect(screen.queryByRole('group', { name: '進捗初期化の確認' })).toBeNull();
  click('進捗を初期化');
  click('進捗を消去する');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'RESET_PROGRESS', confirmed: true });
});

it('offers retry and explicit discard only for the pending formal save', () => {
  const result: FinalResult = {
    sessionId: 'sealed', musicId: 'music-01', chartId: 'CHART-01-H', difficulty: 'HARD', outcome: 'CLEAR',
    score: 1_000_000, rank: 'SS', counts: { perfect: 82, great: 0, good: 0, miss: 0, ghost: 0, unplayed: 0 },
    totalJudgements: 82, maxCombo: 82, remainingLifeUnits: 200, endJudgeTimeUs: 24_000_000 as Us, durationUs: 24_000_000 as Us,
  };
  const { runtime, update } = fixture({
    screen: 'RESULT', mode: 'FORMAL', pending: true, result,
    ui: { ...defaults.ui, sessionId: 'sealed', state: 'CLEAR', score: 1_000_000, combo: 82, maxCombo: 82, saveStatus: 'SAVE_ERROR' },
  });
  render(<TrialGame runtime={runtime} />);
  expect(screen.getByRole('heading', { name: 'CLEAR' })).toBeTruthy();
  click('保存を再試行');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'RETRY_SAVE' });
  click('未保存の結果を破棄');
  expect(runtime.dispatch).toHaveBeenCalledTimes(1);
  click('結果を破棄する');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'DISCARD_RESULT', confirmed: true });
  act(() => update({ mode: 'PRACTICE', result: null }));
  expect(screen.getByRole('heading', { name: '練習完了' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '保存を再試行' })).toBeNull();
});

it('attaches calibration input and applies only the displayed current proposal', () => {
  const { runtime, update } = fixture({ screen: 'CALIBRATION' });
  render(<TrialGame runtime={runtime} />);
  const beat = screen.getByRole('button', { name: '拍に合わせて入力' });
  expect(runtime.mountCalibration).toHaveBeenCalledWith(beat, expect.any(Function));
  expect(screen.queryByRole('button', { name: '補正を適用' })).toBeNull();
  act(() => update({ calibrationBeat: 4 }));
  expect(screen.getByText('5 / 16 拍')).toBeTruthy();
  act(() => update({ calibration: {
    kind: 'PROPOSED', proposedOffsetMs: 15, medianUs: 15_000 as StatisticalUs, madUs: 0 as StatisticalUs, samples: [],
  } }));
  click('補正を適用');
  expect(runtime.dispatch).toHaveBeenLastCalledWith({ kind: 'APPLY_CALIBRATION', offsetMs: 15, confirmed: true });
});
