import { atom, bind } from '@reatom/core';
import { h } from '@reatom/jsx';
import { copy, sceneTerrainCopy, type Locale } from '../i18n/atlas-copy';
import { PixelIcon } from '../ui/pixel-icon';
import type { SceneHandle, mountScene } from '../simulation/mount-scene';
import type { SceneDefinition } from '../simulation/scene-config';

export type SceneLoader = typeof mountScene;

export class SceneModuleLoadError extends Error {}

export function SceneSlot({ scene, label, locale, load }: {
  scene: SceneDefinition; label: string; locale: Locale; load: SceneLoader;
}) {
  const text = copy[locale];
  const terrain = scene.terrain;
  const status = atom<'loading' | 'ready' | 'error'>('loading', 'sceneSlot.status');
  const sound = atom(false, 'sceneSlot.sound');
  const soundPending = atom(false, 'sceneSlot.soundPending');
  const soundFailed = atom(false, 'sceneSlot.soundFailed');
  let host: HTMLElement;
  let request: AbortController | undefined;
  let session: SceneHandle | undefined;
  let requiresReload = false;

  function stop() {
    request?.abort();
    request = undefined;
    session?.dispose();
    session = undefined;
  }

  function start() {
    stop();
    status.set('loading');
    sound.set(false);
    soundPending.set(false);
    soundFailed.set(false);
    requiresReload = false;
    const attempt = new AbortController();
    request = attempt;
    const ready = bind((handle: SceneHandle) => {
      if (request !== attempt || attempt.signal.aborted) {
        handle.dispose();
        return;
      }
      session = handle;
      status.set('ready');
    });
    const failed = bind((error: unknown) => {
      if (request !== attempt || attempt.signal.aborted) return;
      requiresReload = error instanceof SceneModuleLoadError;
      status.set('error');
    });
    void Promise.resolve().then(() => {
      attempt.signal.throwIfAborted();
      return load(host, { scene, signal: attempt.signal });
    }).then(ready, failed);
  }

  function toggleSound() {
    if (!session || soundPending()) return;
    const current = session;
    const enabled = !sound();
    soundPending.set(true);
    soundFailed.set(false);
    const updateSound = bind((success: boolean) => {
      if (current !== session) return;
      soundPending.set(false);
      if (success) sound.set(enabled);
      else soundFailed.set(true);
    });
    void current.setSound(enabled).then(updateSound, () => updateSound(false));
  }

  return (
    <section class="scene-slot" aria-label={label} data-scene-id={scene.id}>
      <h3>{label}</h3>
      <div class="scene-slot__view" aria-busy={() => status() === 'loading'}>
        <div class="scene-slot__host" ref={element => {
          host = element;
          start();
          return stop;
        }} />
        {() => status() === 'loading' ? (
          <div class="scene-slot__status" role="status"><i aria-hidden="true" />{text.sceneLoading}</div>
        ) : status() === 'error' ? (
          <div class="scene-slot__status">
            <p role="alert">{text.sceneError}</p>
            <button type="button" on:click={() => {
              if (requiresReload) window.location.reload();
              else start();
            }}>{text.sceneRetry}</button>
          </div>
        ) : null}
      </div>
      <div class="scene-slot__controls">
        <button type="button" class="pixel-action" aria-pressed={sound} disabled={() => status() !== 'ready' || soundPending()}
          on:click={toggleSound}>{() => <PixelIcon name={sound() ? 'sound' : 'mute'} />}{text.sceneSound}</button>
        <button type="button" class="pixel-action" disabled={() => status() !== 'ready'} on:click={() => session?.restart()}>
          <PixelIcon name="restart" />{text.sceneRestart}
        </button>
        {() => soundFailed() ? <p role="status">{text.sceneSoundUnavailable}</p> : null}
      </div>
      <p class="scene-slot__note">{text.sceneNote}</p>
      {terrain ? <p class="scene-slot__note">
        {sceneTerrainCopy[locale][terrain.copyKey].note}{' '}
        <a href={terrain.source[locale]}>{sceneTerrainCopy[locale][terrain.copyKey].source}</a>
      </p> : null}
    </section>
  );
}
