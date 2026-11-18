import test from "node:test";
import assert from "node:assert/strict";
import {
  computeJoystickVector,
  createInputController,
  directionFromPressedCodes,
} from "../src/input.js";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    const completeEvent = {
      preventDefault() {},
      ...event,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(completeEvent);
  }
}

class FakeJoystick extends FakeTarget {
  constructor() {
    super();
    this.captured = new Set();
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 96, height: 96 };
  }

  setPointerCapture(id) {
    this.captured.add(id);
  }

  hasPointerCapture(id) {
    return this.captured.has(id);
  }

  releasePointerCapture(id) {
    this.captured.delete(id);
  }
}

test("IT-002: keyboard directions combine, oppose, and release correctly", () => {
  assert.deepEqual(directionFromPressedCodes(new Set(["KeyW", "KeyD"])), { x: 1, y: -1 });
  assert.deepEqual(directionFromPressedCodes(new Set(["KeyA", "KeyD"])), { x: 0, y: 0 });
  assert.deepEqual(directionFromPressedCodes(new Set(["ArrowUp", "ArrowDown"])), { x: 0, y: 0 });
});

test("IT-004: joystick reports center, cardinal, diagonal, and clamped input", () => {
  const rect = { left: 10, top: 20, width: 96, height: 96 };
  assert.deepEqual(computeJoystickVector(58, 68, rect), { x: 0, y: 0 });
  const right = computeJoystickVector(200, 68, rect);
  assert.ok(Math.abs(right.x - 1) < 1e-12);
  assert.ok(Math.abs(right.y) < 1e-12);
  const diagonal = computeJoystickVector(200, 200, rect);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
});

test("IT-003/005/016: controller prioritizes keyboard and clears on pointer cancel or blur", () => {
  const keyboard = new FakeTarget();
  const blur = new FakeTarget();
  const joystick = new FakeJoystick();
  const knob = { style: {} };
  let enabled = true;
  const controller = createInputController({
    keyboardTarget: keyboard,
    blurTarget: blur,
    joystickElement: joystick,
    joystickKnob: knob,
    isEnabled: () => enabled,
  });
  controller.attach();

  joystick.dispatch("pointerdown", { pointerId: 1, isPrimary: true, clientX: 96, clientY: 48 });
  assert.ok(controller.getDirection().x > 0);
  joystick.dispatch("pointerdown", { pointerId: 2, isPrimary: false, clientX: 0, clientY: 48 });
  assert.ok(controller.getDirection().x > 0, "second pointer must not take over");

  keyboard.dispatch("keydown", { code: "KeyA" });
  assert.deepEqual(controller.getDirection(), { x: -1, y: 0 });
  keyboard.dispatch("keyup", { code: "KeyA" });
  assert.ok(controller.getDirection().x > 0);

  joystick.dispatch("pointercancel", { pointerId: 1 });
  assert.deepEqual(controller.getDirection(), { x: 0, y: 0 });
  assert.equal(joystick.captured.size, 0);

  keyboard.dispatch("keydown", { code: "ArrowUp" });
  blur.dispatch("blur");
  assert.deepEqual(controller.getDirection(), { x: 0, y: 0 });

  enabled = false;
  keyboard.dispatch("keydown", { code: "KeyD" });
  assert.deepEqual(controller.getDirection(), { x: 0, y: 0 });
  controller.detach();
});
