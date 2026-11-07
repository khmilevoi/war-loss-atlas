import type { BattleCue } from '../simulation/battle';

const effects = {
  rifle: { duration: .085, volume: .12, filter: 3200, start: 210, end: 75, spacing: .09 },
  cannon: { duration: .24, volume: .24, filter: 750, start: 130, end: 45, spacing: .19 },
  explosion: { duration: .43, volume: .22, filter: 460, start: 95, end: 34, spacing: .22 },
  nuke: { duration: 1.28, volume: .31, filter: 265, start: 75, end: 24, spacing: 1.28 },
};

export function createSceneAudio(createContext: () => AudioContext = () => new AudioContext()) {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let noise: AudioBuffer | undefined;
  let motor: { oscillator: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | undefined;
  let disposed = false;
  let enabled = false;
  let active = false;
  let vehicles = 0;
  let toggleRequest = 0;
  const voices = new Set<() => void>();
  const lastCue = new Map<BattleCue, number>();

  function initialize() {
    context = createContext();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    const length = Math.ceil(context.sampleRate * 1.4);
    noise = context.createBuffer(1, length, context.sampleRate);
    const samples = noise.getChannelData(0);
    const step = Math.max(1, Math.round(context.sampleRate / 7200));
    for (let index = 0; index < length; index += step) {
      const sample = Math.random() * 2 - 1;
      samples.fill(sample, index, Math.min(length, index + step));
    }
  }

  function stopMotor() {
    if (!motor) return;
    motor.oscillator.stop();
    motor.oscillator.disconnect();
    motor.filter.disconnect();
    motor.gain.disconnect();
    motor = undefined;
  }

  function syncMotor() {
    if (!enabled || !active || !vehicles || !context || !master) {
      stopMotor();
      return;
    }
    if (!motor) {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.value = 145;
      gain.gain.value = 0;
      oscillator.connect(filter).connect(gain).connect(master);
      oscillator.start();
      motor = { oscillator, filter, gain };
    }
    const now = context.currentTime;
    motor.oscillator.frequency.setTargetAtTime(34 + vehicles * 4, now, .05);
    motor.gain.gain.setTargetAtTime(.018 + vehicles * .009, now, .07);
  }

  function syncPlayback() {
    if (!master || !context) return;
    master.gain.setValueAtTime(enabled && active ? .13 : 0, context.currentTime);
    if (!enabled || !active) {
      for (const voice of voices) voice();
      lastCue.clear();
    }
    syncMotor();
  }

  async function setEnabled(value: boolean) {
    if (disposed) return false;
    const request = ++toggleRequest;
    if (!value) {
      enabled = false;
      syncPlayback();
      return false;
    }
    try {
      if (!context) initialize();
      const current = context;
      if (!current) return false;
      if (current.state !== 'running') await current.resume();
      if (request !== toggleRequest || disposed) return enabled;
      enabled = current.state === 'running';
    } catch {
      if (request !== toggleRequest) return enabled;
      enabled = false;
    }
    syncPlayback();
    return enabled;
  }

  function setActive(value: boolean) {
    if (disposed) return;
    active = Boolean(value);
    syncPlayback();
  }

  function setVehicles(count: number) {
    if (disposed) return;
    const next = Math.min(4, Math.max(0, Math.floor(Number(count) || 0)));
    if (vehicles === next) return;
    vehicles = next;
    syncMotor();
  }

  function cue(kind: BattleCue) {
    const effect = effects[kind];
    if (!effect || !enabled || !active || !context || !master || !noise || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - (lastCue.get(kind) ?? -Infinity) < effect.spacing) return;
    if (kind === 'nuke') {
      for (const voice of voices) voice();
    } else if (voices.size >= 5) {
      return;
    }
    lastCue.set(kind, now);

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const tone = context.createOscillator();
    const toneGain = context.createGain();
    const envelope = context.createGain();
    const end = now + effect.duration;
    source.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(effect.filter, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, effect.filter * .35), end);
    tone.type = kind === 'rifle' ? 'square' : 'triangle';
    tone.frequency.setValueAtTime(effect.start, now);
    tone.frequency.exponentialRampToValueAtTime(effect.end, end);
    toneGain.gain.value = kind === 'rifle' ? .18 : .48;
    envelope.gain.setValueAtTime(.001, now);
    envelope.gain.linearRampToValueAtTime(effect.volume, now + .008);
    envelope.gain.exponentialRampToValueAtTime(.001, end);
    source.connect(filter).connect(envelope);
    tone.connect(toneGain).connect(envelope);
    envelope.connect(master);

    function release() {
      if (!voices.delete(stop)) return;
      source.onended = null;
      source.disconnect();
      filter.disconnect();
      tone.disconnect();
      toneGain.disconnect();
      envelope.disconnect();
    }

    function stop() {
      release();
      source.stop();
      tone.stop();
    }

    voices.add(stop);
    source.onended = release;
    source.start(now);
    tone.start(now);
    source.stop(end);
    tone.stop(end);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    toggleRequest++;
    enabled = false;
    active = false;
    syncPlayback();
    master?.disconnect();
    const closing = context;
    master = undefined;
    context = undefined;
    noise = undefined;
    if (closing && closing.state !== 'closed') await closing.close();
  }

  return { setEnabled, setActive, cue, setVehicles, dispose };
}
