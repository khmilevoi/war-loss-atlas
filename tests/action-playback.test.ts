import { describe, expect, it, vi } from 'vitest';
import { createActionPlayback } from '../src/simulation/render-actions';

const wave = [[6, 4]] as const;

function inspectCanvas() {
  const draws: [string, number, number, number, number][] = [];
  const context = {
    fillStyle: '',
    fillRect(x: number, y: number, width: number, height: number) {
      draws.push([this.fillStyle, x, y, width, height]);
    },
  };
  const canvas = { width: 400, height: 240, getContext: () => context } as unknown as HTMLCanvasElement;
  return { canvas, frame: () => draws.splice(0) };
}

describe('schematic scene playback', () => {
  it.each(['air-strikes', 'maritime', 'patrol-contact'] as const)(
    'advances and resets %s while keeping a fixed reduced-motion frame',
    (action) => {
      const { canvas, frame } = inspectCanvas();
      const playback = createActionPlayback(canvas, action, vi.fn(), wave);
      playback.render(false);
      const opening = frame();
      playback.render(true);
      const staticFrame = frame();

      playback.step(2750);
      playback.render(false);
      expect(frame()).not.toEqual(opening);
      playback.render(true);
      expect(frame()).toEqual(staticFrame);

      playback.step(4000);
      expect(playback.finished()).toBe(true);
      playback.reset();
      expect(playback.finished()).toBe(false);
      playback.render(false);
      expect(frame()).toEqual(opening);
    },
  );

  it.each([
    ['air-strikes', 2],
    ['maritime', 2],
    ['patrol-contact', 0],
  ] as const)('emits only suitable audio cues for %s', (action, impactCount) => {
    const { canvas } = inspectCanvas();
    const cue = vi.fn();
    const playback = createActionPlayback(canvas, action, cue, wave);
    playback.render(true);
    expect(cue).not.toHaveBeenCalled();

    playback.step(5500);
    playback.step(100);
    expect(cue.mock.calls).toEqual(Array.from({ length: impactCount }, () => ['explosion']));
  });

  it('renders the current patrol wave with separate positions and restores the first wave on restart', () => {
    const { canvas, frame } = inspectCanvas();
    const playback = createActionPlayback(canvas, 'patrol-contact', vi.fn(), [[11, 9], [4, 6]]);
    const figures = () => frame().filter(([color]) => color === '#d0b48a' || color === '#a3b5ba');
    playback.render(true);
    const first = figures();
    expect(first).toHaveLength(20);
    expect(new Set(first.map(([, x, y]) => `${x},${y}`)).size).toBe(20);
    expect(playback.wave()).toEqual({ current: 1, total: 2 });

    playback.step(5500);
    playback.render(true);
    expect(figures()).toHaveLength(10);
    expect(playback.wave()).toEqual({ current: 2, total: 2 });
    expect(playback.finished()).toBe(false);

    playback.step(5500);
    expect(playback.finished()).toBe(true);
    playback.reset();
    playback.render(true);
    expect(playback.wave()).toEqual({ current: 1, total: 2 });
    expect(figures()).toEqual(first);
  });

  it.each(['air-strikes', 'maritime'] as const)('separates the trajectory markers for %s', action => {
    const { canvas, frame } = inspectCanvas();
    const playback = createActionPlayback(canvas, action, vi.fn(), [[11, 9]]);
    playback.render(true);
    const impacts = frame().filter(([color]) => color === '#c9a069' || color === '#a9b9bf');
    expect(impacts).toHaveLength(20);
    expect(new Set(impacts.map(([, x, y]) => `${x},${y}`)).size).toBe(20);
  });

  it('limits cues to one per participating side per wave even after a long time step', () => {
    const { canvas } = inspectCanvas();
    const cue = vi.fn();
    const playback = createActionPlayback(canvas, 'air-strikes', cue, [[12, 8], [10, 0]]);
    playback.step(12_000);
    expect(cue.mock.calls).toEqual([['explosion'], ['explosion'], ['explosion']]);
    expect(playback.finished()).toBe(true);
  });

  it('renders an empty patrol field without waves or cues', () => {
    const { canvas, frame } = inspectCanvas();
    const cue = vi.fn();
    const playback = createActionPlayback(canvas, 'patrol-contact', cue, []);
    playback.render(true);
    const field = frame();
    expect(field.length).toBeGreaterThan(0);
    expect(field.some(([color]) => color === '#d0b48a' || color === '#a3b5ba')).toBe(false);
    playback.step(10_000);
    expect(playback.wave()).toBeNull();
    expect(playback.finished()).toBe(true);
    expect(cue).not.toHaveBeenCalled();
  });
});
