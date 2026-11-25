// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderPort } from '../../src/app/render-port';
import type { GameUiSnapshot, RenderSnapshot } from '../../src/contracts/interface_contracts';
import { makeRenderFrame } from '../fixtures/render-frame';

function emptySnapshot(noteSpeed: number, effectQuality: RenderSnapshot['effectQuality']) {
  return {
    sessionId: null, generation: null, songTimeUs: 0, judgeTimeUs: 0, durationUs: 0,
    state: 'READY', notes: [], factoryId: null, activeHoldLanes: [], pressedLanes: [],
    noteSpeed, effectQuality, progress: 0,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('IF-09 / TC-D4-009 / A1a-R01', () => {
  it('009-A projects the complete active session frame', () => {
    const frame = makeRenderFrame();
    const port = createRenderPort(() => frame, () => null);
    const { startingSettings, ...expected } = frame;

    expect(port.getRenderSnapshot()).toEqual({ ...expected, ...startingSettings });
  });

  it.each([
    { id: '009-B', settings: { noteSpeed: 1, effectQuality: 'NORMAL' } as const },
    { id: '009-C', settings: { noteSpeed: 1.5, effectQuality: 'LIGHT' } as const },
  ])('$id projects every empty field using current settings', ({ settings }) => {
    const port = createRenderPort(() => null, () => settings);
    expect(port.getRenderSnapshot()).toStrictEqual(emptySnapshot(settings.noteSpeed, settings.effectQuality));
  });

  it('009-D falls back on absent or invalid settings without writes or status changes', () => {
    const application = {
      state: 'ERROR', saveStatus: 'SAVE_ERROR', lockAvailable: false, currentSettings: null,
    } satisfies Pick<GameUiSnapshot, 'state' | 'saveStatus'> & { lockAvailable: boolean; currentSettings: null };
    const readSettings = vi.fn(() => application.currentSettings);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');

    const absent = createRenderPort(() => null, readSettings);
    const invalid = createRenderPort(() => null, () => ({ noteSpeed: Number.NaN, effectQuality: 'LIGHT' }));

    expect(absent.getRenderSnapshot()).toStrictEqual(emptySnapshot(1, 'NORMAL'));
    expect(invalid.getRenderSnapshot()).toStrictEqual(emptySnapshot(1, 'NORMAL'));
    expect(readSettings).toHaveBeenCalledTimes(1);
    expect(application).toEqual({ state: 'ERROR', saveStatus: 'SAVE_ERROR', lockAvailable: false, currentSettings: null });
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('009-E keeps a valid sealed frame until disposal and drops the old note and lanes afterwards', () => {
    const sealed = { ...makeRenderFrame(), state: 'CLEAR' as const };
    let frame: typeof sealed | null = sealed;
    const port = createRenderPort(() => frame, () => ({ noteSpeed: 1.5, effectQuality: 'LIGHT' }));

    expect(port.getRenderSnapshot()).toMatchObject({ state: 'CLEAR', sessionId: sealed.sessionId });
    expect(port.getRenderSnapshot().notes).toHaveLength(1);
    frame = null;
    expect(port.getRenderSnapshot()).toStrictEqual(emptySnapshot(1.5, 'LIGHT'));
  });

  it('009-F rejects mutations of nested data and isolates each rendering view', () => {
    const frame = makeRenderFrame();
    const port = createRenderPort(() => frame, () => null);
    const value = port.getRenderSnapshot();

    expect(Reflect.set(value, 'state', 'ERROR')).toBe(false);
    expect(Reflect.set(value.notes[0]!, 'lane', 4)).toBe(false);
    expect(Reflect.set(value.activeHoldLanes, '0', 4)).toBe(false);
    expect(Reflect.set(value.pressedLanes, '0', 4)).toBe(false);
    expect(frame.notes[0]?.lane).toBe(2);
    expect(port.getRenderSnapshot()).toEqual(value);
  });

  it('009-G uses session-start settings while current settings change', () => {
    const frame = makeRenderFrame();
    let current = { noteSpeed: 1, effectQuality: 'NORMAL' } as Pick<RenderSnapshot, 'noteSpeed' | 'effectQuality'>;
    const readSettings = vi.fn(() => current);
    const port = createRenderPort(() => frame, readSettings);

    expect(port.getRenderSnapshot()).toMatchObject(frame.startingSettings);
    current = { noteSpeed: 2, effectQuality: 'NORMAL' };
    expect(port.getRenderSnapshot()).toMatchObject(frame.startingSettings);
    expect(readSettings).not.toHaveBeenCalled();
  });
});
