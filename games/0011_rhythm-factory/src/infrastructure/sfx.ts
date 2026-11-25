import { maxSfxVoicePeak } from './offline-music';

export function scheduleTick(context: BaseAudioContext, destination: AudioNode) {
  const voice = context.createOscillator();
  const gain = context.createGain();
  const time = context.currentTime;
  voice.frequency.value = 920;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(maxSfxVoicePeak, time + 0.003);
  gain.gain.linearRampToValueAtTime(0, time + 0.075);
  voice.connect(gain).connect(destination);
  voice.start(time);
  voice.stop(time + 0.075);
  return { voice, gain };
}
