import { useEffect, useRef, useSyncExternalStore } from 'react';
import { atom, wrap } from '@reatom/core';
import { reatomFactoryComponent } from '@reatom/react';
import type { CanvasOwner, CanvasState, RendererStatus } from './GlobeCanvas';

type Props = Omit<CanvasState, 'paused'>;
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const motionSnapshot = () => window.matchMedia(motionQuery).matches;

// React owns only the external renderer bridge. Filter/selection/UI state is Reatom.
function CanvasBridge({ state, onStatus }: { state: CanvasState; onStatus: (status: RendererStatus) => void }) {
  const host = useRef<HTMLDivElement>(null), owner = useRef<CanvasOwner | null>(null);
  const latest = useRef({ state, onStatus });
  latest.current = { state, onStatus };
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    // Both the renderer module and Globe.GL are absent from server evaluation.
    void import('./GlobeCanvas').then(module => {
      if (cancelled) return;
      owner.current = module.mountGlobe(element, latest.current.state, status => latest.current.onStatus(status));
      latest.current.onStatus(owner.current ? 'ready' : 'unavailable');
    }).catch(() => { if (!cancelled) latest.current.onStatus('unavailable'); });
    return () => { cancelled = true; owner.current?.dispose(); owner.current = null; };
  }, []);
  useEffect(() => { owner.current?.update(state); }, [state]);
  return <div ref={host} className="globe-canvas" data-testid="globe-host" data-rotation={state.paused ? 'paused' : 'rotating'} />;
}

export const GlobeView = reatomFactoryComponent<Props>(() => {
  const pause = atom(false, 'atlas.globe.pause');
  const status = atom<RendererStatus>('loading', 'atlas.globe.rendererStatus');
  return props => {
    const reduced = useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
    const paused = reduced || pause();
    const rendererStatus = status();
    return <div className="globe-view" data-renderer={rendererStatus}>
      <CanvasBridge state={{ ...props, paused }} onStatus={wrap(nextStatus => status.set(nextStatus))} />
      {rendererStatus !== 'ready' ? <p className="globe-status" data-testid="globe-status" role="status">{rendererStatus === 'loading'
        ? 'Открываем глобус. Все записи уже доступны ниже.' : rendererStatus === 'recovering'
          ? 'Восстанавливаем глобус. Все записи доступны ниже.' : 'Глобус недоступен. Список доступен ниже — выберите конфликт.'}</p> : null}
      <button className="rotation-button" disabled={rendererStatus !== 'ready' || reduced} aria-label={paused ? 'Включить вращение' : 'Приостановить вращение'}
        title={reduced ? 'Вращение выключено настройкой уменьшения движения' : undefined}
        onClick={wrap(() => pause.set(value => !value))}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span><span>{reduced ? 'Без анимации' : paused ? 'Вращение выключено' : 'Пауза вращения'}</span></button>
    </div>;
  };
}, 'AtlasGlobeView');
