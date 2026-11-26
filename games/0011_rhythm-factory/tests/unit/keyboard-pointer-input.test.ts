// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Gen, LifecycleEvent, Ms, NormalizedInput, PlaybackAnchor, Sec, Us } from '../../src/contracts/interface_contracts';
import { createFixedAudioClock } from '../../src/domain/audio-clock';
import { attachKeyboardPointerInput, type InputClockContext, type KeyboardPointerInputOptions } from '../../src/infrastructure/keyboard-pointer-input';

const timeOrigin = 1_784_000_000_000;
const cleanups: (() => void)[] = [];

function fixedClock(sessionId: string, generation: number, startUs = 0) {
  const anchor: PlaybackAnchor = {
    playbackId: `fixed-${generation}`, sessionId, generation: generation as Gen,
    anchorAudioSec: 2 as Sec, anchorPerformanceMs: 1_000 as Ms,
    startAudioSec: 2 as Sec, startSongUs: startUs as Us,
  };
  const clock = createFixedAudioClock(anchor, 20_000 as Us);
  if (!clock.ok) throw new Error('The test needs a valid IF-04 clock');
  return { sessionId, clockGeneration: anchor.generation, clock: clock.value };
}

function setup(
  override: Partial<Pick<KeyboardPointerInputOptions, 'contextAt' | 'keyBindings' | 'onPhysicalChange'>> = {},
) {
  const button = () => {
    const node = document.createElement('button');
    document.body.appendChild(node);
    const captured = new Set<number>();
    node.setPointerCapture = vi.fn((id) => { captured.add(id); });
    node.hasPointerCapture = vi.fn((id) => captured.has(id));
    node.releasePointerCapture = vi.fn((id) => { captured.delete(id); });
    return node;
  };
  const laneButtons = [button(), button(), button(), button()] as const;
  const inputs: NormalizedInput[] = [];
  const cancellations: LifecycleEvent[] = [];
  const physical: (readonly number[])[] = [];
  const rejected = vi.fn();
  const clock = fixedClock('trial', 5);
  let received = 1_200;
  const adapter = attachKeyboardPointerInput({
    keyboardTarget: window, laneButtons, contextAt: () => clock,
    onInput: (input) => { inputs.push(input); },
    onCancel: (input) => { cancellations.push(input); },
    onPhysicalChange: (snapshot) => { physical.push(snapshot); },
    onRejectedInput: rejected, performance: { now: () => received, timeOrigin },
    ...override,
  });
  cleanups.push(() => adapter.dispose());

  return {
    adapter, laneButtons, inputs, cancellations, physical, rejected, clock,
    at: (value: number) => { received = value; },
  };
}

function keyboard(
  target: EventTarget, type: 'keydown' | 'keyup', stamp: number, options: KeyboardEventInit,
) {
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...options });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  target.dispatchEvent(event);
  return event;
}

function pointer(target: EventTarget, type: string, stamp: number, options: PointerEventInit) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: 'touch', ...options });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Stage A-2b browser input boundary', () => {
  it('converts occurrence through the retained IF-04 clock and keeps receipt separately', () => {
    const { inputs, physical, clock, at } = setup();
    const convert = vi.spyOn(clock.clock, 'convertEventTime');
    keyboard(window, 'keydown', 1_100, { code: 'KeyD' });
    at(1_400);
    keyboard(window, 'keyup', timeOrigin + 1_150, { code: 'KeyD' });
    expect(inputs).toMatchObject([
      {
        sessionId: 'trial', clockGeneration: 5, lane: 1, inputId: 'keyboard:KeyD', action: 'DOWN',
        eventPerformanceMs: 1_100, receivedPerformanceMs: 1_200, songTimeUs: 100_000, judgeTimeUs: 80_000,
      },
      {
        sessionId: 'trial', clockGeneration: 5, lane: 1, inputId: 'keyboard:KeyD', action: 'UP',
        eventPerformanceMs: 1_150, receivedPerformanceMs: 1_400, songTimeUs: 150_000, judgeTimeUs: 130_000,
      },
    ]);
    expect(convert.mock.calls).toEqual([[1_100, 5], [1_150, 5]]);
    expect(inputs[1]!.sequence).toBe(inputs[0]!.sequence + 1);
    expect(inputs[1]!.eventId).not.toBe(inputs[0]!.eventId);
    expect(Object.isFrozen(inputs[0])).toBe(true);
    expect(physical).toEqual([[1], []]);
  });

  it('rejects invalid/future timestamps and a mismatched or rejected IF-04 generation', () => {
    const old = fixedClock('older', 4);
    const active = fixedClock('active', 5);
    const mismatched: InputClockContext = { ...active, clockGeneration: 6 as Gen, clock: {
      convertEventTime: (time) => active.clock.convertEventTime(time, 5 as Gen),
    } };
    const rejectedClock: InputClockContext = { ...active, clockGeneration: 6 as Gen };
    const find = vi.fn((time: Ms) => {
      if (time >= 1_150) return mismatched;
      if (time >= 1_120) return rejectedClock;
      if (time >= 1_100) return active;
      if (time >= 1_000) return old;
      return null;
    });
    const { inputs, rejected } = setup({ contextAt: find });
    keyboard(window, 'keydown', Number.NaN, { code: 'KeyD' });
    keyboard(window, 'keydown', -1, { code: 'KeyD' });
    keyboard(window, 'keydown', 1_201, { code: 'KeyD' });
    keyboard(window, 'keydown', timeOrigin + 1_201, { code: 'KeyD' });
    keyboard(window, 'keydown', 999, { code: 'KeyD' });
    keyboard(window, 'keydown', 1_100, { code: 'KeyD' });
    // Delayed original occurrence retains its original generation and clock.
    keyboard(window, 'keyup', 1_050, { code: 'KeyD' });
    keyboard(window, 'keydown', 1_120, { code: 'KeyD' });
    keyboard(window, 'keydown', 1_150, { code: 'KeyD' });
    expect(find.mock.calls.map(([at]) => at)).toEqual([999, 1_100, 1_050, 1_120, 1_150]);
    expect(inputs.map(({ sessionId, clockGeneration, eventPerformanceMs }) => [sessionId, clockGeneration, eventPerformanceMs]))
      .toEqual([['active', 5, 1_100], ['older', 4, 1_050]]);
    expect(rejected.mock.calls.map(([event]) => event.reason)).toEqual([
      'INVALID_TIMESTAMP', 'INVALID_TIMESTAMP', 'INVALID_TIMESTAMP', 'INVALID_TIMESTAMP',
      'NO_CONTEXT', 'CLOCK_REJECTED', 'WRONG_GENERATION',
    ]);
  });

  it('clears a physical key on unusable release time without submitting a logical UP', () => {
    const { inputs, physical, rejected } = setup();
    keyboard(window, 'keydown', 1_100, { code: 'KeyD' });
    const release = keyboard(window, 'keyup', NaN, { code: 'KeyD' });
    window.dispatchEvent(release);
    expect(physical).toEqual([[1], []]);
    expect(inputs.map(input => input.action)).toEqual(['DOWN']);
    expect(rejected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason: 'INVALID_TIMESTAMP' }));
  });

  it('drops key repeats and a redispatched event without filtering logically distinct DOWN and UP', () => {
    const { inputs, physical } = setup();
    const release = keyboard(window, 'keyup', 1_100, { code: 'KeyF' });
    window.dispatchEvent(release);
    keyboard(window, 'keydown', 1_090, { code: 'KeyF' });
    keyboard(window, 'keydown', 1_090, { code: 'KeyF', repeat: true });
    keyboard(window, 'keydown', 1_090, { code: 'KeyF' });
    keyboard(window, 'keydown', 1_090, { code: 'KeyJ' });
    keyboard(window, 'keydown', 1_090, { code: 'KeyK' });
    keyboard(window, 'keydown', 1_090, { code: 'Escape' });

    expect(inputs.map(({ action, eventPerformanceMs, lane }) => [action, eventPerformanceMs, lane])).toEqual([
      ['UP', 1_100, 2], ['DOWN', 1_090, 2], ['DOWN', 1_090, 2], ['DOWN', 1_090, 3], ['DOWN', 1_090, 4],
    ]);
    const first = inputs[0]!.sequence;
    expect(inputs.map(({ sequence }) => sequence)).toEqual([first, first + 1, first + 2, first + 3, first + 4]);
    expect(physical).toEqual([[2], [2, 3], [2, 3, 4]]);
  });

  it('leaves form fields, reserved keys and browser shortcuts to their normal behavior', () => {
    const { inputs } = setup({ keyBindings: ['KeyA', 'Digit2', 'KeyJ', 'KeyK'] });
    const field = document.createElement('input');
    document.body.appendChild(field);
    const editor = keyboard(field, 'keydown', 1_100, { code: 'KeyA' });
    const shortcut = keyboard(window, 'keydown', 1_100, { code: 'KeyA', ctrlKey: true });
    const escape = keyboard(window, 'keydown', 1_100, { code: 'Escape' });
    const play = keyboard(window, 'keydown', 1_100, { code: 'Digit2' });
    expect([editor.defaultPrevented, shortcut.defaultPrevented, escape.defaultPrevented, play.defaultPrevented])
      .toEqual([false, false, false, true]);
    expect(inputs).toMatchObject([{ inputId: 'keyboard:Digit2', lane: 2 }]);
  });

  it('keeps capture on the starting lane and sends competing subjects to the judgement queue', () => {
    const { laneButtons: [first, second], inputs, physical } = setup();
    pointer(first, 'pointerdown', 1_100, { pointerId: 7 });
    pointer(second, 'pointermove', 1_110, { pointerId: 7 });
    pointer(first, 'pointerdown', 1_115, { pointerId: 8 });
    pointer(second, 'pointerup', 1_120, { pointerId: 7 });
    pointer(first, 'pointerup', 1_130, { pointerId: 8 });
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    first.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    first.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(first.setPointerCapture).toHaveBeenNthCalledWith(1, 7);
    expect(first.setPointerCapture).toHaveBeenNthCalledWith(2, 8);
    expect(first.releasePointerCapture).toHaveBeenNthCalledWith(1, 7);
    expect(first.releasePointerCapture).toHaveBeenNthCalledWith(2, 8);
    expect(second.setPointerCapture).not.toHaveBeenCalled();
    expect(inputs.map(({ inputId, lane, action }) => [inputId, lane, action])).toEqual([
      ['pointer:7', 1, 'DOWN'], ['pointer:8', 1, 'DOWN'], ['pointer:7', 1, 'UP'], ['pointer:8', 1, 'UP'],
    ]);
    expect(physical).toEqual([[1], []]);
  });

  it('does not capture a route or show a press for an invalid starting timestamp', () => {
    const { laneButtons: [first, second], inputs, physical } = setup();
    pointer(first, 'pointerdown', Number.NaN, { pointerId: 7 });
    keyboard(window, 'keydown', -1, { code: 'KeyD' });
    expect(physical).toEqual([]);
    expect(first.setPointerCapture).not.toHaveBeenCalled();

    pointer(second, 'pointerdown', 1_100, { pointerId: 7 });
    pointer(second, 'pointerup', 1_120, { pointerId: 7 });
    expect(inputs.map(({ lane, action }) => [lane, action])).toEqual([[2, 'DOWN'], [2, 'UP']]);
    expect(physical).toEqual([[2], []]);
  });

  it('forwards release-before-DOWN delivery with a known DOM lane', () => {
    const { laneButtons: [, second], inputs } = setup();
    pointer(second, 'pointerup', 1_120, { pointerId: 7 });
    pointer(second, 'pointerdown', 1_100, { pointerId: 7 });

    expect(inputs.map(({ lane, action, eventPerformanceMs }) => [lane, action, eventPerformanceMs])).toEqual([
      [2, 'UP', 1_120], [2, 'DOWN', 1_100],
    ]);
  });

  it('keeps pointercancel on the lifecycle port and clears physical state even if capture ended', () => {
    const { laneButtons: [first, second], inputs, cancellations, physical } = setup();
    pointer(first, 'pointerdown', 1_100, { pointerId: 7 });
    vi.mocked(first.releasePointerCapture).mockImplementationOnce(() => { throw new DOMException('Pointer ended'); });
    pointer(second, 'pointercancel', 1_120, { pointerId: 7 });
    pointer(second, 'pointercancel', 1_130, { pointerId: 7 });

    expect(inputs).toMatchObject([{ inputId: 'pointer:7', lane: 1, action: 'DOWN' }]);
    expect(cancellations).toEqual([{ kind: 'POINTER_CANCEL', atPerformanceMs: 1_120, sessionId: 'trial', generation: 5 }]);
    expect(physical).toEqual([[1], []]);
  });

  it('clears the physical snapshot on blur/dispose and leaves no double listeners', () => {
    const { adapter, laneButtons: [first], inputs, cancellations, physical } = setup();
    keyboard(window, 'keydown', 1_100, { code: 'KeyF' });
    window.dispatchEvent(new Event('blur'));
    pointer(first, 'pointerdown', 1_100, { pointerId: 7 });
    adapter.dispose();
    adapter.dispose();
    keyboard(window, 'keydown', 1_100, { code: 'KeyF' });
    pointer(first, 'pointercancel', 1_120, { pointerId: 7 });

    expect(inputs).toHaveLength(2);
    expect(first.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(cancellations).toEqual([]);
    expect(physical).toEqual([[2], [], [1], []]);
  });
});
