import { maxSfxVoicePeak } from './offline-music';
import type { CalibrationCue } from './session-audio-bridge';

const envelopeAttackSec = 0.003;
const envelopeLengthSec = 0.075;

export function createTrialCalibrationCue(getContext: () => AudioContext | undefined): CalibrationCue & { active(): number } {
  let volume = 0.5;
  let active: { readonly voice: OscillatorNode; readonly envelope: GainNode; readonly volume: GainNode } | null = null;

  function release() {
    if (!active) return;
    const { voice, envelope, volume } = active;
    active = null;
    voice.onended = null;
    voice.disconnect();
    envelope.disconnect();
    volume.disconnect();
  }

  function stop() {
    if (!active) return;
    const { voice } = active;
    release();
    voice.stop();
  }

  return {
    start(firstBeatAt, beatTimesUs) {
      const context = getContext();
      if (context?.state !== 'running' || firstBeatAt < context.currentTime || !beatTimesUs.length) return false;
      stop();
      const voice = context.createOscillator();
      const envelope = context.createGain();
      const master = context.createGain();
      active = { voice, envelope, volume: master };
      voice.frequency.value = 920;
      master.gain.value = volume;
      envelope.gain.value = 0;
      try {
        for (const offsetUs of beatTimesUs) {
          const at = firstBeatAt + offsetUs / 1_000_000;
          envelope.gain.setValueAtTime(0, at);
          envelope.gain.linearRampToValueAtTime(maxSfxVoicePeak, at + envelopeAttackSec);
          envelope.gain.linearRampToValueAtTime(0, at + envelopeLengthSec);
        }
        voice.connect(envelope).connect(master).connect(context.destination);
        voice.onended = () => { if (active?.voice === voice) release(); };
        voice.start(firstBeatAt);
        voice.stop(firstBeatAt + beatTimesUs.at(-1)! / 1_000_000 + envelopeLengthSec);
        return true;
      } catch {
        release();
        return false;
      }
    },
    stop,
    setVolume(value) {
      volume = value / 100;
      if (active) active.volume.gain.value = volume;
    },
    active: () => active ? 1 : 0,
  };
}
