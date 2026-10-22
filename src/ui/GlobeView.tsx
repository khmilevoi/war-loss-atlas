import { useEffect, useRef, useSyncExternalStore } from 'react';
import { atom, wrap } from '@reatom/core';
import { reatomFactoryComponent } from '@reatom/react';
import type { Placement } from '../data/types';
import type { CanvasOwner, CanvasState } from './GlobeCanvas';

type Props = { placements: readonly Placement[]; selectedId: string | null; onSelect: (id: string) => void };
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const motionSnapshot = () => window.matchMedia(motionQuery).matches;

// React owns only the external renderer bridge. Filter/selection/UI state is Reatom.
function CanvasBridge({ state, onStatus }: { state: CanvasState; onStatus: (ready: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null), owner = useRef<CanvasOwner | null>(null);
  const latest = useRef({ state, onStatus });
  latest.current = { state, onStatus };
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2');
    if (!gl) { latest.current.onStatus(false); return; }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // Both the renderer module and Globe.GL are absent from server evaluation.
    void import('./GlobeCanvas').then(module => {
      if (cancelled) return;
      owner.current = module.mountGlobe(element, latest.current.state, () => latest.current.onStatus(false));
      latest.current.onStatus(true);
    }).catch(() => { if (!cancelled) latest.current.onStatus(false); });
    return () => { cancelled = true; owner.current?.dispose(); owner.current = null; };
  }, []);
  useEffect(() => { owner.current?.update(state); }, [state]);
  return <div ref={host} className="globe-canvas" data-testid="globe-host" data-rotation={state.paused ? 'paused' : 'rotating'} />;
}

export const GlobeView = reatomFactoryComponent<Props>(() => {
  const pause = atom(false, 'atlas.globe.pause');
  const status = atom<'loading' | 'ready' | 'unavailable'>('loading', 'atlas.globe.rendererStatus');
  return props => {
    const reduced = useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
    const paused = reduced || pause();
    const rendererStatus = status();
    return <div className="globe-view" data-renderer={rendererStatus}>
      <CanvasBridge state={{ ...props, paused }} onStatus={wrap(ready => status.set(ready ? 'ready' : 'unavailable'))} />
      {rendererStatus !== 'ready' ? <p className="globe-status" data-testid="globe-status" role="status">{rendererStatus === 'loading'
        ? 'Открываем глобус. Все записи уже доступны ниже.' : 'Глобус недоступен. Список доступен ниже — выберите конфликт.'}</p> : null}
      <button className="rotation-button" disabled={rendererStatus === 'unavailable' || reduced} aria-label={paused ? 'Включить вращение' : 'Приостановить вращение'}
        title={reduced ? 'Вращение выключено настройкой уменьшения движения' : undefined}
        onClick={wrap(() => pause.set(value => !value))}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span><span>{reduced ? 'Без анимации' : paused ? 'Вращение выключено' : 'Пауза вращения'}</span></button>
    </div>;
  };
}, 'AtlasGlobeView');
