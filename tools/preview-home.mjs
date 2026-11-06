// Local static preview with byte-range support for scroll-seekable video.
// The production Cloudflare Pages backend is not simulated here.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mp4': 'video/mp4', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path.endsWith('/') ? path+'index.html' : path));
    if (!file.startsWith(resolve(root)+sep)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    let start = 0, end = info.size-1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      start = Number(range[1]);
      end = range[2] ? Math.min(end,Number(range[2])) : end;
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
    }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Content-Length': end-start+1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {})
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file, { start, end }).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
