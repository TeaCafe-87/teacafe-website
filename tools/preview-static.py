"""Local static preview of dist/ with HTTP Range support (needed for video seeking).
Python stand-in for tools/preview-home.mjs when Node is unavailable.
  python tools/preview-static.py [port]   -> http://127.0.0.1:4173
The Cloudflare Functions API (/api/*) is not simulated."""
import os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

class RangeHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.js': 'text/javascript', '.woff2': 'font/woff2'}
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def send_head(self):
        m = re.match(r'bytes=(\d+)-(\d*)$', self.headers.get('Range', ''))
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start, end = int(m[1]), int(m[2]) if m[2] else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.end_headers(); return None
        f = open(path, 'rb'); f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f
    def copyfile(self, src, dst):
        left = getattr(self, '_remaining', None)
        if left is None: return super().copyfile(src, dst)
        while left > 0:
            chunk = src.read(min(65536, left))
            if not chunk: break
            dst.write(chunk); left -= len(chunk)
        self._remaining = None
    def log_message(self, *a): pass

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
print(f'Local: http://127.0.0.1:{port}', flush=True)
ThreadingHTTPServer(('127.0.0.1', port), partial(RangeHandler, directory=root)).serve_forever()
