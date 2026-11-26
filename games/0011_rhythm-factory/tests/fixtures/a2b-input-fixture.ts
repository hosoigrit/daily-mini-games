import type { Gen, Lane, LifecycleEvent, Ms, NormalizedInput, Sec, Us } from '../../src/contracts/interface_contracts';
import { createFixedAudioClock } from '../../src/domain/audio-clock';
import { attachKeyboardPointerInput } from '../../src/infrastructure/keyboard-pointer-input';

export interface InputFixtureEvidence {
  readonly inputs: NormalizedInput[];
  readonly cancellations: LifecycleEvent[];
  readonly physical: (readonly Lane[])[];
  readonly capture: { lane: Lane; trusted: boolean; pointerId: number }[];
  readonly pointerDown: { lane: Lane; trusted: boolean; pointerType: string }[];
}

function laneButton(lane: Lane): HTMLButtonElement {
  const element = document.getElementById(`lane-${lane}`);
  if (!(element instanceof HTMLButtonElement)) throw new Error('DOM input fixture lane is missing');
  return element;
}

const laneButtons = [laneButton(1), laneButton(2), laneButton(3), laneButton(4)] as const;
const fixtureEvidence = document.getElementById('fixture-evidence');
if (!(fixtureEvidence instanceof HTMLOutputElement)) throw new Error('DOM input fixture evidence output is missing');

const evidence: InputFixtureEvidence = { inputs: [], cancellations: [], physical: [], capture: [], pointerDown: [] };
function publish(): void {
  fixtureEvidence!.textContent = JSON.stringify(evidence);
}

laneButtons.forEach((button, index) => {
  const lane = (index + 1) as Lane;
  button.addEventListener('gotpointercapture', (event) => {
    evidence.capture.push({ lane, trusted: event.isTrusted, pointerId: event.pointerId });
    publish();
  });
  button.addEventListener('pointerdown', (event) => {
    if (!(event instanceof PointerEvent)) return;
    evidence.pointerDown.push({ lane, trusted: event.isTrusted, pointerType: event.pointerType });
    publish();
  });
});

const clockGeneration = 3 as Gen;
const sessionId = 'stage-a2b-input-fixture';
const fixed = createFixedAudioClock({
  playbackId: 'input-fixture', sessionId, generation: clockGeneration,
  anchorAudioSec: 2 as Sec, anchorPerformanceMs: Math.max(performance.now(), 1) as Ms,
  startAudioSec: 2 as Sec, startSongUs: 0 as Us,
}, 20_000 as Us);
if (!fixed.ok) throw new Error(fixed.error.messageKey);

const adapter = attachKeyboardPointerInput({
  keyboardTarget: window,
  laneButtons,
  contextAt: () => ({ sessionId, clockGeneration, clock: fixed.value }),
  onInput(input) {
    evidence.inputs.push(input);
    publish();
  },
  onCancel(event) {
    evidence.cancellations.push(event);
    publish();
  },
  onPhysicalChange(pressed) {
    evidence.physical.push(pressed);
    laneButtons.forEach((button, index) => { button.dataset.pressed = String(pressed.includes((index + 1) as Lane)); });
    publish();
  },
});
window.addEventListener('pagehide', () => adapter.dispose(), { once: true });
publish();
