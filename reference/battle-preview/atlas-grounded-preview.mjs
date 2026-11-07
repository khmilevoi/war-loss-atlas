import { readFile, readdir, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const prefix = '/__atlas-preview/';
const resources = new Map([
  ['component.js', ['atlas-grounded-component.js', 'text/javascript; charset=utf-8']],
  ['roster.mjs', ['atlas-unit-roster.mjs', 'text/javascript; charset=utf-8']],
  ['theme.css', ['atlas-grounded-theme.css', 'text/css; charset=utf-8']],
  ['battle-engine.js', ['battle-engine.js', 'text/javascript; charset=utf-8']],
  ['battle-audio.js', ['atlas-battle-audio.js', 'text/javascript; charset=utf-8']],
  ['sprites/battle-topdown-infantry.png', ['battle-topdown-infantry.png', 'image/png']],
  ['sprites/battle-topdown-vehicles.png', ['battle-topdown-vehicles.png', 'image/png']],
  ['sprites/battle-topdown-terrain.png', ['battle-topdown-terrain.png', 'image/png']],
  ['sprites/battle-topdown-roads.png', ['battle-topdown-roads.png', 'image/png']],
  ['sprites/battle-topdown-nuke.png', ['battle-topdown-nuke.png', 'image/png']],
  ['sprites/battle-topdown-tank-crew.png', ['battle-topdown-tank-crew.png', 'image/png']],
  ['sprites/battle-topdown-equipment-wrecks.png', ['battle-topdown-equipment-wrecks.png', 'image/png']],
  ['sprites/drip.webp', ['atlas-pixel-drip.webp', 'image/webp']],
]);

function addPreview(template) {
  const head = [
    `<link rel="stylesheet" href="${prefix}theme.css">`,
    ...['battle-engine.js', 'battle-audio.js'].map(
      script => `<script defer src="${prefix}${script}"></script>`,
    ),
    `<script type="module" src="${prefix}component.js"></script>`,
  ].join('\n');

  return template
    .replace('</head>', () => `${head}\n</head>`)
    .replace(/<body(?:\s[^>]*)?>/, body => `${body}\n<atlas-live-preview></atlas-live-preview>`);
}

export async function createGroundedHandler(root = resolve('web-atlas')) {
  const clientDir = resolve(root, 'dist/client');
  const serverDir = resolve(root, 'dist/server');
  const previewDir = await realpath(dirname(fileURLToPath(import.meta.url)));
  const [template, serverAssets] = await Promise.all([
    readFile(resolve(clientDir, 'index.html'), 'utf8'),
    readdir(resolve(serverDir, 'assets')),
  ]);
  const renderers = serverAssets.filter(file => /^entry-server-[\w-]+\.js$/.test(file));
  if (renderers.length !== 1) throw new Error('Run npm run build in web-atlas to refresh its SSR build.');
  if (!template.includes('<!--app-html-->') || !template.includes('</head>') || !/<body(?:\s[^>]*)?>/.test(template)) {
    throw new Error('The atlas build template is missing an expected HTML anchor.');
  }
  const [{ createHttpHandler }, { renderPage }] = await Promise.all([
    import(pathToFileURL(resolve(serverDir, 'index.js')).href),
    import(pathToFileURL(resolve(serverDir, 'assets', renderers[0])).href),
  ]);
  const previewTemplate = addPreview(template);
  const atlas = createHttpHandler({
    renderPage,
    clientDir,
    template: url => {
      const { pathname } = new URL(url, 'http://atlas.local');
      return pathname === '/' || pathname === '/data' ? previewTemplate : template;
    },
  });

  return async (request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url ?? '/', 'http://atlas.local').pathname;
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!pathname.startsWith(prefix)) return atlas(request, response);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const resource = resources.get(pathname.slice(prefix.length));
    if (!resource) {
      response.writeHead(404).end();
      return;
    }
    const [filename, mimeType] = resource;
    try {
      const path = await realpath(resolve(previewDir, filename));
      if (dirname(path) !== previewDir) {
        response.writeHead(404).end();
        return;
      }
      const content = await readFile(path);
      response.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      }).end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        response.writeHead(404).end();
        return;
      }
      console.error('Preview resource request failed', error);
      response.writeHead(500).end();
    }
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.ATLAS_PREVIEW_PORT ?? 4177);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ATLAS_PREVIEW_PORT.');
  const server = createServer(await createGroundedHandler());
  server.listen(port, '127.0.0.1', () => {
    console.log(`Atlas preview http://127.0.0.1:${port}/ (PID ${process.pid})`);
  });
  const stop = () => {
    server.close();
    server.closeIdleConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
