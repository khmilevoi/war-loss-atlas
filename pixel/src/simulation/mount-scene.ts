import { createSceneAudio } from '../audio/scene-audio';
import { loadSceneSprites } from '../resources/sprite-assets';
import { createBattle } from './battle';
import { createCanvasRenderer } from './render-canvas';
import type { SceneDefinition } from './scene-config';

export interface SceneHandle {
  restart(): void;
  setSound(enabled: boolean): Promise<boolean>;
  dispose(): void;
}

export async function mountScene(
  host: HTMLElement,
  { scene, signal, unitBudget }: { scene: SceneDefinition; signal: AbortSignal; unitBudget?: readonly [number, number] },
): Promise<SceneHandle> {
  const document = host.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('Scene has no browser window');

  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const assets = await loadSceneSprites(scene.assets, signal, { reducedMotion: motion.matches });
  signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  const effects = document.createElement('canvas');
  const flash = document.createElement('div');
  canvas.width = 400;
  canvas.height = 240;
  canvas.dataset.sceneCanvas = scene.id;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { width: '100%', height: 'auto', display: 'block', imageRendering: 'pixelated' });
  effects.hidden = true;
  effects.setAttribute('aria-hidden', 'true');
  flash.dataset.sceneFlash = scene.id;
  flash.setAttribute('aria-hidden', 'true');
  for (const [layer, zIndex] of [[effects, 10], [flash, 11]] as const) {
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      pointerEvents: 'none', zIndex: String(zIndex),
    });
  }
  effects.style.imageRendering = 'pixelated';
  Object.assign(flash.style, { background: '#fff', opacity: '0' });

  const renderer = createCanvasRenderer(canvas, effects, flash, assets);
  const audio = createSceneAudio();
  const battle = createBattle({
    scenario: scene.scenario,
    seed: scene.seed,
    aftermathAt: scene.aftermathAt,
    aftermathDuration: scene.aftermathDuration,
    finaleAt: scene.finaleAt,
    landscape: scene.landscape,
    unitBudget,
    reducedMotion: () => motion.matches,
    onCue: audio.cue,
    onVehicles: audio.setVehicles,
    onFieldReset: renderer.clearField,
    onSettledBlood: renderer.settleBlood,
  });
  let disposed = false;
  let frameId: number | undefined;
  let lastFrame: number | undefined;

  function draw(alpha = 1) {
    renderer.render(battle.frame(), alpha);
  }

  function playable() {
    return !disposed && !document.hidden && !motion.matches && !battle.frame().finished;
  }

  function stopFrame() {
    if (frameId !== undefined) view!.cancelAnimationFrame(frameId);
    frameId = undefined;
    lastFrame = undefined;
  }

  function loop(timestamp: number) {
    frameId = undefined;
    if (!playable()) return;
    if (lastFrame !== undefined) battle.step(Math.min(100, timestamp - lastFrame));
    lastFrame = timestamp;
    const frame = battle.frame();
    renderer.render(frame, frame.finished ? 1 : frame.interpolation);
    if (frame.finished) audio.setActive(false);
    else frameId = view!.requestAnimationFrame(loop);
  }

  function sync() {
    const active = playable();
    battle.setPaused(!active);
    audio.setActive(active);
    if (!active) stopFrame();
    else if (frameId === undefined) frameId = view!.requestAnimationFrame(loop);
  }

  function applyReducedMotion() {
    if (motion.matches && !battle.frame().finished) {
      // Computing the static frame may simulate several seconds in one turn.
      stopFrame();
      audio.setActive(false);
      battle.setPaused(true);
      if (scene.aftermathDuration !== undefined) {
        battle.triggerNuke('aftermath');
        battle.step(scene.aftermathDuration + 40);
      } else if (scene.finaleAt !== undefined) {
        battle.step(scene.finaleAt + 40);
      }
    }
    draw();
    sync();
  }

  function restart() {
    if (disposed) return;
    stopFrame();
    audio.setActive(false);
    battle.reset();
    applyReducedMotion();
  }

  async function setSound(enabled: boolean) {
    if (disposed) return false;
    const actual = await audio.setEnabled(enabled);
    return !disposed && actual === enabled;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    document.removeEventListener('visibilitychange', sync);
    motion.removeEventListener('change', applyReducedMotion);
    stopFrame();
    battle.dispose();
    void audio.dispose().catch(() => {});
    canvas.remove();
    effects.remove();
    flash.remove();
  }

  try {
    host.append(canvas, effects, flash);
    signal.addEventListener('abort', dispose, { once: true });
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', applyReducedMotion);
    applyReducedMotion();
    return { restart, setSound, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
