import type {
  GameError, GameSettings, Gen, Lane, LifecycleEvent, Ms, NormalizedInput,
} from '../contracts/interface_contracts';
import type { TimePort } from '../contracts/ports';

const lanes = [1, 2, 3, 4] as const;
const defaultBindings = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'] as const;

type LaneButtons = readonly [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];

export interface InputClockContext {
  readonly sessionId: string;
  readonly clockGeneration: Gen;
  readonly clock: TimePort;
}

interface InputTiming {
  readonly eventPerformanceMs: Ms;
  readonly receivedPerformanceMs: Ms;
}

type InputRejection =
  | { readonly reason: 'INVALID_TIMESTAMP'; readonly eventTimeStamp: number; readonly receivedPerformanceMs: number }
  | { readonly reason: 'NO_CONTEXT' | 'WRONG_GENERATION'; readonly timing: InputTiming }
  | { readonly reason: 'CLOCK_REJECTED'; readonly timing: InputTiming; readonly error: GameError };

export interface KeyboardPointerInputOptions {
  readonly keyboardTarget: Window;
  /** The composing view gives pointer lane buttons `touch-action: none`. */
  readonly laneButtons: LaneButtons;
  /** Select a fixed-generation clock by occurrence time, including any still-eligible old generation. */
  readonly contextAt: (eventPerformanceMs: Ms) => InputClockContext | null;
  readonly onInput: (input: NormalizedInput) => void;
  readonly onCancel: (event: LifecycleEvent) => void;
  readonly onPhysicalChange?: (pressedLanes: readonly Lane[]) => void;
  readonly onRejectedInput?: (input: InputRejection) => void;
  readonly performance?: Pick<Performance, 'now' | 'timeOrigin'>;
  readonly keyBindings?: GameSettings['keyBindings'];
}

interface PointerRoute {
  readonly lane: Lane;
  readonly button: HTMLButtonElement;
}

let inputSequence = 0;

function occurrenceTime(stamp: number, receipt: number, timeOrigin: number): Ms | null {
  if (!Number.isFinite(stamp) || stamp < 0 || !Number.isFinite(receipt) || receipt < 0) return null;
  if (stamp <= receipt) return stamp as Ms;
  // Older browser event timestamps may be Unix-epoch milliseconds.
  if (!Number.isFinite(timeOrigin) || timeOrigin <= 0) return null;
  const relative = stamp - timeOrigin;
  return relative >= 0 && relative <= receipt ? relative as Ms : null;
}

function editsText(event: KeyboardEvent): boolean {
  return event.composedPath().some((target) => target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select')));
}

function supportedPointer(event: PointerEvent): boolean {
  return Number.isSafeInteger(event.pointerId) && event.pointerId >= 0
    && (event.pointerType === 'touch' || event.pointerType === 'pen' || event.pointerType === 'mouse');
}

function releaseCapture(route: PointerRoute, pointerId: number): void {
  try {
    if (route.button.hasPointerCapture?.(pointerId)) route.button.releasePointerCapture(pointerId);
  } catch {
    // The browser can end capture as it delivers the pointer's terminal event.
  }
}

export function attachKeyboardPointerInput(options: KeyboardPointerInputOptions): { dispose(): void } {
  const { keyboardTarget, laneButtons, contextAt, onInput, onCancel, onPhysicalChange, onRejectedInput } = options;
  const performance = options.performance ?? keyboardTarget.performance;
  const bindings = options.keyBindings ?? defaultBindings;
  if (new Set(laneButtons).size !== lanes.length) throw new RangeError('Each lane needs its own button');
  if (bindings.length !== lanes.length || new Set(bindings).size !== lanes.length
      || bindings.some((code) => !/^(?:Key[A-Z]|Digit[0-9])$/.test(code))) {
    throw new RangeError('Expected four distinct physical key codes');
  }

  const keyLanes = new Map(bindings.map((binding, index) => [binding, lanes[index]!]));
  const pointers = new Map<number, PointerRoute>();
  const pressedKeys = new Set<string>();
  const deliveredEvents = new WeakSet<Event>();
  let physicalLanes: readonly Lane[] = [];
  let disposed = false;

  function time(event: Event, received: number): InputTiming | null {
    const eventPerformanceMs = occurrenceTime(event.timeStamp, received, performance.timeOrigin);
    if (eventPerformanceMs === null) {
      onRejectedInput?.({ reason: 'INVALID_TIMESTAMP', eventTimeStamp: event.timeStamp, receivedPerformanceMs: received });
      return null;
    }
    return { eventPerformanceMs, receivedPerformanceMs: received as Ms };
  }

  function physicalChange(): void {
    const pressed = new Set<Lane>();
    for (const code of pressedKeys) pressed.add(keyLanes.get(code)!);
    for (const route of pointers.values()) pressed.add(route.lane);
    const next = lanes.filter((lane) => pressed.has(lane));
    if (next.length === physicalLanes.length && next.every((lane, index) => lane === physicalLanes[index])) return;
    physicalLanes = Object.freeze(next);
    onPhysicalChange?.(physicalLanes);
  }

  function emitInput(timing: InputTiming, inputId: string, lane: Lane, action: NormalizedInput['action']): void {
    if (disposed) return;
    const context = contextAt(timing.eventPerformanceMs);
    if (!context) {
      onRejectedInput?.({ reason: 'NO_CONTEXT', timing });
      return;
    }
    const converted = context.clock.convertEventTime(timing.eventPerformanceMs, context.clockGeneration);
    if (!converted.ok) {
      onRejectedInput?.({ reason: 'CLOCK_REJECTED', timing, error: converted.error });
      return;
    }
    if (converted.value.generation !== context.clockGeneration) {
      onRejectedInput?.({ reason: 'WRONG_GENERATION', timing });
      return;
    }
    const sequence = ++inputSequence;
    onInput(Object.freeze({
      eventId: `input-${sequence}`, sessionId: context.sessionId, clockGeneration: context.clockGeneration,
      inputId, lane, action, ...timing,
      songTimeUs: converted.value.songTimeUs, judgeTimeUs: converted.value.judgeTimeUs, sequence,
    }));
  }

  function keyboard(event: KeyboardEvent, action: NormalizedInput['action']): void {
    const lane = keyLanes.get(event.code);
    if (lane === undefined || deliveredEvents.has(event)) return;
    if (editsText(event) && (action === 'DOWN' || !pressedKeys.has(event.code))) return;
    if (action === 'DOWN' && (event.ctrlKey || event.altKey || event.metaKey || event.isComposing)) return;
    const received = performance.now();
    event.preventDefault();
    if (action === 'DOWN' && event.repeat) return;

    deliveredEvents.add(event);
    if (action === 'UP') {
      pressedKeys.delete(event.code);
      physicalChange();
    }
    const timing = time(event, received);
    if (!timing) return;
    if (action === 'DOWN') {
      pressedKeys.add(event.code);
      physicalChange();
    }
    emitInput(timing, `keyboard:${event.code}`, lane, action);
  }

  function pointerStart(event: PointerEvent, route: PointerRoute): void {
    if (!supportedPointer(event) || event.button !== 0 || deliveredEvents.has(event)) return;
    const received = performance.now();
    deliveredEvents.add(event);
    event.preventDefault();
    const timing = time(event, received);
    if (!timing) return;
    const captured = pointers.get(event.pointerId);
    if (!captured) {
      pointers.set(event.pointerId, route);
      try {
        route.button.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events and inactive native pointers cannot be captured. The window listener still handles release.
      }
      physicalChange();
    }
    emitInput(timing, `pointer:${event.pointerId}`, (captured ?? route).lane, 'DOWN');
  }

  function pointerEnd(event: PointerEvent, action: 'UP' | 'CANCEL'): void {
    if (!supportedPointer(event) || deliveredEvents.has(event)) return;
    const captured = pointers.get(event.pointerId);
    if (!captured && (action === 'CANCEL' || event.button !== 0)) return;
    const targetIndex = captured ? -1 : laneButtons.findIndex((button) => event.composedPath().includes(button));
    const lane = captured?.lane ?? lanes[targetIndex];
    if (lane === undefined) return;

    const received = performance.now();
    deliveredEvents.add(event);
    event.preventDefault();
    if (captured) {
      pointers.delete(event.pointerId);
      releaseCapture(captured, event.pointerId);
      physicalChange();
    }
    const timing = time(event, received);
    if (!timing || disposed) return;
    if (action === 'UP') {
      emitInput(timing, `pointer:${event.pointerId}`, lane, 'UP');
      return;
    }
    const context = contextAt(timing.eventPerformanceMs);
    if (context) onCancel(Object.freeze({
      kind: 'POINTER_CANCEL', atPerformanceMs: timing.eventPerformanceMs,
      sessionId: context.sessionId, generation: context.clockGeneration,
    }));
    else onRejectedInput?.({ reason: 'NO_CONTEXT', timing });
  }

  const onKeyDown = (event: KeyboardEvent) => keyboard(event, 'DOWN');
  const onKeyUp = (event: KeyboardEvent) => keyboard(event, 'UP');
  const onPointerUp = (event: PointerEvent) => pointerEnd(event, 'UP');
  const onPointerCancel = (event: PointerEvent) => pointerEnd(event, 'CANCEL');
  const clearPhysical = () => {
    for (const [pointerId, route] of pointers) releaseCapture(route, pointerId);
    pointers.clear();
    pressedKeys.clear();
    physicalChange();
  };
  const starts = laneButtons.map((button, index) =>
    (event: PointerEvent) => pointerStart(event, { lane: lanes[index]!, button }));

  keyboardTarget.addEventListener('keydown', onKeyDown);
  keyboardTarget.addEventListener('keyup', onKeyUp);
  keyboardTarget.addEventListener('pointerup', onPointerUp, true);
  keyboardTarget.addEventListener('pointercancel', onPointerCancel, true);
  keyboardTarget.addEventListener('blur', clearPhysical);
  laneButtons.forEach((button, index) => button.addEventListener('pointerdown', starts[index]!));

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      keyboardTarget.removeEventListener('keydown', onKeyDown);
      keyboardTarget.removeEventListener('keyup', onKeyUp);
      keyboardTarget.removeEventListener('pointerup', onPointerUp, true);
      keyboardTarget.removeEventListener('pointercancel', onPointerCancel, true);
      keyboardTarget.removeEventListener('blur', clearPhysical);
      laneButtons.forEach((button, index) => button.removeEventListener('pointerdown', starts[index]!));
      clearPhysical();
    },
  };
}
