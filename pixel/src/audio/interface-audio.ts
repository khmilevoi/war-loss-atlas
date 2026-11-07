export type InterfaceCue = 'flag' | 'press' | 'open' | 'close';

const tones = {
  flag: [660, 760, 0.047],
  press: [510, 460, 0.036],
  open: [430, 640, 0.066],
  close: [590, 380, 0.056],
} as const satisfies Record<InterfaceCue, readonly [number, number, number]>;

export function createInterfaceAudio() {
  let context: AudioContext | undefined;
  let resuming: Promise<void> | undefined;
  const previousCue = new Map<InterfaceCue, number>();

  function activate() {
    if (typeof AudioContext === 'undefined' || context?.state === 'running' || resuming) return;
    try {
      context ??= new AudioContext();
      const resume = context.resume().catch(() => {});
      resuming = resume;
      void resume.then(() => { if (resuming === resume) resuming = undefined; });
    } catch {
      // The interface remains usable if Web Audio is unavailable.
    }
  }

  function play(cue: InterfaceCue) {
    const active = context;
    if (!active) return;
    const playTone = () => {
      if (context !== active || active.state !== 'running') return;
      const now = active.currentTime;
      const previous = previousCue.get(cue);
      if (previous !== undefined && now - previous < 0.11) return;
      previousCue.set(cue, now);

      const [start, end, duration] = tones[cue];
      const oscillator = active.createOscillator();
      const volume = active.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.setValueAtTime(end, now + duration / 2);
      volume.gain.setValueAtTime(0.0001, now);
      volume.gain.linearRampToValueAtTime(0.024, now + 0.004);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(volume).connect(active.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        volume.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + duration + 0.004);
    };
    if (resuming) void resuming.then(playTone);
    else playTone();
  }

  function close() {
    const active = context;
    context = undefined;
    resuming = undefined;
    previousCue.clear();
    if (active) void active.close().catch(() => {});
  }

  return { activate, play, close };
}
