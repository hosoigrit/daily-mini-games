// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { Gen, RenderNote, RenderSnapshot, Us } from '../../src/contracts/interface_contracts';
import { mountTrialCanvas, trialNoteY } from '../../src/infrastructure/trial-canvas';
import { makeRenderFrame } from '../fixtures/render-frame';

const us = (value: number) => value as Us;

function note(type: RenderNote['type'], lane: RenderNote['lane'], target: number, fields?: Partial<RenderNote>): RenderNote {
  return Object.freeze({ eventId: `${type}-${lane}-${target}`, noteId: `${type}-${lane}`, lane, type,
    targetUs: us(target), endUs: null, state: 'PENDING', judgement: null, ...fields });
}

function snapshot(notes: readonly RenderNote[]): RenderSnapshot {
  const { startingSettings, ...state } = makeRenderFrame();
  return Object.freeze({ ...state, ...startingSettings, songTimeUs: us(1_200_000), judgeTimeUs: us(1_000_000),
    noteSpeed: 1, notes: Object.freeze([...notes]) });
}

function makeCanvas(width = 400, height = 300, dpr = 2) {
  const canvas = document.createElement('canvas');
  let size = { width, height };
  const getRect = vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, size.width, size.height));
  vi.stubGlobal('devicePixelRatio', dpr);
  const gradient = { addColorStop: vi.fn() };
  const context = {
    globalAlpha: 1,
    createLinearGradient: vi.fn(() => gradient),
    beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    lineTo: vi.fn(), moveTo: vi.fn(), roundRect: vi.fn(), setTransform: vi.fn(),
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const observe = vi.fn();
  const disconnect = vi.fn();
  let resize: ResizeObserverCallback | null = null;
  vi.stubGlobal('ResizeObserver', class {
    observe = observe;
    disconnect = disconnect;
    constructor(callback: ResizeObserverCallback) { resize = callback; }
  });

  return {
    canvas, context, gradient, frames, requestFrame, cancel, observe, disconnect, getRect,
    changeSize(width: number, height: number) {
      size = { width, height };
      resize?.([], {} as ResizeObserver);
    },
    frame(atMs: number) {
      const pending = frames.entries().next().value;
      if (!pending) throw new Error('Expected one pending frame');
      const [id, callback] = pending;
      frames.delete(id);
      callback(atMs);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses the judge clock and absolute target in CSS pixels with no accumulated frame movement', () => {
  expect(trialNoteY(us(1_000_000), us(1_000_000), 240, 1)).toBe(240);
  expect(trialNoteY(us(1_500_000), us(1_000_000), 240, 1)).toBe(80);
  expect(trialNoteY(us(500_000), us(1_000_000), 240, 0.5)).toBe(320);
  expect(trialNoteY(us(1_250_000), us(1_000_000), 240, 2)).toBe(80);

  const browser = makeCanvas();
  let current = snapshot([note('TAP', 1, 1_000_000)]);
  const read = vi.fn(() => current);
  const onFrame = vi.fn<(atMs: number) => void>(() => expect(browser.context.fillText).toHaveBeenCalled());
  const unmount = mountTrialCanvas(browser.canvas, { getRenderSnapshot: read }, onFrame);
  browser.frame(10);
  browser.frame(1200);
  expect(browser.context.fillText.mock.calls.map(call => call.slice(0, 3))).toEqual([['TAP', 50, 240], ['TAP', 50, 240]]);
  expect(onFrame.mock.calls).toEqual([[10], [1200]]);
  expect(browser.getRect).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(2);

  current = Object.freeze({ ...current, judgeTimeUs: us(1_100_000) });
  browser.frame(1216);
  expect(browser.context.fillText).toHaveBeenLastCalledWith('TAP', 50, 240, 62);
  expect(current.notes[0]).toMatchObject({ targetUs: 1_000_000, state: 'PENDING', judgement: null });
  unmount();
});

it('draws four lanes, the judgement line, hold rail/release, chord connector and distinct type markers', () => {
  const browser = makeCanvas();
  const current = snapshot([
    note('TAP', 1, 1_000_000),
    note('HOLD', 2, 950_000, { endUs: us(1_250_000) }),
    note('HOLD', 2, 1_250_000, { endUs: us(1_250_000) }),
    note('CHORD', 1, 1_200_000, { noteId: 'pair' }),
    note('CHORD', 3, 1_200_000, { noteId: 'pair' }),
    note('RAPID', 4, 1_400_000),
    note('TAP', 3, 10_000_000),
  ]);
  const unmount = mountTrialCanvas(browser.canvas, { getRenderSnapshot: () => current });
  browser.frame(16);
  expect(browser.context.fillRect.mock.calls).toEqual(expect.arrayContaining([
    [0, 0, 100, 300], [100, 0, 100, 300], [200, 0, 100, 300], [300, 0, 100, 300],
    [0, 238.5, 400, 3], [142, 160, 16, 80], [50, 174, 200, 4],
  ]));
  expect(browser.context.fillText.mock.calls.map(call => call.slice(0, 3))).toEqual([
    ['TAP', 50, 240], ['HOLD', 150, 240], ['END', 150, 160], ['CHORD', 50, 176], ['CHORD', 250, 176], ['RAPID', 355, 112],
  ]);
  expect(browser.context.roundRect).toHaveBeenCalledWith(12, 228, 76, 24, 12);
  expect(browser.context.closePath).toHaveBeenCalledTimes(2);
  unmount();
});

it('clips a HOLD rail above the viewport and pins its pending head to the line', () => {
  const browser = makeCanvas();
  const current = snapshot([note('HOLD', 2, 200_000, { endUs: us(2_500_000) })]);
  const unmount = mountTrialCanvas(browser.canvas, { getRenderSnapshot: () => current });
  browser.frame(16);
  expect(browser.context.fillRect).toHaveBeenCalledWith(142, 0, 16, 240);
  expect(browser.context.fillText.mock.calls.map(call => call.slice(0, 3))).toEqual([['HOLD', 150, 240]]);
  unmount();
});

it('scales the backing store on initial layout, observed resize and DPR changes without per-frame measuring', () => {
  const browser = makeCanvas(320, 240, 2);
  const read = vi.fn(() => snapshot([]));
  const unmount = mountTrialCanvas(browser.canvas, { getRenderSnapshot: read });
  expect(browser.observe).toHaveBeenCalledWith(browser.canvas);
  browser.frame(15);
  expect([browser.canvas.width, browser.canvas.height]).toEqual([640, 480]);
  expect(browser.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  browser.frame(30);
  expect(browser.getRect).toHaveBeenCalledTimes(1);
  browser.changeSize(252.5, 220);
  browser.frame(45);
  expect([browser.canvas.width, browser.canvas.height]).toEqual([505, 440]);
  vi.stubGlobal('devicePixelRatio', 1.5);
  browser.frame(60);
  expect([browser.canvas.width, browser.canvas.height]).toEqual([379, 330]);
  expect(browser.context.setTransform).toHaveBeenLastCalledWith(379 / 252.5, 0, 0, 1.5, 0, 0);
  expect(browser.getRect).toHaveBeenCalledTimes(3);
  unmount();
});

it('waits for visible layout and cleans up the independent frame loop on unmount or repeat cleanup', () => {
  const browser = makeCanvas(0, 0);
  const read = vi.fn(() => snapshot([]));
  const onFrame = vi.fn();
  const unmount = mountTrialCanvas(browser.canvas, { getRenderSnapshot: read }, onFrame);
  browser.frame(5);
  expect(read).not.toHaveBeenCalled();
  expect(onFrame).not.toHaveBeenCalled();
  browser.changeSize(320, 208);
  browser.frame(16);
  expect(read).toHaveBeenCalledTimes(1);
  expect(onFrame).toHaveBeenCalledWith(16);
  const oldFrame = browser.frames.values().next().value;
  unmount();
  unmount();
  expect(browser.disconnect).toHaveBeenCalledTimes(1);
  expect(browser.cancel).toHaveBeenCalledTimes(1);
  expect(browser.frames.size).toBe(0);
  oldFrame?.(32);
  expect(read).toHaveBeenCalledTimes(1);
  expect(browser.requestFrame).toHaveBeenCalledTimes(3);
});

function drawSnapshots() {
  const browser = makeCanvas();
  let frame = snapshot([]);
  const samples: Array<{ label: string; x: number; y: number; opacity: number }> = [];
  browser.context.fillText.mockImplementation((label: string, x: number, y: number) => {
    samples.push({ label, x, y, opacity: browser.context.globalAlpha });
  });
  mountTrialCanvas(browser.canvas, { getRenderSnapshot: () => frame });
  return {
    ...browser,
    paint(notes: readonly RenderNote[], judgeUs: number, fields?: Partial<RenderSnapshot>, frameMs = 16) {
      frame = Object.freeze({ ...snapshot(notes), judgeTimeUs: us(judgeUs), ...fields });
      browser.context.fillRect.mockClear();
      browser.context.createLinearGradient.mockClear();
      samples.length = 0;
      browser.frame(frameMs);
      return [...samples];
    },
  };
}

function grade(note: RenderNote, judgement: NonNullable<RenderNote['judgement']>, state: 'RESOLVED' | 'COMMITTED' = 'RESOLVED') {
  return Object.freeze({ ...note, judgement, state });
}

function holdNotes() {
  const shared = { noteId: 'hold', endUs: us(1_500_000) };
  return [note('HOLD', 2, 1_000_000, shared), note('HOLD', 2, 1_500_000, shared)] as const;
}

it.each(['PERFECT', 'GREAT', 'GOOD'] as const)('CR02-T01–03/05 hides %s at resolution before and after the line', judgement => {
  const browser = drawSnapshots();
  const tap = note('TAP', 1, 1_000_000);
  expect(browser.paint([tap], 875_000)).toMatchObject([{ label: 'TAP', y: 200 }]);
  expect(browser.paint([grade(tap, judgement)], 875_000)).toEqual([]);
  expect(browser.paint([tap], 1_180_000, { sessionId: 'late-input' })).toMatchObject([{ label: 'TAP', y: 240 }]);
  expect(browser.paint([grade(tap, judgement)], 1_180_000, { sessionId: 'late-input' })).toEqual([]);
  expect(browser.paint([grade(tap, judgement, 'COMMITTED')], 1_500_000, { sessionId: 'late-input' })).toEqual([]);
});

it('CR02-T04/06 starts an overdue MISS on the line and fades it using judge-clock time', () => {
  const browser = drawSnapshots();
  const tap = note('TAP', 1, 1_000_000);
  const missed = grade(tap, 'MISS');
  expect(browser.paint([tap], 1_200_000)).toMatchObject([{ y: 240, opacity: 1 }]);
  expect(browser.paint([missed], 1_201_000)).toMatchObject([{ y: 240, opacity: 0.48 }]);
  const [advancing] = browser.paint([grade(tap, 'MISS', 'COMMITTED')], 1_251_000);
  expect(advancing?.y).toBe(256);
  expect(advancing?.opacity).toBeLessThan(0.48);
  expect(browser.paint([missed], 1_251_000, { state: 'PAUSED' }, 10_000)[0]).toEqual(advancing);
  expect(browser.paint([missed], 1_326_000, { generation: 9 as Gen })[0]?.y).toBe(280);
  expect(browser.paint([missed], 1_426_000)).toEqual([]);
});

it('CR02-T07 leaves unjudged and pending notes visible during a physical press', () => {
  const browser = drawSnapshots();
  const tap = note('TAP', 1, 1_000_000);
  expect(browser.paint([tap], 1_160_000, { pressedLanes: [1, 3] })).toEqual([
    { label: 'TAP', x: 50, y: 240, opacity: 1 },
  ]);
});

it('CR02-T08/09/14 retains the held rail and tail across pause and rehold, then hides both at tail success', () => {
  const browser = drawSnapshots();
  const [head, tail] = holdNotes();
  const hit = grade(head, 'GREAT');
  for (const [state, generation, held] of [
    ['PLAYING', 8, [2]], ['PAUSED', 8, []], ['REHOLD_WAIT', 8, []], ['PLAYING', 9, [2]],
  ] as const) {
    expect(browser.paint([hit, tail], 1_200_000, { state, generation: generation as Gen, activeHoldLanes: held }))
      .toEqual([{ label: 'END', x: 150, y: 144, opacity: 1 }]);
    expect(browser.context.fillRect).toHaveBeenCalledWith(142, 144, 16, 96);
  }
  expect(browser.paint([hit, grade(tail, 'PERFECT')], 1_500_000)).toEqual([]);
  expect(browser.context.fillRect.mock.calls.some(call => call[0] === 142)).toBe(false);
});

it('CR02-T10 drops a missed HOLD with its rail while leaving the future tail in place', () => {
  const browser = drawSnapshots();
  const [head, tail] = holdNotes().map(note => grade(note, 'MISS'));
  expect(browser.paint([head!, tail!], 1_250_000)).toEqual([
    { label: 'HOLD', x: 150, y: 240, opacity: 0.48 },
    { label: 'END', x: 150, y: 160, opacity: 0.48 },
  ]);
  expect(browser.context.fillRect).toHaveBeenCalledWith(142, 160, 16, 80);
  expect(browser.context.createLinearGradient).toHaveBeenCalledWith(0, 240, 0, 300);
  expect(browser.gradient.addColorStop).toHaveBeenLastCalledWith(1, 'rgba(164, 201, 255, 0)');
  expect(browser.paint([head!, tail!], 1_475_000).map(note => note.label)).toEqual(['END']);
  expect(browser.context.fillRect.mock.calls.find(call => call[0] === 142)?.slice(2)).toEqual([16, 68]);
  expect(browser.paint([head!, tail!], 1_800_000)).toEqual([]);
  expect(browser.context.fillRect.mock.calls.some(call => call[0] === 142)).toBe(false);
});

it('CR02-T10 keeps only the residual rail and failed tail after an early release', () => {
  const browser = drawSnapshots();
  const [head, tail] = holdNotes();
  const hit = grade(head, 'PERFECT');
  expect(browser.paint([hit, grade(tail, 'MISS')], 1_200_000)).toMatchObject([{ label: 'END', y: 144 }]);
  expect(browser.context.fillRect).toHaveBeenCalledWith(142, 144, 16, 96);
  expect(browser.paint([hit, grade(tail, 'MISS', 'COMMITTED')], 1_400_000)).toMatchObject([{ label: 'END', y: 208 }]);
  expect(browser.context.fillRect).toHaveBeenCalledWith(142, 208, 16, 92);
  expect(browser.paint([hit, grade(tail, 'MISS')], 1_800_000)).toEqual([]);
});

it('CR02-T11/12 drops each CHORD side independently and removes the connector after one side resolves', () => {
  const browser = drawSnapshots();
  const [left, right] = [1, 3].map(lane => note('CHORD', lane as 1 | 3, 1_000_000, { noteId: 'pair' }));
  expect(browser.paint([left!, right!], 1_000_000)).toHaveLength(2);
  expect(browser.context.fillRect).toHaveBeenCalledWith(50, 238, 200, 4);
  expect(browser.paint([grade(left!, 'PERFECT'), right!], 1_050_000)).toMatchObject([{ x: 250, y: 240, opacity: 1 }]);
  expect(browser.context.fillRect).not.toHaveBeenCalledWith(50, 238, 200, 4);
  expect(browser.paint([grade(left!, 'PERFECT'), grade(right!, 'MISS')], 1_201_000)).toMatchObject([{ x: 250, y: 240, opacity: 0.48 }]);
  expect(browser.paint([grade(left!, 'PERFECT'), grade(right!, 'MISS', 'COMMITTED')], 1_251_000)).toMatchObject([{ x: 250, y: 256 }]);
  expect(browser.paint([grade(left!, 'PERFECT'), grade(right!, 'GOOD')], 1_050_000, { sessionId: 'chord-retry' })).toEqual([]);
});

it('CR02-T13 consumes RAPID strikes independently', () => {
  const browser = drawSnapshots();
  const strikes = [1_000_000, 1_250_000, 1_500_000].map(time => note('RAPID', 3, time, { noteId: 'rapid' }));
  expect(browser.paint([grade(strikes[0]!, 'PERFECT'), ...strikes.slice(1)], 1_300_000))
    .toMatchObject([{ label: 'RAPID', y: 240 }, { label: 'RAPID', y: 176 }]);
  expect(browser.paint([grade(strikes[0]!, 'PERFECT'), grade(strikes[1]!, 'MISS'), strikes[2]!], 1_460_000))
    .toMatchObject([{ label: 'RAPID', y: 240, opacity: 0.48 }, { label: 'RAPID', y: 227.2, opacity: 1 }]);
});

it('CR02-T15 resets MISS display anchors on a new session even when event IDs are reused', () => {
  const browser = drawSnapshots();
  const tap = note('TAP', 1, 1_000_000);
  const missed = grade(tap, 'MISS');
  expect(browser.paint([missed], 1_201_000)).toMatchObject([{ y: 240, opacity: 0.48 }]);
  expect(browser.paint([missed], 1_301_000)).toMatchObject([{ y: 272 }]);
  expect(browser.paint([tap], 900_000, { sessionId: 'retry' })).toMatchObject([{ y: 208, opacity: 1 }]);
  expect(browser.paint([missed], 1_410_000, { sessionId: 'retry' })).toMatchObject([{ y: 240, opacity: 0.48 }]);
});
