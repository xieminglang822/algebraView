import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = process.env.DIST_ROOT
  ? path.resolve(projectRoot, process.env.DIST_ROOT)
  : path.join(projectRoot, 'dist');
const basePath = '/algebraView';
const port = Number(process.env.PORT ?? 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const relative = pathname.slice(basePath.length) || '/';
  const requested = relative === '/' ? '/index.html' : relative;
  const filePath = path.join(distRoot, requested);

  if (!filePath.startsWith(distRoot)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch {
    // SPA fallback for client-side routes.
    try {
      const index = await readFile(path.join(distRoot, 'index.html'));
      response.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      response.end(index);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Build output not found. Run "npm run build" first.');
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`algebraView static preview: http://127.0.0.1:${port}${basePath}/`);
});
