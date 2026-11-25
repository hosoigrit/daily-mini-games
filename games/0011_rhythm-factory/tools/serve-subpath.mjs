import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';

const mount = '/daily-mini-games/games/0011_rhythm-factory/';
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const entries = await readdir('dist', { recursive: true, withFileTypes: true });
const files = new Map();
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const path = join(entry.parentPath, entry.name);
  files.set(mount + path.slice('dist/'.length), await readFile(path));
}

createServer((request, response) => {
  const requested = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const path = requested === mount ? mount + 'index.html' : requested;
  const content = files.get(path);
  if (!content || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  const suffix = path.slice(path.lastIndexOf('.'));
  response.writeHead(200, { 'Content-Type': mimeTypes[suffix] ?? 'application/octet-stream' });
  response.end(request.method === 'HEAD' ? undefined : content);
}).listen(4174, '127.0.0.1');
