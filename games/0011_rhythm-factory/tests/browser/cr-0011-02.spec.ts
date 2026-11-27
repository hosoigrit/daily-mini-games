import { expect, test } from '@playwright/test';
import type { RenderSnapshot } from '../../src/contracts/interface_contracts';
import { installControlledReplay, scheduleControlledReplay } from './fixtures/a2dr1-replay';

const mount = '/daily-mini-games/games/0011_rhythm-factory/';
const app = `http://127.0.0.1:4174${mount}?stage-a2d-diagnostics=1`;

interface PaintedNote {
  readonly label: string;
  readonly lane: number;
  readonly fromLine: number;
  readonly alpha: number;
}

interface PaintedFrame {
  readonly judgeUs: number;
  readonly notes: readonly PaintedNote[];
}

for (const mode of ['FORMAL', 'PRACTICE'] as const) {
  test(`CR02-T16 / ${mode}: judgement results change the rendered notes on the game route`, async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Uses the fixed R1 controlled browser clock.');
    test.setTimeout(45_000);
    await installControlledReplay(page);
    await page.addInitScript(() => {
      let notes: PaintedNote[] = [];
      let judgeUs = 0;
      const frames: PaintedFrame[] = [];
      Reflect.set(window, 'cr02Frames', frames);
      window.addEventListener('stage-a2d:clock', event => {
        judgeUs = (event as CustomEvent<{ judgeTimeUs: number }>).detail.judgeTimeUs;
      });
      const fillRect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
        if (this.canvas.matches('.trial-canvas') && x === 0 && y === 0 && this.fillStyle === '#0d171b') notes = [];
        fillRect.call(this, x, y, width, height);
      };
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        if (this.canvas.matches('.trial-canvas')) {
          const { width, height } = this.canvas.getBoundingClientRect();
          notes.push({ label: text, lane: 1 + Math.floor(x * 4 / width), fromLine: y - height * 0.8, alpha: this.globalAlpha });
        }
        if (maxWidth === undefined) fillText.call(this, text, x, y);
        else fillText.call(this, text, x, y, maxWidth);
      };
      window.addEventListener('stage-a2d:frame', () => {
        if (judgeUs < 1_300_000) frames.push({ judgeUs, notes: [...notes] });
      });
    });
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    await page.goto(app);
    await button('メニューへ').click();
    if (mode === 'FORMAL') {
      await button('曲を選ぶ').click();
      await button('音源を準備').click();
    } else {
      await button('練習').click();
      await button('練習音源を準備').click();
    }
    const start = button(mode === 'FORMAL' ? '演奏を始める' : '練習を始める');
    await expect(start).toBeEnabled({ timeout: 30_000 });
    await start.click();
    await expect(page.locator('main[data-screen="GAME"]')).toHaveAttribute('data-mode', mode);
    await scheduleControlledReplay(page, [
      { judgeUs: 0, type: 'keydown', key: 'd' }, { judgeUs: 50_000, type: 'keyup', key: 'd' },
    ]);
    await page.waitForFunction(() => (Reflect.get(window, 'cr02Frames') as PaintedFrame[]).some(frame => frame.judgeUs >= 1_050_000));
    const frames = await page.evaluate(() => Reflect.get(window, 'cr02Frames') as PaintedFrame[]);
    const firstTapAtLine = (frame: PaintedFrame) => frame.notes.some(note =>
      note.label === 'TAP' && note.lane === 1 && Math.abs(note.fromLine) < 1);
    expect(frames.some(frame => frame.judgeUs === 0 && firstTapAtLine(frame))).toBe(true);
    const afterSuccess = frames.filter(frame => frame.judgeUs >= 110_000 && frame.judgeUs <= 350_000);
    expect(afterSuccess.length).toBeGreaterThan(0);
    expect(afterSuccess.some(frame => firstTapAtLine(frame) || frame.notes.some(note =>
      note.label === 'TAP' && note.lane === 1 && note.fromLine > 0))).toBe(false);
    // The second chart event (lane 3, 500 ms) receives no input.
    const lane3Tap = (frame: PaintedFrame) => frame.notes.find(note => note.label === 'TAP' && note.lane === 3 && note.fromLine >= 0);
    expect(frames.some(frame => frame.judgeUs >= 540_000 && frame.judgeUs < 690_000 && lane3Tap(frame)?.alpha === 1)).toBe(true);
    const dropped = frames.filter(frame => frame.judgeUs >= 700_000 && frame.judgeUs < 1_000_000)
      .map(lane3Tap).filter((note): note is PaintedNote => note !== undefined && note.alpha < 1);
    expect(dropped.length).toBeGreaterThan(2);
    expect(dropped[0]!.fromLine).toBeLessThan(14);
    expect(dropped.at(-1)!.fromLine).toBeGreaterThan(dropped[0]!.fromLine);
    expect(dropped.at(-1)!.alpha).toBeLessThan(dropped[0]!.alpha);
    await info.attach(`game-route-${mode.toLowerCase()}`, { body: JSON.stringify(frames), contentType: 'application/json' });
  });
}

type ProofFrame = Pick<RenderSnapshot, 'judgeTimeUs' | 'notes'>;
type ProofCase = { title: string; before: ProofFrame; after: ProofFrame };
type Note = RenderSnapshot['notes'][number];

const us = (n: number) => n as RenderSnapshot['judgeTimeUs'];

function note(id: string, type: Note['type'], lane: Note['lane'], target: number, extra: Partial<Note> = {}): Note {
  return { noteId: id, eventId: id, type, lane, targetUs: us(target), endUs: null,
    state: 'PENDING', judgement: null, ...extra };
}

test('CR02-T04/08/12/13: renderer screenshots show success, MISS, HOLD, CHORD and RAPID', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Single browser for deterministic visual evidence.');
  await page.setViewportSize({ width: 1100, height: 1150 });
  const base = `http://127.0.0.1:4173${mount}`;
  const proofUrl = `${base}cr02-render-proof.html`;
  await page.route(proofUrl, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ja"><meta charset="utf-8"><body></body></html>' }));
  await page.goto(proofUrl);
  const tap = note('tap', 'TAP', 1, 1_000_000);
  const miss = note('miss', 'TAP', 2, 1_000_000, { state: 'COMMITTED', judgement: 'MISS' });
  const head = note('hold-start', 'HOLD', 2, 1_000_000, { noteId: 'hold', endUs: us(1_500_000), state: 'RESOLVED', judgement: 'GREAT' });
  const end = note('hold-end', 'HOLD', 2, 1_500_000, { noteId: 'hold', endUs: us(1_500_000) });
  const chord = note('chord-right', 'CHORD', 3, 1_000_000, { noteId: 'chord', state: 'COMMITTED', judgement: 'MISS' });
  const strike = note('rapid-hit', 'RAPID', 3, 1_000_000, { noteId: 'rapid', state: 'RESOLVED', judgement: 'GOOD' });
  const frame = (judge: number, ...notes: Note[]): ProofFrame => ({ judgeTimeUs: us(judge), notes });
  const cases: ProofCase[] = [
    { title: '01 判定待ち', before: frame(1_090_000, tap), after: frame(1_090_000, tap) },
    { title: '02 PERFECT 消失', before: frame(1_100_000, tap), after: frame(1_100_000, { ...tap, state: 'RESOLVED', judgement: 'PERFECT' }) },
    { title: '03 MISS 下へ通過', before: frame(1_210_000, miss), after: frame(1_300_000, miss) },
    { title: '04 HOLD 成功済み頭部と残存区間', before: frame(1_230_000, head, end), after: frame(1_230_000, head, end) },
    { title: '05 CHORD 左のみ成功・右MISS', before: frame(1_210_000, { ...chord, eventId: 'chord-left', lane: 1, judgement: 'GREAT' }, chord),
      after: frame(1_295_000, { ...chord, eventId: 'chord-left', lane: 1, judgement: 'GREAT' }, chord) },
    { title: '06 RAPID 成功1打のみ消失', before: frame(1_100_000, strike,
      note('rapid-next', 'RAPID', 3, 1_280_000, { noteId: 'rapid' }), note('rapid-last', 'RAPID', 3, 1_470_000, { noteId: 'rapid' })),
    after: frame(1_100_000, strike, note('rapid-next', 'RAPID', 3, 1_280_000, { noteId: 'rapid' }),
      note('rapid-last', 'RAPID', 3, 1_470_000, { noteId: 'rapid' })) },
  ];
  await page.evaluate(async ({ moduleUrl, cases }) => {
    const { mountTrialCanvas } = await import(moduleUrl) as typeof import('../../src/infrastructure/trial-canvas');
    document.body.style.cssText = 'background:#0d171b;color:#eff8f3;margin:24px;font:16px system-ui,sans-serif';
    const title = document.createElement('h1');
    title.textContent = 'リズムファクトリー · CR-0011-02 描画検証';
    document.body.append(title);
    const grid = document.createElement('section');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:16px';
    document.body.append(grid);
    const advance: Array<() => void> = [];
    for (const { title, before, after } of cases) {
      const panel = document.createElement('article');
      const heading = document.createElement('h2');
      heading.textContent = title;
      heading.style.cssText = 'font-size:16px;margin:0 0 6px';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:100%;height:290px';
      panel.append(heading, canvas);
      grid.append(panel);
      let frame = before;
      mountTrialCanvas(canvas, { getRenderSnapshot: () => ({
        ...frame, sessionId: title, generation: 1 as RenderSnapshot['generation'],
        songTimeUs: frame.judgeTimeUs, durationUs: 2_000_000 as RenderSnapshot['durationUs'],
        state: 'PLAYING', factoryId: null, activeHoldLanes: [], pressedLanes: [], noteSpeed: 1, effectQuality: 'NORMAL', progress: 0,
      }) });
      advance.push(() => { frame = after; });
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    for (const step of advance) step();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, { moduleUrl: `${base}src/infrastructure/trial-canvas.ts`, cases });
  await expect(page.locator('canvas')).toHaveCount(6);
  await info.attach('cr02-render-proof', { body: await page.screenshot(), contentType: 'image/png' });
});
