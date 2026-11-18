"""Headless benchmark runner for scroll scenes.

Serves dist/ (with Range support), injects tools/bench-scroll-scene.js into pages
opened with ?bench=<case>, collects the POSTed results and launches headless Chrome
once per case.
  python tools/bench-server.py [desktop|mobile] [case ...]
Results print as JSON lines and are appended to bench-results.jsonl next to this script's parent.
Numbers come from THIS machine's browser; they are not real phone measurements."""
import json, os, subprocess, sys, tempfile, threading
from functools import partial
from http.server import ThreadingHTTPServer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('preview', os.path.join(os.path.dirname(__file__), 'preview-static.py'))
# Re-use the Range handler without starting its server.
src = open(spec.origin, encoding='utf-8').read().split('root = os.path.join')[0]
ns = {}
exec(src, ns)
RangeHandler = ns['RangeHandler']

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, '..', 'dist')
BENCH_JS = open(os.path.join(HERE, 'bench-scroll-scene.js'), encoding='utf-8').read()
OUT = os.path.join(HERE, '..', 'bench-results.jsonl')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
done = threading.Event()

class BenchHandler(RangeHandler):
    def do_GET(self):
        if '?bench=' in self.path and self.path.split('?')[0].endswith('.html'):
            html = open(os.path.join(DIST, self.path.split('?')[0].lstrip('/')), encoding='utf-8').read()
            body = html.replace('</body>', f'<script>{BENCH_JS}</script></body>').encode('utf-8')
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        super().do_GET()
    def do_POST(self):
        data = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8')
        with open(OUT, 'a', encoding='utf-8') as f: f.write(data + '\n')
        print(data, flush=True)
        self.send_response(204); self.end_headers()
        done.set()

if __name__ == '__main__':
    profile = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
    cases = sys.argv[2:] or ['frames', 'video-g1', 'video-g8', 'video-g30']
    port = 4199
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(BenchHandler, directory=DIST))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    size = ['--window-size=1440,900'] if profile == 'desktop' else ['--window-size=390,844', '--force-device-scale-factor=3']
    if profile.startswith('shots'):                 # shots-desktop / shots-mobile: PNGs for visual review
        outdir = os.path.join(HERE, '..', 'bench-shots'); os.makedirs(outdir, exist_ok=True)
        size = ['--window-size=1440,900'] if profile.endswith('desktop') else ['--window-size=390,844', '--force-device-scale-factor=2']
        for case in cases:
            with tempfile.TemporaryDirectory() as prof:
                subprocess.run([CHROME, '--headless=new', f'--user-data-dir={prof}', '--no-first-run', '--hide-scrollbars', *size,
                                '--virtual-time-budget=9000', f'--screenshot={os.path.join(outdir, profile + "-" + case + ".png")}',
                                f'http://127.0.0.1:{port}/wiki.html?bench={case}'], timeout=120, capture_output=True)
        server.shutdown(); sys.exit(0)
    for case in cases:
        done.clear()
        with tempfile.TemporaryDirectory() as prof:
            p = subprocess.Popen([CHROME, '--headless=new', f'--user-data-dir={prof}', '--no-first-run', '--ignore-gpu-blocklist',
                                  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', *size, *os.environ.get('BENCH_FLAGS', '').split(),
                                  f'http://127.0.0.1:{port}/wiki.html?bench={case}'])
            if not done.wait(180): print(json.dumps({'case': case, 'error': 'timeout'}), flush=True)
            p.kill(); p.wait()
    server.shutdown()
