import { describe, expect, it } from 'vitest';
import { createSceneAudio } from '../src/audio/scene-audio';

function controlledContext(initial: AudioContextState = 'running') {
  let state = initial;
  let closes = 0;
  let release = () => {};
  let disconnects = 0;
  const gain = {
    value: 0,
    setValueAtTime: (value: number) => { gain.value = value; },
  };
  const context = {
    get state() { return state; },
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain: () => ({ gain, connect() {}, disconnect() { disconnects++; } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(10) }),
    close: async () => { closes++; state = 'closed'; },
    resume: () => new Promise<void>(resolve => {
      release = () => {
        if (state !== 'closed') state = 'running';
        resolve();
      };
    }),
  };
  return {
    context: context as unknown as AudioContext,
    release: () => release(),
    state: () => ({ state, closes, disconnects, gain: gain.value }),
  };
}

describe('scene audio lifetime', () => {
  it('does not create audio before a sound gesture and closes exactly once', async () => {
    const native = controlledContext();
    let contexts = 0;
    const audio = createSceneAudio(() => { contexts++; return native.context; });
    audio.setActive(true);
    expect(contexts).toBe(0);
    expect(await audio.setEnabled(true)).toBe(true);
    expect(native.state().gain).toBe(.13);
    await audio.dispose();
    await audio.dispose();
    expect(contexts).toBe(1);
    expect(native.state()).toEqual({ state: 'closed', closes: 1, disconnects: 1, gain: 0 });
    expect(await audio.setEnabled(true)).toBe(false);
  });

  it('ignores a suspended context resuming after disposal', async () => {
    const native = controlledContext('suspended');
    const audio = createSceneAudio(() => native.context);
    const enabling = audio.setEnabled(true);
    await audio.dispose();
    native.release();
    expect(await enabling).toBe(false);
    expect(native.state().state).toBe('closed');
    expect(native.state().closes).toBe(1);
  });
});
