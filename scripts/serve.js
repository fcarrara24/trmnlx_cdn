#!/usr/bin/env node
/**
 * Server statico per lo sviluppo locale.
 *
 * Serve la root del progetto e mappa /schedule.json su public/schedule.json,
 * riproducendo il layout pubblicato su GitHub Pages.
 *
 * Uso: npm run serve  →  http://localhost:8080
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/** Traduce un URL in un percorso su disco, rifiutando le path traversal. */
function resolveRequest(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  // schedule.json vive in public/ ma è servito dalla root, come su Pages.
  const mapped = relative === 'schedule.json' ? 'public/schedule.json' : relative;
  const resolved = path.resolve(ROOT, mapped);
  return resolved.startsWith(ROOT) ? resolved : null;
}

const server = createServer(async (request, response) => {
  const filePath = resolveRequest(request.url);

  if (!filePath) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) throw new Error('is a directory');

    response.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': stats.size,
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      .end(`404 — ${request.url}`);
  }
});

server.listen(PORT, () => {
  console.log(`Viewer su http://localhost:${PORT}  (debug: http://localhost:${PORT}/?debug=1)`);
});
