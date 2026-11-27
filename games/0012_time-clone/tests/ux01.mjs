import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert, { measure } from './evidence.mjs';
import { setup, startBrowser } from './browser-cases.mjs';
import { fixtureStage, fixtures, golden, TestAdapter } from './adapter.mjs';
import { SAVE_KEY } from '../src/progress.mjs';

const [directory] = process.argv.slice(2);
assert(directory, 'usage: node tests/ux01.mjs EVIDENCE_DIRECTORY');
const evidenceDir = resolve(directory);
const historicalDir = dirname(evidenceDir);
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const testedSHA = git('rev-parse', 'HEAD');
const reportPath = join(evidenceDir, 'ux01-results.json');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const loc = (f, id) => f.page.locator('#' + id);
const text = (f, id) => loc(f, id).textContent();
const attr = (f, name) => loc(f, 'game').getAttribute('data-' + name);
const visible = (f, id) => loc(f, id).isVisible();
const activeId = f => f.page.evaluate(() => document.activeElement.id);
const title = f => text(f, 'tutorial-title');
const primary = f => f.click('primary');
const help = f => f.click('show-tutorial');
const skip = f => f.click('tutorial-skip');
const next = f => f.click('tutorial-next');
const player = f => f.page.locator('.marker.player').evaluate(marker =>
  [Number(marker.parentElement.dataset.x), Number(marker.parentElement.dataset.y)]);
const phases = ['READY', 'RECORDING', 'RECORDED', 'REPLAYING', 'SOLO_CONTINUE', 'CLEARED'];

async function observeSession(f) {
  await f.page.evaluate(async () => {
    const { Session } = await import('/src/runtime.mjs');
    const canMove = Object.getOwnPropertyDescriptor(Session.prototype, 'canMove');
    globalThis.uxProbe = { attempts: [], pauses: [] };
    Object.defineProperty(Session.prototype, 'canMove', {
      ...canMove,
      get() {
        globalThis.uxProbe.session = this;
        return canMove.get.call(this);
      }
    });
    const press = Session.prototype.press;
    Session.prototype.press = function (...args) {
      globalThis.uxProbe.attempts.push(args);
      return press.apply(this, args);
    };
    const pause = Session.prototype.pause;
    Session.prototype.pause = function (...args) {
      globalThis.uxProbe.pauses.push(args[0]);
      return pause.apply(this, args);
    };
  });
}

const observe = f => f.page.evaluate(() => {
  const { session, attempts, pauses } = globalThis.uxProbe;
  const { state, logicalTick, resumeRequired, reasons, input, canMove } = session;
  return { state, logicalTick, resumeRequired, reasons: [...reasons], input: input.snapshot(), canMove, attempts, pauses };
});

async function record(f, actions) {
  await primary(f);
  for (const action of actions) await f.step(action);
  await primary(f);
}
function pointer(f, type, id = 1) {
  return f.page.locator('[data-direction="R"]').dispatchEvent(type, {
    pointerId: id, pointerType: 'touch', button: 0, bubbles: true
  });
}

const cases = [
  ['Stage 1の初回選択とページ内表示済み', async f => {
    assert.equal(await visible(f, 'tutorial'), false);
    await f.choose();
    assert.equal(await title(f), 'ゴールを目指そう！');
    assert.equal(await attr(f, 'phase'), 'READY');
    await skip(f);
    await f.click('return');
    await f.choose();
    assert.equal(await visible(f, 'tutorial'), false);
    await f.page.reload();
    await f.choose();
    assert.equal(await visible(f, 'tutorial'), true);
  }],
  ['3画面の進行、戻る、スキップと完了', async f => {
    await f.choose();
    assert.equal(await text(f, 'tutorial-description'), '緑色のプレイヤーを◎まで進めればクリア！ スイッチを踏むと扉が開くよ。');
    assert.equal(await visible(f, 'tutorial-back'), false);
    await next(f);
    assert.equal(await title(f), '自分の動きを記録！');
    assert.equal(await text(f, 'tutorial-description'), 'まず最大16枠の動きを記録しよう。記録を終えると、同じ動きを繰り返す分身が作れるよ。');
    await next(f);
    assert.equal(await title(f), '分身と協力しよう！');
    assert.equal(await text(f, 'tutorial-description'), '分身にスイッチを任せて、自分はゴールへ！ 行き詰まったら再挑戦や再記録でやり直せるよ。');
    assert.equal(await text(f, 'tutorial-next'), 'ステージへ進む');
    await f.click('tutorial-back');
    assert.equal(await text(f, 'tutorial-step'), '2 / 3');
    await skip(f);
    assert.equal(await visible(f, 'tutorial'), false);
    await help(f);
    await next(f);
    await next(f);
    await next(f);
    assert.equal(await visible(f, 'tutorial'), false);
  }],
  ['説明中の状態と予約、時計の不変', async f => {
    await observeSession(f);
    await f.choose();
    const before = await observe(f);
    await f.page.keyboard.press('ArrowRight');
    await pointer(f, 'pointerdown');
    await f.page.clock.runFor(1500);
    await next(f);
    assert.deepEqual(await observe(f), before);
    assert.deepEqual(before.input, { queue: [], held: [], suppressed: [] });
    assert.equal(before.logicalTick, 0);
    assert.equal(before.resumeRequired, false);
  }],
  ['閉じた後のREADYと記録の手動開始', async f => {
    await f.choose();
    await next(f);
    await next(f);
    await next(f);
    await f.page.clock.runFor(2000);
    assert.equal(await attr(f, 'phase'), 'READY');
    assert.equal(await attr(f, 'tick'), '0');
    assert.equal(await text(f, 'primary'), '記録を開始');
    await primary(f);
    assert.equal(await attr(f, 'phase'), 'RECORDING');
  }],
  ['クリア条件と分身消滅後の説明', async f => {
    await f.choose();
    await next(f);
    assert.match(await text(f, 'tutorial-detail'), /◎に着いても記録が続きます/);
    await next(f);
    assert.match(await text(f, 'tutorial-detail'), /再生中や一人で続行中に、プレイヤー自身が◎に着くとクリア/);
    assert.match(await text(f, 'tutorial-detail'), /時間切れでゲームオーバーにはなりません/);
    await skip(f);
    const model = new TestAdapter(fixtureStage(fixtures[2]));
    const atGoalWhileRecording = model.record('R'.repeat(16)).at(-1);
    assert.deepEqual(atGoalWhileRecording.checkpoint.playerPosition, model.stage.goal);
    assert.equal(atGoalWhileRecording.state.clearResult, null);
    assert.equal(atGoalWhileRecording.state.phase, 'RECORDED');
    assert.equal(model.replay('R'.repeat(16)).at(-1).state.phase, 'CLEARED');
    await primary(f);
    await f.page.clock.runFor(16 * 500);
    assert.equal(await attr(f, 'phase'), 'RECORDED');
    await primary(f);
    await f.page.clock.runFor(16 * 500);
    assert.equal(await attr(f, 'phase'), 'SOLO_CONTINUE');
    assert.equal(await visible(f, 'result'), false);
    assert.match(await text(f, 'guide'), /引き続き操作でき/);
  }],
  ['再挑戦と再記録の説明・実動作', async f => {
    await observeSession(f);
    await f.choose();
    await skip(f);
    await record(f, ['R','R']);
    await primary(f);
    const recorded = (await observe(f)).state.ghostRecord;
    assert.match(await text(f, 'retry-help'), /今の記録を使って/);
    assert.match(await text(f, 'rerecord-help'), /今の記録を破棄/);
    await f.click('retry');
    assert.equal(await attr(f, 'phase'), 'RECORDED');
    assert.deepEqual((await observe(f)).state.ghostRecord, recorded);
    await f.click('rerecord');
    assert.equal(await attr(f, 'phase'), 'RECORDING');
    assert.equal((await observe(f)).state.ghostRecord, null);
  }],
  ['READY・RECORDED・CLEAREDでの再表示', async f => {
    await observeSession(f);
    await f.choose();
    await skip(f);
    for (const phase of ['READY','RECORDED','CLEARED']) {
      assert.equal(await attr(f, 'phase'), phase);
      await help(f);
      const before = await observe(f);
      await f.page.clock.runFor(1000);
      await skip(f);
      assert.deepEqual(await observe(f), before);
      assert.equal(before.resumeRequired, false);
      assert.deepEqual(before.pauses, []);
      if (phase === 'READY') await record(f, ['R','R']);
      if (phase === 'RECORDED') {
        await primary(f);
        for (const action of golden[0].replayActions) await f.step(action);
      }
    }
    await f.click('next');
    assert.match(await text(f, 'level-title'), /ステージ 2/);
    await help(f);
    assert.equal(await title(f), 'ゴールを目指そう！');
  }],
  ['記録・再生・単独続行中の安全停止', async f => {
    await observeSession(f);
    await f.choose();
    await skip(f);
    await primary(f);
    for (const phase of ['RECORDING','REPLAYING','SOLO_CONTINUE']) {
      assert.equal(await attr(f, 'phase'), phase);
      await f.page.keyboard.press('ArrowRight');
      const before = await observe(f);
      assert.equal(before.input.queue.length, 1);
      await help(f);
      const stopped = await observe(f);
      assert.deepEqual(stopped.state, before.state);
      assert.deepEqual(stopped.reasons, ['USER']);
      assert.equal(stopped.resumeRequired, true);
      assert.deepEqual(stopped.input.queue, []);
      await f.page.clock.runFor(1500);
      assert.deepEqual(await observe(f), stopped);
      await skip(f);
      await primary(f);
      if (phase === 'RECORDING') {
        await primary(f);
        await primary(f);
      }
      if (phase === 'REPLAYING') await f.page.clock.runFor(8000);
    }
  }],
  ['既存停止理由・複合停止と明示再開', async f => {
    await observeSession(f);
    await f.choose();
    await skip(f);
    await primary(f);
    await f.click('pause');
    await f.page.evaluate(() => {
      globalThis.uxProbe.session.pause('PERFORMANCE');
      globalThis.uxProbe.session.visibility(true);
    });
    const stopped = await observe(f);
    await help(f);
    await skip(f);
    assert.deepEqual(await observe(f), stopped);
    assert.deepEqual(stopped.reasons, ['USER','PERFORMANCE','HIDDEN']);
    assert.equal(await loc(f, 'primary').isDisabled(), true);
    await f.page.evaluate(() => globalThis.uxProbe.session.visibility(false));
    await f.page.clock.runFor(1500);
    assert.deepEqual((await observe(f)).reasons, ['USER','PERFORMANCE']);
    assert.equal(await attr(f, 'tick'), '0');
    assert.equal(await text(f, 'primary'), '再開');
    await primary(f);
    await f.tick();
    assert.equal(await attr(f, 'tick'), '1');
  }],
  ['ガイド中のキーボード・ポインター・背景操作の抑止', async f => {
    await observeSession(f);
    await f.choose();
    await skip(f);
    await primary(f);
    await help(f);
    const stopped = await observe(f);
    await f.page.keyboard.press('ArrowRight');
    await f.page.keyboard.press('KeyW');
    await pointer(f, 'pointerdown');
    await pointer(f, 'pointercancel');
    await loc(f, 'primary').evaluate(button => button.click());
    await loc(f, 'rearm').evaluate(button => button.click());
    await f.page.clock.runFor(1500);
    assert.deepEqual(await observe(f), stopped);
    assert.deepEqual(stopped.attempts, []);
    assert.equal(await visible(f, 'confirmation'), false);
  }],
  ['終了後に旧押下を採用せず新規入力で復帰', async f => {
    await observeSession(f);
    await f.choose();
    await skip(f);
    await primary(f);
    await f.page.keyboard.down('ArrowRight');
    await pointer(f, 'pointerdown', 4);
    await help(f);
    const stopped = await observe(f);
    assert.deepEqual(stopped.input.suppressed, ['key:ArrowRight', 'pointer:4']);
    await pointer(f, 'pointerup', 4);
    await f.page.keyboard.down('ArrowRight');
    assert.deepEqual(await observe(f), stopped);
    await skip(f);
    assert.deepEqual((await observe(f)).input.suppressed, ['key:ArrowRight']);
    await primary(f);
    await f.page.keyboard.down('ArrowRight');
    await f.tick();
    assert.deepEqual(await player(f), [1,1]);
    await f.page.keyboard.up('ArrowRight');
    await pointer(f, 'pointerdown', 4);
    await pointer(f, 'pointerup', 4);
    await f.tick();
    assert.deepEqual(await player(f), [2,1]);
    await f.step('R');
    assert.deepEqual(await player(f), [3,1]);
  }],
  ['Tab循環・Enter・Space・Escとフォーカス復帰', async f => {
    await f.choose();
    assert.equal(await loc(f, 'tutorial').getAttribute('aria-labelledby'), 'tutorial-title');
    assert.equal(await loc(f, 'tutorial').getAttribute('aria-describedby'), 'tutorial-description tutorial-detail');
    assert.equal(await activeId(f), 'tutorial-title');
    await f.page.keyboard.press('Shift+Tab');
    assert.equal(await activeId(f), 'tutorial-skip');
    await f.page.keyboard.press('Tab');
    assert.equal(await activeId(f), 'tutorial-next');
    await f.page.keyboard.press('Enter');
    assert.equal(await activeId(f), 'tutorial-title');
    await f.page.keyboard.press('Tab');
    await f.page.keyboard.press('Space');
    assert.equal(await title(f), '分身と協力しよう！');
    await f.page.keyboard.press('Escape');
    assert.equal(await activeId(f), 'level-title');
    await loc(f, 'show-tutorial').focus();
    await f.page.keyboard.press('Enter');
    await f.page.keyboard.press('Escape');
    assert.equal(await activeId(f), 'show-tutorial');
  }],
  ['320px・44pxターゲット・タッチ完了', async f => {
    const checkLayout = async () => {
      const metrics = await loc(f, 'tutorial').evaluate(dialog => ({
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        fits: dialog.getBoundingClientRect().left >= 0 && dialog.getBoundingClientRect().right <= innerWidth,
        buttons: [...dialog.querySelectorAll('button:not([hidden])')].map(button => {
          const { width, height } = button.getBoundingClientRect();
          return { width, height };
        })
      }));
      assert.equal(metrics.viewport, 320);
      assert.equal(metrics.pageWidth, 320);
      assert.equal(metrics.fits, true);
      for (const button of metrics.buttons) {
        assert.equal(button.width >= 44, true);
        assert.equal(button.height >= 44, true);
      }
    };
    await f.page.locator('[data-stage="1"]').tap();
    for (let step = 1; step <= 3; step++) {
      await checkLayout();
      if (step === 3) await f.page.screenshot({ path: join(evidenceDir, 'UX01-13-320px.png') });
      await loc(f, 'tutorial-next').tap();
    }
    assert.equal(await attr(f, 'phase'), 'READY');
    await loc(f, 'primary').tap();
    assert.equal(await attr(f, 'phase'), 'RECORDING');
  }, { mobile: true }],
  ['保存キー・既存スキーマと二段階確認の保護', async f => {
    const storage = () => f.page.evaluate(() => Object.entries(localStorage).sort());
    const before = await storage();
    await f.choose();
    assert.equal(await visible(f, 'tutorial'), false);
    await help(f);
    await next(f);
    await skip(f);
    await f.page.reload();
    await f.choose();
    assert.deepEqual(await storage(), before);
    assert.deepEqual(before, [[SAVE_KEY, '{"schemaVersion":1,"stages":{"1":{"cleared":true,"bestStars":2,"minMoves":9}}}'], ['other-game','sentinel']]);
    const corruptContext = await setup(engine, { raw: '{broken', dismissTutorial: false });
    try {
      await corruptContext.choose();
      await loc(corruptContext, 'reset-save').evaluate(button => button.click());
      assert.equal(await visible(corruptContext, 'confirmation'), false);
      await skip(corruptContext);
      await corruptContext.click('reset-save');
      await loc(corruptContext, 'show-tutorial').evaluate(button => button.click());
      assert.equal(await visible(corruptContext, 'tutorial'), false);
      await corruptContext.click('confirm');
      await loc(corruptContext, 'confirmation').getByRole('heading', { name: '初期化の最終確認' }).waitFor();
      await corruptContext.page.keyboard.press('Escape');
      assert.equal(await corruptContext.stored(), '{broken');
    } finally {
      await corruptContext.context.close();
    }
  }, { raw: '{"schemaVersion":1,"stages":{"1":{"cleared":true,"bestStars":2,"minMoves":9}}}' }],
  ['Stage 1の a → D の案内と扉の実測', async f => {
    await f.choose();
    assert.match(await text(f, 'tutorial-detail'), /スイッチ a を踏んでいる間、扉 D が開きます/);
    await skip(f);
    assert.match(await text(f, 'mechanisms'), /a → D 閉/);
    await primary(f);
    await f.step('R');
    await f.step('R');
    assert.match(await text(f, 'mechanisms'), /a → D 開/);
    await f.step('R');
    assert.match(await text(f, 'mechanisms'), /a → D 閉/);
  }],
  ['フェーズ案内と画面の実状態', async f => {
    const guidance = async (phase, message) => {
      assert.equal(await attr(f, 'phase'), phase);
      assert.match(await text(f, 'guide'), message);
    };
    await f.choose();
    await guidance(phases[0], /まず「記録を開始」/);
    await primary(f);
    await guidance(phases[1], /最大16枠.*途中でも終えられます/);
    await f.step('D');
    await f.step('D');
    await f.step('R');
    await primary(f);
    await guidance(phases[2], /「分身を再生」.*協力/);
    await primary(f);
    await guidance(phases[3], /プレイヤー自身をゴール◎/);
    for (const action of golden[5].replayActions.slice(0,16)) await f.step(action);
    await guidance(phases[4], /分身は16枠で消滅.*引き続き操作/);
    for (const action of golden[5].replayActions.slice(16)) await f.step(action);
    await guidance(phases[5], /クリア！.*次のステージ/);
    assert.equal(await visible(f, 'next'), true);
    assert.equal(await visible(f, 'result'), true);
  }, { level: 5 }],
  ['既存品質ゲートの実測照合', () => {
    const t1 = json(join(evidenceDir,'t1-and-boundary-results.json'));
    assert.equal(t1.testedSHA, testedSHA);
    const tally = (rows, status) => rows.filter(row => row.status === status).length;
    assert.equal(tally(t1.results.filter(x => x.group === 'T1'), 'PASS'), 179);
    assert.equal(tally(t1.results.filter(x => x.group === 'T1'), 'NOT_RUN'), 11);
    assert.equal(tally(t1.results.filter(x => x.group === 'T2-R01-boundary'), 'PASS'), 10);
    assert.equal(tally(t1.results.filter(x => /^BROWSER-GC-0[1-7]$/.test(x.testId)), 'PASS'), 7);
    assert.equal(t1.results.find(x => x.testId === 'T1-H01').status,'PASS');
    assert.equal(t1.summary.t1MandatoryP0.PASS, 153);
    for (const file of ['t2-oracle-results.json','t2-runtime-results.json']) {
      const check = json(join(evidenceDir,file));
      assert.equal(check.testedSHA, testedSHA);
      assert.equal(check.results.length, 10);
      assert.equal(tally(check.results, 'PASS'), 10);
    }
    const audit = json(join(evidenceDir,'p0-evidence-audit.json'));
    assert.equal(audit.status, 'PASS');
    assert.equal(audit.testedSHA, testedSHA);
  }],
  ['旧FAIL保全と新SHAの例外再審査', () => {
    const archive = join(historicalDir,'game-0012-t2-r02','additional-review-results.json');
    const bytes = readFileSync(archive);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '21c8bd48c7aa0df41ca34ca2e1b514146596e143686fc23a4036f28a71807fdd');
    const historical = JSON.parse(bytes);
    const current = json(join(evidenceDir,'t2-r02-replay-results.json'));
    assert.equal(historical.testedSHA, '85d0f42a44aebf6c464fa880194bb34c1c23c18b');
    assert.equal(current.testedSHA, testedSHA);
    assert.notEqual(current.testedSHA, historical.testedSHA);
    assert.deepEqual(current.results.map(({ issue, ...row }) => row), historical.results.map(({ issue, ...row }) => row));
    const priorAcceptance = git('show','7d323a5b87a3729fc405ab0ce1c38e00a1d7595a:handoffs/game-0012/t2/T2-conditional-acceptance.md');
    assert.match(priorAcceptance, /CLOSED_WITH_EXCEPTION/);
    assert.match(priorAcceptance, /APPROVED_WITH_LIMITATIONS/);
    const failures = historical.results.filter(x => x.status === 'FAIL');
    assert.equal(failures.length, 2);
    assert(failures.every(x => x.id.endsWith('STALE-CANCEL-AFTER-REUSE')));
    return { historicalTestedSHA: historical.testedSHA, newTestedSHA: testedSHA,
      exceptionForNewSHA: 'PENDING_INDEPENDENT_REVIEW_AND_USER_APPROVAL', failures };
  }]
];

const report = {
  testedSHA, worktreeStatus: git('status','--porcelain'), environment: { node: process.version },
  results: cases.map(([name], i) => ({ testId: 'UX01-' + String(i + 1).padStart(2, '0'), name, status: 'NOT_RUN' }))
};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save();
if (process.argv.includes('--plan-only')) process.exit(0);

const engine = await startBrowser();
report.environment.chromium = engine.browser.version();
report.environment.platform = process.platform;
try {
  for (const [i, [, run, options]] of cases.entries()) {
    const result = report.results[i];
    const time = new Date().toISOString();
    const { actual, failed, stack } = await measure(async () => {
      if (i >= 16) return run();
      const f = await setup(engine, { dismissTutorial: false, ...options });
      try {
        const outcome = await run(f);
        assert.deepEqual(f.errors, []);
        return outcome;
      } finally {
        await f.context.close();
      }
    });
    Object.assign(result, { time, testedSHA, actual, status: failed ? 'FAIL' : 'PASS', ...(stack && { stack }) });
    console.log(result.status, result.testId, stack ?? result.name);
    save();
  }
} finally {
  await engine.close();
}
if (report.results.some(x => x.status !== 'PASS')) process.exitCode = 1;
