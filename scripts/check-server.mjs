import assert from 'node:assert/strict';
import { createAtlasServer } from '../dist/server/index.js';

// Uses the compiled production entry and an OS-assigned port; no dev tooling or orphan process.
async function main() {
  const app = await createAtlasServer();
  try {
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const [health, home, data, missing] = await Promise.all([
    fetch(`${base}/health`), fetch(base), fetch(`${base}/data`), fetch(`${base}/no-such-page`),
  ]);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(home.status, 200);
  assert.equal(data.status, 200);
  assert.equal(missing.status, 404);
  const homeHtml = await home.text();
  const dataHtml = await data.text();
  assert.ok(homeHtml.includes('data-selected-id="ww2"'));
  assert.ok(dataHtml.includes('Данные за каждой точкой') && dataHtml.includes('data-row-id="'));
  const assetPath = dataHtml.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(assetPath, 'Built module script link');
  const asset = await fetch(`${base}${assetPath}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /javascript/);
  const attribution = await fetch(`${base}/licenses/ATTRIBUTION.md`);
  assert.equal(attribution.status, 200);
  const source = await fetch(`${base}/src/entry-server.tsx`);
  assert.equal(source.status, 404);
  console.log('Production HTTP smoke passed: /, /data, /health, 404, assets, attribution, source exclusion.');
  } finally {
  app.server.closeAllConnections();
  await app.close();
  }
}

// core1001.3.0 opens an import-time BroadcastChannel in Node. Close our HTTP
// resources first, then explicitly exit this one-shot check (also on failure).
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
