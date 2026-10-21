import { context, urlAtom, wrap } from '@reatom/core';
import { reatomContext } from '@reatom/react';
import { hydrateRoot } from 'react-dom/client';
import { atlasData, preloadRoutes } from './app/routes';
import { App } from './ui/App';
import type { AtlasData } from './data/types';

const initialElement = document.getElementById('atlas-initial');
const container = document.getElementById('root');
if (!initialElement?.textContent || !container) throw new Error('Missing atlas SSR document');
const initial = JSON.parse(initialElement.textContent) as { url: string; data: AtlasData };

await context.start(async () => {
  atlasData.set(initial.data);
  // Reading first installs Reatom's native link/popstate listeners in this frame.
  urlAtom();
  urlAtom.set(new URL(initial.url, window.location.origin), true);
  const frame = context();
  await wrap(preloadRoutes());
  hydrateRoot(container, <reatomContext.Provider value={frame}><App /></reatomContext.Provider>);
});
