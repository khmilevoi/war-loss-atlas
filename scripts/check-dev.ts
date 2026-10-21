import assert from 'node:assert/strict';
import { createAtlasServer } from '../server/index';

async function main() {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); warn(...args); };
  const app = await createAtlasServer({ development: true });
  try {
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP address');
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/data`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes('data-row-id="'));
    assert.ok(html.includes('/@vite/client'));
    const entry = await fetch(`${base}/src/entry-client.tsx`);
    assert.equal(entry.status, 200);
    assert.equal(warnings.some(message => message.includes('window is undefined')), false,
      'SSR module evaluation must not initialize a global URL');
    console.log('Vite middleware SSR and transformed client entry passed.');
  } finally {
    console.warn = warn;
    app.server.closeAllConnections();
    await app.close();
  }
}

// Allow Vite workers to finish closing on Windows, then release the import-time
// Reatom BroadcastChannel keeping this one-shot command alive.
main().then(() => setTimeout(() => process.exit(0), 100), error => {
  console.error(error); setTimeout(() => process.exit(1), 100);
});
