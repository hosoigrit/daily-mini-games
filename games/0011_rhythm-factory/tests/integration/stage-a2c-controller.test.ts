import { describe, expect, it, vi } from 'vitest';
import type { GameCommand, NormalizedInput, Result } from '../../src/contracts/interface_contracts';
import { ms, ok, rig, trial, us, value, zeroTime } from '../fixtures/a2c-controller-probe';

const waitSave = async (testRig: ReturnType<typeof rig>, expected: string) =>
  vi.waitFor(() => expect(testRig.storage.read().saveStatus).toBe(expected), { timeout: 1500 });

describe('A-2c 回転灯と固定時計・保存ポートの統合', () => {
  it('待機中の重複コマンドを拒否し、再生予約の曲時刻が初期位置に届くまではCOUNTDOWNを維持', async () => {
    const r = rig();
    await r.select();
    let completeEnable!: (result: Result<void>) => void;
    r.audio.enable.mockImplementationOnce(() => new Promise(resolve => { completeEnable = resolve; }));
    const start: GameCommand = { kind: 'START_GAME', sessionId: null, requestId: 'start' };
    value(await r.controller.dispatch(start));
    expect(r.session().state).toBe('INITIALIZING');
    expect(await r.controller.dispatch(start)).toMatchObject({ ok: false, error: { code: 'ERR-008' } });
    expect(r.audio.enable).toHaveBeenCalledTimes(1);
    completeEnable(ok(undefined));
    await Promise.resolve();
    r.step(1000);
    r.step(4000);
    expect(r.session().state).toBe('COUNTDOWN');
    expect(r.starts).toHaveLength(1);
    r.step(4049.999);
    expect(r.session().state).toBe('COUNTDOWN');
    r.step(4050);
    expect(r.session()).toMatchObject({ state: 'PREROLL', songTimeUs: -150_000 });
    r.step(zeroTime);
    expect(r.session()).toMatchObject({ state: 'PLAYING', songTimeUs: 0 });
    r.controller.dispose();
  });

  it('古い初期化の非同期完了を破棄し、中断を準備Promiseで待たせない', async () => {
    const r = rig();
    await r.select();
    let completeEnable!: (result: Result<void>) => void;
    r.audio.enable.mockImplementationOnce(() => new Promise(resolve => { completeEnable = resolve; }));
    value(await r.controller.dispatch({ kind: 'START_GAME', sessionId: null, requestId: 'start' }));
    const command: GameCommand = { kind: 'ABORT_GAME', sessionId: r.session().sessionId, requestId: 'abort' };
    value(await r.controller.dispatch(command));
    completeEnable(ok(undefined));
    await Promise.resolve();
    r.step(8000);
    expect(r.session().state).toBe('ABORTED');
    expect(r.starts).toHaveLength(0);
    expect(r.controller.getFinalResult()).toBeNull();
    r.controller.dispose();
  });

  it('正式試験譜面を100万点で封印し、一度だけ保存してpageshowで復元する', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    r.finishIdeal();
    const sealed = r.controller.getFinalResult();
    expect(sealed).toMatchObject({ outcome: 'CLEAR', score: 1_000_000, maxCombo: 82, counts: { perfect: 82 } });
    await waitSave(r, 'SAVED');
    expect(r.storage.read().data?.records[trial.chartId]?.clear).toMatchObject({ clearCount: 1, bestScore: 1_000_000 });
    r.at(29_000);
    r.ended();
    expect(r.controller.getFinalResult()).toBe(sealed);
    expect(r.writes()).toBe(2);
    const lease = r.writer.currentLease();
    value(await r.lifecycle('PAGEHIDE'));
    value(await r.lifecycle('PAGESHOW'));
    expect(r.controller.read().session).toBeNull();
    expect(r.writer.currentLease()?.generation).toBeGreaterThan(lease?.generation ?? -1);
    expect(r.storage.read().data?.records[trial.chartId]?.clear?.clearCount).toBe(1);
    expect(r.writes()).toBe(2);
    r.controller.dispose();
  });

  it('無操作FAILEDは参考記録にだけ保存し、封印後に得点を更新しない', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    r.step(zeroTime + 3000);
    const sealed = r.controller.getFinalResult();
    expect(sealed).toMatchObject({ outcome: 'FAILED', score: 0, endJudgeTimeUs: 2_750_000, counts: { miss: 10, unplayed: 72 } });
    await waitSave(r, 'SAVED');
    const record = r.storage.read().data?.records[trial.chartId];
    expect(record?.failed).toMatchObject({ failureCount: 1, latestEndJudgeTimeUs: 2_750_000 });
    expect(record?.clear).toBeNull();
    value(r.controller.enqueueInput(r.ideal()[0]!));
    expect(r.controller.getFinalResult()).toBe(sealed);
    r.controller.dispose();
  });

  it('保持中にBを固定し、50ms同値後の1μsで閉じ、新世代のUPで正常完了する', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    const b = 4_100_000;
    const pauseAt = zeroTime + b / 1000;
    const initial = r.session();
    for (const input of r.ideal().filter(input => input.judgeTimeUs <= b)) value(r.controller.enqueueInput(input));
    r.step(pauseAt);
    value(await r.controller.dispatch({ kind: 'PAUSE_GAME', sessionId: initial.sessionId, requestId: 'pause' }));
    r.step(pauseAt + 50);
    expect(r.session().state).toBe('PAUSING');
    r.step(pauseAt + 50.001);
    expect(r.session()).toMatchObject({
      state: 'PAUSED', songTimeUs: b, reholdLanes: [1], pauseBoundary: { processedBeforeUs: b + 1 },
    });

    const resumeAt = 10_000;
    r.at(resumeAt);
    value(await r.controller.dispatch({ kind: 'RESUME_GAME', sessionId: initial.sessionId, requestId: 'resume' }));
    const rehold: NormalizedInput = {
      eventId: 'rehold-1', sessionId: initial.sessionId, clockGeneration: initial.generation,
      inputId: 'new-touch', lane: 1, action: 'DOWN', eventPerformanceMs: ms(resumeAt), receivedPerformanceMs: ms(resumeAt),
      songTimeUs: us(b), judgeTimeUs: us(b), sequence: 1001,
    };
    value(r.controller.enqueueInput(rehold));
    r.step(resumeAt + 2999.999);
    expect(r.session().state).toBe('RESUMING');
    r.step(resumeAt + 3000);
    expect(r.session().state).toBe('RESUMING');
    r.step(resumeAt + 3050);
    expect(r.session()).toMatchObject({ state: 'PLAYING', generation: initial.generation + 1, songTimeUs: b });
    const previousStart = r.ideal().filter(input => input.judgeTimeUs < b).at(-1)!;
    const staleDelivered = { ...previousStart, clockGeneration: initial.generation, receivedPerformanceMs: ms(resumeAt + 3050) };
    expect(value(r.controller.enqueueInput(staleDelivered)).reason).toBe('DUPLICATE');
    r.step(resumeAt + 3100);
    expect(r.session().judgement.processedBeforeUs).toBe(b + 1);
    const releaseAt = resumeAt + 3050 + 650;
    value(r.controller.enqueueInput({
      ...rehold, eventId: 'rehold-up', clockGeneration: r.session().generation, action: 'UP', sequence: 1002,
      songTimeUs: us(4_750_000), judgeTimeUs: us(4_750_000), eventPerformanceMs: ms(releaseAt), receivedPerformanceMs: ms(releaseAt),
    }));
    r.step(releaseAt + 51);
    expect(r.controller.getRenderSnapshot().notes.find(note => note.type === 'HOLD' && note.targetUs === 4_750_000))
      .toMatchObject({ state: 'COMMITTED', judgement: 'PERFECT' });
    r.controller.dispose();
  });

  it.each([false, true])('再保持解除の遅着を新世代の正式確定有無に応じて処理する (確定済み=%s)', async committed => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    const b = 4_100_000;
    const pauseAt = zeroTime + b / 1000;
    const initial = r.session();
    for (const input of r.ideal().filter(input => input.judgeTimeUs <= b)) value(r.controller.enqueueInput(input));
    r.step(pauseAt);
    value(await r.controller.dispatch({ kind: 'PAUSE_GAME', sessionId: initial.sessionId, requestId: 'pause' }));
    r.step(pauseAt + 50.001);
    r.at(10_000);
    value(await r.controller.dispatch({ kind: 'RESUME_GAME', sessionId: initial.sessionId, requestId: 'resume' }));
    const hold: NormalizedInput = {
      eventId: 'resume-down', sessionId: initial.sessionId, clockGeneration: initial.generation,
      inputId: 'new-owner', lane: 1, action: 'DOWN', sequence: 1001,
      eventPerformanceMs: ms(10_000), receivedPerformanceMs: ms(10_000), songTimeUs: us(b), judgeTimeUs: us(b),
    };
    value(r.controller.enqueueInput(hold));
    r.step(13_000);
    const official = r.session().judgement.official;
    // Native anchor takes effect at 13050ms. Deliberately vary whether the generation is already committed.
    if (committed) r.step(13_050);
    const result = r.controller.enqueueInput({
      ...hold, eventId: 'resume-up', action: 'UP', sequence: 1002,
      eventPerformanceMs: ms(13_049.999), receivedPerformanceMs: ms(13_050.001),
    });
    if (committed) {
      expect(result).toMatchObject({ ok: false, error: { code: 'ERR-007', messageKey: 'input.lateReholdRelease' } });
      expect(r.session()).toMatchObject({ state: 'ERROR', judgement: { official } });
    } else {
      expect(result).toMatchObject({ ok: true });
      expect(r.session()).toMatchObject({
        state: 'REHOLD_WAIT', generation: initial.generation, songTimeUs: b, judgement: { official },
      });
      expect(r.audio.stop).toHaveBeenCalledWith(expect.objectContaining({ generation: initial.generation + 1 }));
      r.step(13_150);
      expect(r.session().state).toBe('REHOLD_WAIT');
    }
    expect(r.controller.getFinalResult()).toBeNull();
    r.controller.dispose();
  });

  it('再開予約中の新世代音声中断を受け、旧世代のPAUSEDに安全復帰する', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    r.step(zeroTime + 300);
    const previous = r.session();
    value(await r.controller.dispatch({ kind: 'PAUSE_GAME', sessionId: previous.sessionId, requestId: 'pause' }));
    r.step(zeroTime + 351);
    r.at(5000);
    value(await r.controller.dispatch({ kind: 'RESUME_GAME', sessionId: previous.sessionId, requestId: 'resume' }));
    r.step(8000);
    expect(r.starts).toHaveLength(2);
    expect(r.session()).toMatchObject({ state: 'RESUMING', generation: previous.generation });
    r.interrupt(8001);
    expect(r.session()).toMatchObject({ state: 'PAUSED', generation: previous.generation, error: { code: 'ERR-004' } });
    r.step(8051);
    expect(r.session().state).toBe('PAUSED');
    expect(r.controller.getFinalResult()).toBeNull();
    r.controller.dispose();
  });

  it('setItem成功後の読戻し失敗は同じpendingで確認し、二重加算しない', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    r.failNextReadback();
    r.finishIdeal();
    await waitSave(r, 'SAVE_ERROR');
    expect(r.writes()).toBe(2);
    r.restoreReads();
    value(await r.controller.dispatch({ kind: 'RETRY_SAVE', sessionId: r.session().sessionId, requestId: 'retry' }));
    await waitSave(r, 'SAVED');
    expect(r.controller.store.getSnapshot()).toMatchObject({ saveStatus: 'SAVED', error: null });
    expect(r.writes()).toBe(2);
    expect(r.storage.read().data?.records[trial.chartId]?.clear?.clearCount).toBe(1);
    r.controller.dispose();
  });

  it('練習はlife 0でも完了し、教材進捗だけを更新する', async () => {
    const r = rig();
    value(await r.lifecycle('PAGESHOW'));
    expect(r.controller.navigate('MENU')).toBe(true);
    expect(r.controller.navigate('TUTORIAL')).toBe(true);
    r.controller.prepareTutorial('TUT-01');
    await Promise.resolve();
    value(await r.controller.dispatch({ kind: 'START_TUTORIAL', tutorialId: 'TUT-01', sessionId: null, requestId: 'practice' }));
    r.step(1000);
    r.enterPlayback();
    r.step(zeroTime + 3000);
    expect(r.session()).toMatchObject({ state: 'PLAYING', judgement: { lifeUnits: 0 } });
    r.at(zeroTime + 24_000);
    r.ended();
    r.step(zeroTime + 24_051);
    expect(r.session()).toMatchObject({ state: 'CLEAR', mode: 'PRACTICE' });
    expect(r.controller.getFinalResult()).toBeNull();
    await vi.waitFor(() => expect(r.storage.read().data?.progress.completedTutorialIds).toEqual(['TUT-01']));
    expect(r.storage.read().data).toMatchObject({ records: {}, collection: {}, achievements: [], commitReceipt: null });
    r.controller.dispose();
  });

  it('未解決結果を選曲閲覧から復元し、書込み失敗後に同じ結果を再試行', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    r.interfereWrite();
    r.finishIdeal();
    await waitSave(r, 'SAVE_ERROR');
    const sealed = r.controller.getFinalResult();
    expect(r.controller.navigate('MUSIC_SELECT')).toBe(true);
    expect(await r.controller.dispatch({ kind: 'START_GAME', sessionId: null, requestId: 'blocked' }))
      .toMatchObject({ ok: false, error: { code: 'ERR-013' } });
    expect(r.controller.navigate('RESULT')).toBe(true);
    expect(r.controller.getFinalResult()).toBe(sealed);
    r.restoreWrites();
    value(await r.controller.dispatch({ kind: 'RETRY_SAVE', sessionId: r.session().sessionId, requestId: 'retry' }));
    await waitSave(r, 'SAVED');
    expect(JSON.parse(r.raw()!).records[trial.chartId].clear.clearCount).toBe(1);
    r.controller.dispose();
  });

  it('所有権喪失直後、Web Locks解放完了を待たずに正式封印を遮断する', async () => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    for (const input of r.ideal()) value(r.controller.enqueueInput(input));
    r.at(zeroTime + 24_000);
    const invalidation = r.lifecycle('LOCK_LOST');
    r.ended();
    r.step(zeroTime + 24_051);
    expect(r.session().state).toBe('ERROR');
    expect(r.controller.getFinalResult()).toBeNull();
    value(await invalidation);
    expect(r.writer.currentLease()).toBeNull();
    expect(r.writes()).toBe(1);
    expect(r.storage.read().pending).toBeNull();
    r.controller.dispose();
  });

  it.each([false, true])('BFCache復帰後に既保存のreceiptを再確認する (復帰時の読込失敗=%s)', async failedOnShow => {
    const r = rig();
    await r.start();
    r.enterPlayback();
    r.failNextReadback();
    r.finishIdeal();
    await waitSave(r, 'SAVE_ERROR');
    const final = r.controller.getFinalResult()!;
    const originalLease = r.writer.currentLease();
    value(await r.lifecycle('PAGEHIDE'));
    if (!failedOnShow) r.restoreReads();
    value(await r.lifecycle('PAGESHOW'));
    if (failedOnShow) {
      expect(r.storage.read().error).toMatchObject({ code: 'ERR-016' });
      r.restoreReads();
    }
    expect(r.controller.read().session).toBeNull();
    expect(r.writer.currentLease()?.generation).toBeGreaterThan(originalLease?.generation ?? -1);
    expect(r.controller.navigate('RESULT')).toBe(true);
    expect(r.controller.getFinalResult()).toBe(final);
    expect(r.controller.getRenderSnapshot().sessionId).toBeNull();
    expect(r.controller.store.getSnapshot()).toMatchObject({ sessionId: final.sessionId, state: 'CLEAR', saveStatus: 'SAVE_ERROR' });
    const stored = r.raw();
    value(await r.controller.dispatch({ kind: 'DISCARD_RESULT', sessionId: final.sessionId, confirmed: true, requestId: 'reconcile' }));
    expect(r.storage.read().saveStatus).toBe('SAVED');
    expect(r.controller.store.getSnapshot()).toMatchObject({ saveStatus: 'SAVED', error: null });
    expect(r.raw()).toBe(stored);
    expect(r.writes()).toBe(2);
    r.controller.dispose();
  });

  it('無補正16拍で+5msを提案し、確認のある操作だけが設定を永続化する', async () => {
    const r = rig();
    value(await r.lifecycle('PAGESHOW'));
    expect(r.controller.navigate('MENU')).toBe(true);
    expect(r.controller.navigate('SETTINGS')).toBe(true);
    r.at(1000);
    value(await r.controller.dispatch({ kind: 'START_CALIBRATION', sessionId: null, requestId: 'start-cal' }, true));
    const anchor = r.starts[0]!;
    for (let i = 4; i < 16; i++) {
      const timing = i * 600_000 + 5_000;
      value(r.controller.enqueueInput({
        eventId: `cal-${i}`, sessionId: anchor.sessionId, clockGeneration: anchor.generation,
        inputId: 'key', action: 'DOWN', lane: 1, eventPerformanceMs: ms(1000 + timing / 1000), receivedPerformanceMs: ms(1000 + timing / 1000),
        songTimeUs: us(timing), judgeTimeUs: us(timing), sequence: i,
      }));
    }
    r.step(10_350);
    expect(r.controller.read().calibration).toBeNull();
    r.step(10_350.001);
    expect(r.controller.read().calibration).toMatchObject({ kind: 'PROPOSED', proposedOffsetMs: 5 });
    expect(r.storage.read().data?.settings.timingOffsetMs).toBe(0);
    expect(await r.controller.dispatch({ kind: 'APPLY_CALIBRATION', offsetMs: 0, confirmed: true, sessionId: null, requestId: 'wrong' })).toMatchObject({ ok: false });
    value(await r.controller.dispatch({ kind: 'APPLY_CALIBRATION', offsetMs: 5, confirmed: true, sessionId: null, requestId: 'valid' }));
    expect(r.storage.read().data?.settings.timingOffsetMs).toBe(5);
    expect(r.controller.read().screen).toBe('SETTINGS');
    r.controller.dispose();
  });
});
