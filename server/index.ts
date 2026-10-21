import { createServer, type RequestListener, type Server } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderPage as productionRender } from '../src/entry-server';

type RenderPage = (url: string) => Promise<{ html: string; status: number }>;
interface HandlerOptions {
  renderPage: RenderPage;
  template: string | ((url: string) => Promise<string>);
  clientDir?: string;
}
const mimeTypes: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8',
};
const within = (root: string, path: string): boolean => {
  const child = relative(root, path);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
};

export function createHttpHandler(options: HandlerOptions): RequestListener {
  return async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
      }
      const url = new URL(request.url ?? '/', 'http://atlas.local');
      const head = request.method === 'HEAD';
      if (url.pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(head ? undefined : '{"status":"ok"}'); return;
      }
      if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/licenses/')) {
        if (!options.clientDir) { response.writeHead(404).end(); return; }
        let pathname: string;
        try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end(); return; }
        if (pathname.includes('\0') || pathname.includes('\\')) { response.writeHead(400).end(); return; }
        const root = resolve(options.clientDir);
        const candidate = resolve(root, `.${pathname}`);
        if (!within(root, candidate)) { response.writeHead(404).end(); return; }
        try {
          // Also reject symlinks leaving the build tree, not just textual '../' paths.
          const actual = await realpath(candidate);
          if (!within(await realpath(root), actual) || !(await stat(actual)).isFile()) { response.writeHead(404).end(); return; }
          const body = await readFile(actual);
          response.writeHead(200, {
            'Content-Type': mimeTypes[extname(actual)] ?? 'application/octet-stream',
            'Content-Length': body.length,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
          }).end(head ? undefined : body); return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
          response.writeHead(404).end(); return;
        }
      }
      const relativeUrl = `${url.pathname}${url.search}`;
      const [page, template] = await Promise.all([
        options.renderPage(relativeUrl),
        typeof options.template === 'string' ? options.template : options.template(relativeUrl),
      ]);
      const html = template.replace('<!--app-html-->', () => page.html);
      response.writeHead(page.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        .end(head ? undefined : html);
    } catch (error) {
      console.error('Atlas request failed', error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Не удалось открыть страницу. Попробуйте ещё раз.');
    }
  };
}

export async function createAtlasServer(options: { development?: boolean; root?: string } = {}): Promise<{
  server: Server; close: () => Promise<void>;
}> {
  const root = resolve(options.root ?? process.cwd());
  if (options.development) {
    // Dynamic import stays behind this branch; production needs no Vite or tsx.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'custom' });
    const handler = createHttpHandler({
      renderPage: async url => {
        try {
          const entry = await vite.ssrLoadModule('/src/entry-server.tsx');
          return await entry.renderPage(url);
        } catch (error) { vite.ssrFixStacktrace(error as Error); throw error; }
      },
      template: async url => vite.transformIndexHtml(url, await readFile(resolve(root, 'index.html'), 'utf8')),
    });
    const server = createServer((request, response) => vite.middlewares(request, response, () => handler(request, response)));
    return { server, close: async () => { await closeServer(server); await vite.close(); } };
  }
  const clientDir = resolve(root, 'dist/client');
  const template = await readFile(resolve(clientDir, 'index.html'), 'utf8');
  const server = createServer(createHttpHandler({ renderPage: productionRender, template, clientDir }));
  return { server, close: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
    server.closeIdleConnections();
  });
}

// Imports from tests and smoke checks do not open a listener.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const app = await createAtlasServer({ development: process.argv.includes('--dev') });
  app.server.listen(port, '0.0.0.0', () => {
    console.log(`Atlas listening on http://0.0.0.0:${port} (PID ${process.pid})`);
  });
  const stop = () => { void app.close().then(() => process.exit(0), error => { console.error(error); process.exit(1); }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
