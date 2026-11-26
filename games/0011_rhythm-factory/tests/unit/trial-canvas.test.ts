// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { RenderNote, RenderSnapshot, Us } from '../../src/contracts/interface_contracts';
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
  const context = {
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
    canvas, context, frames, requestFrame, cancel, observe, disconnect, getRect,
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
  expect(browser.context.fillText).toHaveBeenLastCalledWith('TAP', 50, 272, 62);
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
    [0, 239, 400, 3], [142, 160, 16, 96], [50, 174, 200, 4],
  ]));
  expect(browser.context.fillText.mock.calls.map(call => call.slice(0, 3))).toEqual([
    ['TAP', 50, 240], ['HOLD', 150, 256], ['END', 150, 160], ['CHORD', 50, 176], ['CHORD', 250, 176], ['RAPID', 355, 112],
  ]);
  expect(browser.context.roundRect).toHaveBeenCalledWith(12, 228, 76, 24, 12);
  expect(browser.context.closePath).toHaveBeenCalledTimes(2);
  unmount();
});

it('clips a HOLD rail to the viewport while its head is below and tail above the playfield', () => {
  const browser = makeCanvas();
  const current = snapshot([note('HOLD', 2, 200_000, { endUs: us(2_500_000) })]);
  const unmount = mountTrialCanvas(browser.canvas, { getRenderSnapshot: () => current });
  browser.frame(16);
  expect(browser.context.fillRect).toHaveBeenCalledWith(142, 0, 16, 300);
  expect(browser.context.fillText).not.toHaveBeenCalled();
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
