import { describe, expect, it, vi } from 'vitest';
import { createActionPlayback } from '../src/simulation/render-actions';

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
      const playback = createActionPlayback(canvas, action, vi.fn());
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
    const playback = createActionPlayback(canvas, action, cue);
    playback.render(true);
    expect(cue).not.toHaveBeenCalled();

    playback.step(5500);
    playback.step(100);
    expect(cue.mock.calls).toEqual(Array.from({ length: impactCount }, () => ['explosion']));
  });
});
