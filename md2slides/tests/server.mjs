import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const contents = await readFile(file);
    res.setHeader('content-type', (types[extname(file)] || 'application/octet-stream') + '; charset=utf-8');
    res.end(contents);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4173, '127.0.0.1');
