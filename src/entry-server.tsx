import { context, urlAtom, wrap } from '@reatom/core';
import { reatomContext } from '@reatom/react';
import { renderToString } from 'react-dom/server';
import { loadAtlasData } from './data';
import { atlasData, pageStatus, preloadRoutes } from './app/routes';
import { App } from './ui/App';

export async function renderPage(url: string): Promise<{ html: string; status: number }> {
  return context.start(async () => {
    urlAtom.sync.set(() => () => {});
    urlAtom.set(new URL(url, 'http://atlas.local'));
    const data = loadAtlasData();
    atlasData.set(data);
    const frame = context();
    await wrap(preloadRoutes());
    const app = renderToString(<reatomContext.Provider value={frame}><App /></reatomContext.Provider>);
    // JSON is text inside a script element: escaping '<' prevents HTML parser break-out.
    const initial = JSON.stringify({ url, data }).replace(/</g, '\\u003c');
    return { html: `<div id="root">${app}</div><script id="atlas-initial" type="application/json">${initial}</script>`, status: pageStatus() };
  });
}
