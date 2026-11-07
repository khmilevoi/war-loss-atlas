import { createSceneAudio } from '../audio/scene-audio';
import type { Estimate } from '../catalog';
import { loadSceneSprites } from '../resources/sprite-assets';
import { createBattle } from './battle';
import { createActionPlayback } from './render-actions';
import { createCanvasRenderer } from './render-canvas';
import { createActionWaves, createSceneDeployment, type ActionSceneDefinition, type BattleSceneDefinition, type SceneDefinition } from './scene-config';

export interface SceneHandle {
  restart(): void;
  setSound(enabled: boolean): Promise<boolean>;
  dispose(): void;
}

export interface SceneWaveStatus {
  current: number;
  total: number;
  plannedUnits: number;
}

interface ScenePlayback {
  render(reduced: boolean, interpolate?: boolean): void;
  step(milliseconds: number): void;
  finished(): boolean;
  reset(): void;
  readonly plannedUnits: number;
  wave(): Omit<SceneWaveStatus, 'plannedUnits'> | null;
  setPaused?(value: boolean): void;
  dispose?(): void;
}

export async function mountScene(
  host: HTMLElement,
  { scene, signal, estimate, calibratedUnits, onWave }: {
    scene: SceneDefinition; signal: AbortSignal; estimate: Estimate; calibratedUnits: number | null;
    onWave?: (status: SceneWaveStatus) => void;
  },
): Promise<SceneHandle> {
  const document = host.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('Scene has no browser window');

  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const assets = scene.action ? {} : await loadSceneSprites(scene.assets, signal, { reducedMotion: motion.matches });
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

  const audio = createSceneAudio();
  const playback: ScenePlayback = scene.action
    ? createSchematicPlayback(scene)
    : createBattlePlayback(scene);
  let disposed = false;
  let frameId: number | undefined;
  let lastFrame: number | undefined;
  let previousWave: number | undefined;

  function createSchematicPlayback(config: ActionSceneDefinition): ScenePlayback {
    const waves = createActionWaves(config, calibratedUnits);
    return {
      ...createActionPlayback(canvas, config.action, audio.cue, waves),
      plannedUnits: waves.reduce((sum, [first, second]) => sum + first + second, 0),
    };
  }

  function createBattlePlayback(config: BattleSceneDefinition): ScenePlayback {
    const renderer = createCanvasRenderer(canvas, effects, flash, assets);
    const deployment = createSceneDeployment(config, estimate, calibratedUnits);
    const battle = createBattle({
      scenario: config.scenario,
      seed: config.seed,
      aftermathAt: config.aftermathAt,
      aftermathDuration: config.aftermathDuration,
      biome: config.biome,
      landscape: config.landscape,
      deployment,
      reducedMotion: () => motion.matches,
      onCue: audio.cue,
      onVehicles: audio.setVehicles,
      onFieldReset: renderer.clearField,
      onSettledBlood: renderer.settleBlood,
    });
    return {
      render(reduced, interpolate) {
        if (reduced && !battle.frame().finished && config.aftermathDuration !== undefined) {
          battle.triggerNuke('aftermath');
          battle.step(config.aftermathDuration + 40);
        }
        const frame = battle.frame();
        renderer.render(frame, interpolate && !frame.finished ? frame.interpolation : 1);
      },
      step: battle.step,
      finished: () => battle.frame().finished,
      reset: battle.reset,
      plannedUnits: deployment?.reduce((sum, [first, second]) => sum + first.length + second.length, 0) ?? 0,
      wave: () => battle.frame().wave,
      setPaused: battle.setPaused,
      dispose: battle.dispose,
    };
  }

  function playable() {
    return !disposed && !document.hidden && !motion.matches && !playback.finished();
  }

  function stopFrame() {
    if (frameId !== undefined) view!.cancelAnimationFrame(frameId);
    frameId = undefined;
    lastFrame = undefined;
  }

  function draw(reduced: boolean, interpolate?: boolean) {
    playback.render(reduced, interpolate);
    const wave = playback.wave();
    if (wave && wave.current !== previousWave) {
      previousWave = wave.current;
      onWave?.({ ...wave, plannedUnits: playback.plannedUnits });
    }
  }

  function loop(timestamp: number) {
    frameId = undefined;
    if (!playable()) return;
    if (lastFrame !== undefined) playback.step(Math.min(100, timestamp - lastFrame));
    lastFrame = timestamp;
    draw(false, true);
    if (playback.finished()) audio.setActive(false);
    else frameId = view!.requestAnimationFrame(loop);
  }

  function sync() {
    const active = playable();
    playback.setPaused?.(!active);
    audio.setActive(active);
    if (!active) stopFrame();
    else if (frameId === undefined) frameId = view!.requestAnimationFrame(loop);
  }

  function applyReducedMotion() {
    if (motion.matches) {
      stopFrame();
      audio.setActive(false);
      playback.setPaused?.(true);
    }
    draw(motion.matches);
    sync();
  }

  function restart() {
    if (disposed) return;
    stopFrame();
    audio.setActive(false);
    playback.reset();
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
    playback.dispose?.();
    void audio.dispose().catch(() => {});
    canvas.remove();
    effects.remove();
    flash.remove();
  }

  try {
    host.append(canvas);
    if (!scene.action) host.append(effects, flash);
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
