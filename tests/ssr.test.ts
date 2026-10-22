import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { context, urlAtom, wrap } from '@reatom/core';
import { atlasData, dataRoute, landingRoute, preloadRoutes } from '../src/app/routes';
import { loadAtlasData } from '../src/data';
import { renderPage } from '../src/entry-server';
import { createHttpHandler } from '../server/index';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve());
  server.closeAllConnections();
}))); });
const appHtml = (html: string) => html.split('<script id="atlas-initial"')[0];

describe('request-isolated server rendering', () => {
  it('uses native page navigation to push a page and applies that route’s own model defaults', async () => {
    await context.start(async () => {
      const operations: boolean[] = [];
      urlAtom.sync.set(() => (_url, replace) => { operations.push(replace ?? false); });
      atlasData.set(loadAtlasData());
      urlAtom.set(new URL('http://atlas.local/'));
      await wrap(preloadRoutes());
      expect(landingRoute.loader.data()?.filters().layer).toBe('history');
      expect(landingRoute.loader.data()?.selectedId()).toBe('ww2');
      dataRoute.go();
      await wrap(preloadRoutes());
      expect(urlAtom().pathname).toBe('/data');
      expect(operations.at(-1)).toBe(false);
      expect(dataRoute.loader.data()?.filters().layer).toBe('ucdp');
      expect(dataRoute.loader.data()?.filteredRows()).toHaveLength(1650);
      expect(dataRoute.loader.data()?.selectedId()).toBe(null);
      landingRoute.go();
      await wrap(preloadRoutes());
      expect(urlAtom().pathname).toBe('/');
      expect(landingRoute.loader.data()?.filters().layer).toBe('history');
      expect(landingRoute.loader.data()?.selectedId()).toBe('ww2');
    });
  });
  it('keeps concurrent query and selection state inside its own response', async () => {
    const [afghan, india] = await Promise.all([
      renderPage('/data?q=Afghanistan&selected=333'),
      renderPage('/data?q=India&selected=11345'),
    ]);
    expect(afghan.status).toBe(200);
    expect(india.status).toBe(200);
    expect(appHtml(afghan.html)).toContain('value="Afghanistan"');
    expect(appHtml(afghan.html)).not.toContain('value="India"');
    expect(appHtml(india.html)).toContain('value="India"');
    expect(appHtml(india.html)).not.toContain('value="Afghanistan"');
    expect(appHtml(india.html)).toContain('data-selected-id="11345"');
    expect(appHtml(afghan.html)).not.toContain('data-selected-id="11345"');
    const fresh = await renderPage('/data');
    expect(appHtml(fresh.html)).toContain('value=""');
    expect(appHtml(fresh.html)).toContain('data-selected-id=""');
  });

  it('renders meaningful native rows with their full row count before JavaScript runs', async () => {
    const { html, status } = await renderPage('/data');
    const app = appHtml(html);
    expect(status).toBe(200);
    expect(app).toContain('Данные за каждой точкой');
    expect(app).toContain('aria-rowcount="1651"');
    expect(app).toContain('data-row-id="');
    expect(app).toContain('1989');
    expect(app.match(/data-row-id=/g)?.length).toBeGreaterThan(0);
    expect(app.match(/data-row-id=/g)?.length).toBeLessThan(30);
    expect(app).toContain('UCDP');
  });

  it('uses independent route defaults and accepts explicit URL layer and selection', async () => {
    const [home, data, explicit] = await Promise.all([
      renderPage('/'), renderPage('/data'), renderPage('/?layer=ucdp&selected=11345'),
    ]);
    expect(appHtml(home.html)).toContain('data-layer="history"');
    expect(appHtml(home.html)).toContain('data-selected-id="ww2"');
    expect(appHtml(home.html)).toContain('Вторая мировая');
    expect(appHtml(data.html)).toContain('data-layer="ucdp"');
    expect(appHtml(explicit.html)).toContain('data-layer="ucdp"');
    expect(appHtml(explicit.html)).toContain('data-selected-id="11345"');
  });

  it('returns a readable 404 for an unknown page', async () => {
    const page = await renderPage('/unavailable');
    expect(page.status).toBe(404);
    expect(appHtml(page.html)).toContain('Страница не найдена');
  });

  it('escapes script-closing input and restores the exact initial URL and permitted data', async () => {
    const url = '/data?q=</script><script>alert(1)</script>';
    const { html } = await renderPage(url);
    const json = html.match(/<script id="atlas-initial" type="application\/json">(.*?)<\/script>/s)?.[1];
    expect(json).toBeDefined();
    expect(json).not.toContain('<');
    const initial = JSON.parse(json!);
    expect(initial.url).toBe(url);
    expect(initial.data.nativeRows).toHaveLength(1650);
    expect(initial.data.conflicts).toHaveLength(202);
  });
});

describe('HTTP surface', () => {
  it('answers health and direct routes with the correct HTTP status and document', async () => {
    const server = createServer(createHttpHandler({ renderPage, template: '<!doctype html><div id="root"><!--app-html--></div>' }));
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP listener');
    const base = `http://127.0.0.1:${address.port}`;
    const [health, home, data, missing] = await Promise.all([
      fetch(`${base}/health`), fetch(base), fetch(`${base}/data`), fetch(`${base}/unknown`),
    ]);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(home.status).toBe(200);
    expect(data.status).toBe(200);
    expect(await data.text()).toContain('data-row-id="');
    expect(missing.status).toBe(404);
  });
});
