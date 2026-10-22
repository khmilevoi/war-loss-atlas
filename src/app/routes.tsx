import { atom, reatomRoute, wrap } from '@reatom/core';
import type { AtlasData } from '../data/types';
import { createAtlasModel } from '../model/atlas';
import { Landing } from '../ui/RoutePages';
import { DataPage } from '../ui/DataPage';

/** The immutable public source is injected into each request/client frame. */
export const atlasData = atom<AtlasData | null>(null, 'atlas.source');
function source(): AtlasData {
  const data = atlasData();
  if (!data) throw new Error('Atlas source has not been initialized');
  return data;
}

export const layoutRoute = reatomRoute({
  layout: true,
  render({ outlet }) {
    const pages = outlet();
    return <>
      <header><a href="/">Атлас потерь</a><nav aria-label="Основная навигация">
        <a href="/">Глобус</a> <a href="/data">Данные и источники</a>
      </nav></header>
      <main>{pages.length ? pages : <section><h1>Страница не найдена</h1><a href="/">Вернуться к обзору</a></section>}</main>
      <footer>Исторические оценки и смерти, связанные с боевыми действиями UCDP, имеют разные определения. Общей суммы нет.</footer>
    </>;
  },
}, 'atlas.layout');

export const landingRoute = layoutRoute.reatomRoute({
  path: '',
  async loader() { return createAtlasModel(source(), { defaultLayer: 'history', defaultSelectedId: 'ww2' }); },
  render(self) {
    void self.loader();
    const model = self.loader.data();
    return model ? <Landing key="landing" model={model} /> : <p key="landing" role="status">Открываем обзор…</p>;
  },
}, 'atlas.landing');

export const dataRoute = layoutRoute.reatomRoute({
  path: 'data',
  async loader() { return createAtlasModel(source()); },
  render(self) {
    void self.loader();
    const model = self.loader.data();
    return model ? <DataPage key="data" model={model} /> : <p key="data" role="status">Открываем данные…</p>;
  },
}, 'atlas.data');

/** Preload only native exact routes, with no pathname-to-component dispatch. */
export async function preloadRoutes(): Promise<void> {
  await wrap(Promise.all([landingRoute, dataRoute].filter(route => route.exact()).map(route => route.loader())));
}

export function pageStatus(): number {
  return [landingRoute, dataRoute].some(route => route.exact()) ? 200 : 404;
}
