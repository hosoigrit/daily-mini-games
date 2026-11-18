const MOVEMENT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const ARROW_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function directionFromPressedCodes(pressedCodes) {
  const left = pressedCodes.has("KeyA") || pressedCodes.has("ArrowLeft");
  const right = pressedCodes.has("KeyD") || pressedCodes.has("ArrowRight");
  const up = pressedCodes.has("KeyW") || pressedCodes.has("ArrowUp");
  const down = pressedCodes.has("KeyS") || pressedCodes.has("ArrowDown");
  return {
    x: Number(right) - Number(left),
    y: Number(down) - Number(up),
  };
}

export function computeJoystickVector(clientX, clientY, rect, options = {}) {
  const knobDiameter = options.knobDiameter ?? 38;
  const deadzoneRatio = options.deadzoneRatio ?? 0.12;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maximumTravel = Math.max(1, Math.min(rect.width, rect.height) / 2 - knobDiameter / 2);
  const rawX = (clientX - centerX) / maximumTravel;
  const rawY = (clientY - centerY) / maximumTravel;
  const rawLength = Math.hypot(rawX, rawY);

  if (rawLength <= deadzoneRatio) return { x: 0, y: 0 };

  const clampedLength = Math.min(1, rawLength);
  const adjustedLength = (clampedLength - deadzoneRatio) / (1 - deadzoneRatio);
  return {
    x: (rawX / rawLength) * adjustedLength,
    y: (rawY / rawLength) * adjustedLength,
  };
}

export function createInputController({
  keyboardTarget,
  blurTarget,
  joystickElement,
  joystickKnob,
  isEnabled = () => true,
}) {
  const pressedCodes = new Set();
  let pointerId = null;
  let joystickDirection = { x: 0, y: 0 };

  function onKeyDown(event) {
    if (!MOVEMENT_CODES.has(event.code) || !isEnabled()) return;
    pressedCodes.add(event.code);
    if (ARROW_CODES.has(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    if (!MOVEMENT_CODES.has(event.code)) return;
    pressedCodes.delete(event.code);
    if (ARROW_CODES.has(event.code) && isEnabled()) event.preventDefault();
  }

  function onPointerDown(event) {
    if (!isEnabled() || pointerId !== null || event.isPrimary === false) return;
    pointerId = event.pointerId;
    joystickElement.setPointerCapture?.(pointerId);
    updatePointer(event);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (event.pointerId !== pointerId) return;
    updatePointer(event);
    event.preventDefault();
  }

  function onPointerEnd(event) {
    if (event.pointerId !== pointerId) return;
    releasePointer();
    event.preventDefault();
  }

  function updatePointer(event) {
    joystickDirection = computeJoystickVector(
      event.clientX,
      event.clientY,
      joystickElement.getBoundingClientRect(),
    );
    updateKnob();
  }

  function updateKnob() {
    const maximumTravel = 29;
    joystickKnob.style.transform = `translate(${joystickDirection.x * maximumTravel}px, ${joystickDirection.y * maximumTravel}px)`;
  }

  function releasePointer() {
    if (pointerId !== null && joystickElement.hasPointerCapture?.(pointerId)) {
      joystickElement.releasePointerCapture?.(pointerId);
    }
    pointerId = null;
    joystickDirection = { x: 0, y: 0 };
    updateKnob();
  }

  function clear() {
    pressedCodes.clear();
    releasePointer();
  }

  function getDirection() {
    if (!isEnabled()) return { x: 0, y: 0 };
    const keyboardDirection = directionFromPressedCodes(pressedCodes);
    if (keyboardDirection.x !== 0 || keyboardDirection.y !== 0) return keyboardDirection;
    return { ...joystickDirection };
  }

  function attach() {
    keyboardTarget.addEventListener("keydown", onKeyDown, { passive: false });
    keyboardTarget.addEventListener("keyup", onKeyUp, { passive: false });
    blurTarget.addEventListener("blur", clear);
    joystickElement.addEventListener("pointerdown", onPointerDown, { passive: false });
    joystickElement.addEventListener("pointermove", onPointerMove, { passive: false });
    joystickElement.addEventListener("pointerup", onPointerEnd, { passive: false });
    joystickElement.addEventListener("pointercancel", onPointerEnd, { passive: false });
    joystickElement.addEventListener("lostpointercapture", releasePointer);
  }

  function detach() {
    keyboardTarget.removeEventListener("keydown", onKeyDown);
    keyboardTarget.removeEventListener("keyup", onKeyUp);
    blurTarget.removeEventListener("blur", clear);
    joystickElement.removeEventListener("pointerdown", onPointerDown);
    joystickElement.removeEventListener("pointermove", onPointerMove);
    joystickElement.removeEventListener("pointerup", onPointerEnd);
    joystickElement.removeEventListener("pointercancel", onPointerEnd);
    joystickElement.removeEventListener("lostpointercapture", releasePointer);
    clear();
  }

  return { attach, detach, clear, getDirection };
}
