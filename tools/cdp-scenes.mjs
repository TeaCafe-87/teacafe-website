// Chained-scene check over the Chrome DevTools Protocol (real scroll, real screenshots).
//   node tools/cdp-scenes.mjs [desktop|mobile] [base=http://127.0.0.1:4173]
// Needs a static server on dist/ (tools/preview-static.py) and Chrome. Writes screenshots to
// bench-shots/chain-<profile>-*.jpg and prints one JSON report. Numbers come from this machine's
// headless Chrome, not from a phone.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const profile = process.argv[2] || 'desktop';
const base = process.argv[3] || 'http://127.0.0.1:4173';
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '..', 'bench-shots'); mkdirSync(shots, { recursive: true });
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333 + (profile === 'mobile' ? 1 : 0);
const prof = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run',
  '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const page = list.find((t) => t.type === 'page'); if (page) return page.webSocketDebuggerUrl; } catch {}
    await wait(200);
  }
  throw new Error('no chrome');
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  writeFileSync(join(shots, `chain-${profile}-${name}.jpg`), Buffer.from(r.data, 'base64'));
}

// In-page helpers: scroll to a scene's progress, wait for the exact frame, report state.
const HELPERS = `
window.__c = {
  secs: () => [...document.querySelectorAll('[data-scroll-scene]')],
  y(i, p) { const s = this.secs()[i]; return s.offsetTop + p * (s.offsetHeight - innerHeight); },
  top() { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const s = el && el.closest('.scroll-scene'); return s ? this.secs().indexOf(s) : -1; },
  frameOf(sc) { const s = sc.liveSource && sc.liveSource(); return s ? s.frame : null; },
  state() {
    return TeaScrollScene.scenes.map((sc, i) => ({ i, id: sc.manifest?.id, key: sc.mountedKey || null, frame: this.frameOf(sc),
      pinned: sc.section.hasAttribute('data-scene-pinned'), beats: [...sc.section.querySelectorAll('[data-beat-active]')].map((e) => e.dataset.beat).join(','),
      mask: sc.live?.mask?.() || null, loaded: sc.stats?.loaded }));
  },
  async settle(i, p) {
    const want = Math.round(p * 299), t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      const sc = TeaScrollScene.scenes[i];
      if (sc.manifest && sc.renderer && this.frameOf(sc) === want && sc.shown === sc.progress()) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  },
};`;

async function main() {
  ws = new WebSocket(await connect());
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable'); await send('Runtime.enable');
  if (profile === 'mobile') await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  else await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if (process.env.MODE === 'reduced') await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000); window.__errs = []; addEventListener("error", (e) => __errs.push(String(e.message)));' });
  await send('Page.navigate', { url: `${base}/wiki.html` });
  await wait(3000);
  await evaluate(HELPERS);
  if (process.env.MODE === 'perf') return perf();
  if (process.env.MODE === 'perf2') return perf2();
  if (process.env.MODE === 'reader') return reader();
  if (process.env.MODE === 'reduced') return reducedMode();
  if (process.env.MODE === 'debug') {             // live-layer internals at one point (DEBUG_AT="scene,progress")
    const [i, p] = (process.env.DEBUG_AT || '0,.7').split(',').map(Number);
    await evaluate(`scrollTo({ top: __c.y(${i}, ${p}), behavior: 'instant' }); await __c.settle(${i}, ${p}); await new Promise(r => setTimeout(r, 1500));`);
    const d = await evaluate(`return TeaScrollScene.scenes[${i}].live.debug()`);
    for (const k of ['fall', 'layer', 'water']) writeFileSync(join(shots, `debug-${k}.png`), Buffer.from(d[k].split(',')[1], 'base64'));
    console.log(JSON.stringify({ box: d.box, fb: d.fb }));
    return;
  }
  if (process.env.MODE === 'motion') {            // scroll held: two shots 0.5 s apart per point (diff them to see world motion)
    for (const [i, p] of [[0, .03], [0, .7], [1, .03], [2, .75]]) {
      await evaluate(`scrollTo({ top: __c.y(${i}, ${p}), behavior: 'instant' }); await __c.settle(${i}, ${p}); await new Promise(r => setTimeout(r, 1500));`);
      const f0 = await evaluate(`return __c.frameOf(TeaScrollScene.scenes[${i}])`);
      await shot(`motion-${i + 1}-${p}-a`); await wait(500); await shot(`motion-${i + 1}-${p}-b`);
      console.log(JSON.stringify({ at: `${i + 1}@${p}`, frameA: f0, frameB: await evaluate(`return __c.frameOf(TeaScrollScene.scenes[${i}])`), mask: await evaluate(`return TeaScrollScene.scenes[${i}].live?.mask?.()`) }));
    }
    return;
  }
  const report = { profile, viewport: await evaluate('return [innerWidth, innerHeight, devicePixelRatio]'), points: [], boundaries: [], sweeps: [] };

  // 1. Fixed points in each scene, down then a few back up.
  const points = [[0, 0], [0, .03], [0, .4], [0, .7], [0, 1], [1, 0], [1, .05], [1, .45], [1, .6], [1, .9], [1, 1], [2, 0], [2, .2], [2, .4], [2, .55], [2, .75], [2, .95], [2, 1], [1, .45], [0, .4]];
  for (const [i, p] of points) {
    await evaluate(`scrollTo({ top: __c.y(${i}, ${p}), behavior: 'instant' }); await __c.settle(${i}, ${p}); await new Promise(r => setTimeout(r, 900));`);
    const st = await evaluate('return { top: __c.top(), scenes: __c.state() }');
    report.points.push({ at: `${i + 1}@${p}`, top: st.top + 1, want: Math.round(p * 299), scenes: st.scenes.filter((s) => s.key && s.key !== 'sleep').map((s) => ({ s: s.i + 1, frame: s.frame, pinned: s.pinned, beats: s.beats, mask: s.mask && s.mask.f })),
      asleep: st.scenes.filter((s) => s.key === 'sleep').map((s) => s.i + 1) });
    await shot(`${i + 1}-${String(p).replace('.', '')}`);
  }

  // 2. Hand-over: a few px either side of each crossing; the topmost scene must show the shared frame.
  for (const k of [0, 1]) {
    for (const dy of [-3, 3]) {
      const r = await evaluate(`
        const s = __c.secs()[${k + 1}]; scrollTo({ top: s.offsetTop + (${dy}), behavior: 'instant' });
        await __c.settle(${dy < 0 ? k : k + 1}, ${dy < 0 ? 1 : 0}); await new Promise(r => setTimeout(r, 400));
        const top = __c.top(), sc = TeaScrollScene.scenes;
        return { top: top + 1, frames: sc.map((x) => __c.frameOf(x)), pinned: sc.map((x) => x.section.hasAttribute('data-scene-pinned')) };`);
      report.boundaries.push({ crossing: `${k + 1}->${k + 2}`, dy, ...r });
    }
    await shot(`cross-${k + 1}${k + 2}`);
  }

  // 3. Continuous sweeps over all three scenes: pacing + the frame on top must never jump.
  for (const [name, ms, dir] of [['all-down 18s', 18000, 1], ['all-up 18s', 18000, -1], ['all-down fast 4s', 4000, 1]]) {
    const r = await evaluate(`
      const a = __c.y(0, 0), b = __c.y(2, 1);
      scrollTo({ top: ${dir} > 0 ? a : b, behavior: 'instant' }); await new Promise(r => setTimeout(r, 1500));
      const gaps = [], seq = [], awake = []; let last = performance.now(); const t0 = last;
      await new Promise((done) => { const step = (now) => {
        gaps.push(now - last); last = now; const u = Math.min(1, (now - t0) / ${ms});
        const top = __c.top(), sc = TeaScrollScene.scenes[top];
        const f = sc ? __c.frameOf(sc) : null; if (top >= 0 && f !== null && f >= 0) seq.push(top * 300 + f);
        awake.push(TeaScrollScene.scenes.filter((x) => x.renderer).length);
        if (u >= 1) return done();
        const k = ${dir} > 0 ? u : 1 - u; scrollTo({ top: a + (b - a) * k, behavior: 'instant' }); requestAnimationFrame(step);
      }; requestAnimationFrame(step); });
      const g = gaps.slice(1).sort((x, y) => x - y), pct = (q) => g[Math.min(g.length - 1, Math.floor(q * g.length))];
      let back = 0, jump = 0; for (let i = 1; i < seq.length; i++) { const d = (seq[i] - seq[i - 1]) * ${dir}; if (d < 0) back = Math.max(back, -d); jump = Math.max(jump, Math.abs(d)); }
      return { frames: g.length, avgMs: +(g.reduce((x, y) => x + y, 0) / g.length).toFixed(1), p95Ms: +pct(.95).toFixed(1), maxMs: +g[g.length - 1].toFixed(1),
        over20: g.filter((x) => x > 20).length, wrongWaySteps: back, maxStep: jump, maxAwakeRenderers: Math.max(...awake),
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };`);
    report.sweeps.push({ name, ...r });
  }
  report.requests = await evaluate(`const e = performance.getEntriesByType('resource').filter((x) => /\\/scenes\\//.test(x.name));
    const kind = (n) => (n.match(/(wiki-0\\d)\\/(frames-desktop|masks-desktop|masks-mobile|mobile-g8\\.mp4|poster[^/]*)/) || []).slice(1).join(':');
    const out = {}; for (const x of e) { const k = kind(x.name); if (!k) continue; out[k] = out[k] || { n: 0, kb: 0 }; out[k].n++; out[k].kb += Math.round((x.encodedBodySize || x.transferSize || 0) / 1024); } return out;`);
  report.errors = await evaluate('return (window.__errs || []).slice(0, 10)');
  console.log(JSON.stringify(report, null, 1));
}
// MODE=perf: each scene alone, all its frames loaded, 6 s down + 6 s up; then again without the live layer.
async function perf() {
  const out = [], n = await evaluate('return __c.secs().length');
  for (let i = 0; i < n; i++) {
    for (const live of [true, false]) {
      const r = await evaluate(`
        scrollTo({ top: __c.y(${i}, .5), behavior: 'instant' });
        const sc = TeaScrollScene.scenes[${i}], t0 = performance.now();
        while ((!sc.renderer || !sc.stats.total || sc.stats.loaded < sc.stats.total) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100));
        if (!${live}) { sc.live?.destroy(); sc.live = null; }
        await new Promise(r => setTimeout(r, 1500));
        const a = __c.y(${i}, 0), b = __c.y(${i}, 1), gaps = []; let last = performance.now(); const s0 = last;
        await new Promise((done) => { const step = (now) => { gaps.push(now - last); last = now; const u = (now - s0) / 12000; if (u >= 1) return done();
          const k = u < .5 ? u * 2 : 2 - u * 2; scrollTo({ top: a + (b - a) * k, behavior: 'instant' }); requestAnimationFrame(step); }; requestAnimationFrame(step); });
        const g = gaps.slice(2).sort((x, y) => x - y), pct = (q) => g[Math.min(g.length - 1, Math.floor(q * g.length))];
        const res = { scene: ${i + 1}, live: ${live}, renderer: sc.stats.renderer, loaded: sc.stats.loaded + '/' + sc.stats.total, frames: g.length, avgMs: +(g.reduce((x, y) => x + y, 0) / g.length).toFixed(1),
          p95Ms: +pct(.95).toFixed(1), maxMs: +g[g.length - 1].toFixed(1), over20: g.filter((x) => x > 20).length, awake: TeaScrollScene.scenes.filter((x) => x.renderer).length };
        if (!${live}) { sc.mountedKey = null; sc.mount(); }
        return res;`);
      out.push(r);
      console.log(JSON.stringify(r));
    }
  }
}
// MODE=perf2: scene 1 alone (other scenes destroyed), live layer variants, to find what costs.
async function perf2() {
  const variants = process.env.VARIANTS === 'nolive' ? [['no live', null]] : [['no live', null], ['full', 'FULL'], ['water+koi', { water: true, koi: 'K' }], ['waterfall', { waterfall: true }], ['mist', { mist: { frames: [1, 300] } }]];
  if (process.env.PREP) await evaluate(process.env.PREP);
  await evaluate(`TeaScrollScene.scenes.slice(1).forEach((s) => s.destroy()); scrollTo({ top: __c.y(0, .5), behavior: 'instant' });
    const sc = TeaScrollScene.scenes[0], t0 = performance.now(); window.__full = null;
    while ((!sc.renderer || sc.stats.loaded < sc.stats.total) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100));
    window.__full = JSON.parse(JSON.stringify(sc.manifest.live));`);
  for (const [name, cfg] of variants) {
    const r = await evaluate(`
      const sc = TeaScrollScene.scenes[0], cfg = ${JSON.stringify(cfg)};
      sc.live?.destroy(); sc.live = null;
      if (cfg) { const c = cfg === 'FULL' ? __full : { ...cfg }; if (c.koi === 'K') c.koi = __full.koi;
        sc.live = TeaSceneLive.attach(sc, sc.stage.querySelector('[data-scene-world]'), { camera: sc.camera, live: c }); }
      await new Promise(r => setTimeout(r, 1500));
      const a = __c.y(0, 0), b = __c.y(0, 1), gaps = []; let last = performance.now(); const s0 = last;
      await new Promise((done) => { const step = (now) => { gaps.push(now - last); last = now; const u = (now - s0) / 12000; if (u >= 1) return done();
        const k = u < .5 ? u * 2 : 2 - u * 2; scrollTo({ top: a + (b - a) * k, behavior: 'instant' }); requestAnimationFrame(step); }; requestAnimationFrame(step); });
      const g = gaps.slice(2).sort((x, y) => x - y), pct = (q) => g[Math.min(g.length - 1, Math.floor(q * g.length))];
      return { variant: '${name}', frames: g.length, avgMs: +(g.reduce((x, y) => x + y, 0) / g.length).toFixed(1), p95Ms: +pct(.95).toFixed(1), maxMs: +g[g.length - 1].toFixed(1), over20: g.filter((x) => x > 20).length };`);
    console.log(JSON.stringify(r));
  }
}
// MODE=reader: explore + reader end to end with real wheel / key / touch / text input; prints checks, saves shots.
async function reader() {
  const mobile = profile === 'mobile';
  const checks = [];
  const ok = (name, pass, info) => { checks.push({ name, pass: !!pass, info }); };
  const st = () => evaluate(`const s = TeaWikiReader.state(), L = document.getElementById('wiki-reader'), vis = (n) => n && !n.hidden && n.offsetParent !== null;
    return { ...s, hash: location.hash, y: Math.round(scrollY), vis: getComputedStyle(L).visibility, focus: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName),
      shown: [...document.querySelectorAll('.chapter-screen:not(.is-off) h2')].map(h => h.id), target: (document.querySelector('.is-target') || {}).id || null,
      entries: [...document.querySelectorAll('.wiki-entry')].filter(vis).map(w => w.dataset.entry), grid: [...document.querySelectorAll('.chapter-screen:not(.is-off) .wiki-grid')].some(vis),
      crumb: document.querySelector('.wiki-crumb').textContent, back: !document.querySelector('.wiki-reader-back').hidden,
      results: document.querySelectorAll('.wiki-result').length, count: document.querySelector('.wiki-results-count').textContent,
      facets: [...document.querySelectorAll('.wiki-facet')].filter(vis).map(b => b.dataset.scope + ':' + b.getAttribute('aria-pressed')),
      refineLabel: vis(document.querySelector('.wiki-refine-label')), reset: vis([...document.querySelectorAll('.wiki-refine .wiki-inline-btn')][0]),
      first: (document.querySelector('.wiki-result b') || {}).textContent || null, input: document.getElementById('wiki-search').value,
      topbarHidden: document.querySelector('.topbar').classList.contains('topbar-hidden'), flying: document.documentElement.hasAttribute('data-journey-flying') };`);
  const key = async (k, code, mods = 0) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: { Escape: 27, Enter: 13, Slash: 191, ArrowDown: 40, ArrowUp: 38, PageDown: 34, PageUp: 33 }[code] || 0, text: type === 'keyDown' && k.length === 1 ? k : undefined }); };
  const wheel = (deltaY, x = 720, y = 450) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mobile ? 195 : x, y: mobile ? 420 : y, deltaX: 0, deltaY });
  const swipe = async (dy) => {   // finger moves up by dy (positive = scroll down)
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 500 }] });
    for (let k = 1; k <= 6; k++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 500 - dy * k / 6 }] }); await wait(16); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const step = (dir) => (mobile ? swipe(dir * 160) : wheel(dir * 120));
  const pause = (ms = 600) => wait(ms);
  const until = async (expr, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluate(`return !!(${expr})`).catch(() => false)) return Date.now() - t0; await wait(60); } return -1; };
  const settled = () => until(`!TeaSceneJourney.nav.gliding() && TeaScrollScene.scenes.every(s => !s.manifest || s.shown === s.progress())`);
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const stops = await evaluate(`return TeaSceneJourney.stops().map(Math.round)`);

  // ---- opening + explore (after the site intro has handed the topbar over)
  await until(`!document.body.classList.contains('site-intro-pending')`); await pause(1200);
  let s = await st();
  const open0 = await evaluate(`const h = document.querySelector('h1'); return { h1: h.textContent.trim(), crumb: !!document.querySelector('.scroll-scene .crumb'), placeholder: /暫定|待補充|Lorem|Placeholder/i.test(document.body.innerText),
    dock: getComputedStyle(document.querySelector('.wiki-dock')).display !== 'none' }`);
  ok('opening: 玩法百科, no visual breadcrumb, no placeholder copy, dock ready', open0.h1 === '玩法百科' && !open0.crumb && !open0.placeholder && open0.dock && !s.open && !s.topbarHidden, { ...open0, s });
  await shot('explore-opening');
  await step(1); await settled();
  s = await st();
  const f1 = await evaluate(`return __c.frameOf(TeaScrollScene.scenes[0])`);
  ok('one gesture glides to the next stop (scene 1 at 0.4, exact frame)', Math.abs(s.y - stops[1]) <= 2 && f1 === Math.round(0.4 * 299), { y: s.y, stop: stops[1], f1 });
  ok('topbar tucks away once exploring', s.topbarHidden, s);
  // trackpad inertia: one push then decaying deltas = one stop
  if (!mobile) {
    await wheel(90); for (const d of [80, 64, 50, 38, 28, 20, 14, 9, 6, 4]) { await wait(18); await wheel(d); }
    await settled(); s = await st();
    ok('trackpad inertia does not skip stops', Math.abs(s.y - stops[2]) <= 2, { y: s.y, stops });
  } else { await step(1); await settled(); s = await st(); ok('swipe glides to the next stop', Math.abs(s.y - stops[2]) <= 2, { y: s.y, stops }); }
  await key('PageDown', 'PageDown'); await settled(); s = await st();
  ok('Page Down: next stop (act 2 categories)', Math.abs(s.y - stops[3]) <= 2 && (await evaluate(`return TeaScrollScene.scenes[1].section.querySelector('[data-beat="chapters"]').hasAttribute('data-beat-active')`)), { y: s.y, stops });
  await shot('explore-chapters');
  await step(-1); await wait(250); s = await st();
  ok('scrolling up peeks the topbar', !s.topbarHidden, s);
  await settled(); s = await st();
  ok('up: previous stop', Math.abs(s.y - stops[2]) <= 2, { y: s.y, stops });
  await key('ArrowDown', 'ArrowDown'); await settled();
  // ---- quick journey via the dock (目錄) from act 2: flies on, frames never step back
  const y0 = (await st()).y;
  await evaluate(`window.__fl = []; (function f(){ const sc = TeaScrollScene.scenes; __fl.push([performance.now(), scrollY, ...sc.map(x => __c.frameOf(x))]); if (!TeaWikiReader.state().open) requestAnimationFrame(f); })()`);
  await evaluate(`document.querySelector('.wiki-dock [data-wiki-open="catalog"]').click()`);
  const tFly = await until(`TeaWikiReader.state().open`, 15000);
  s = await st();
  const fl = await evaluate(`const end = TeaSceneJourney.scrollAt({ scene: 2, p: 1 }); let back = 0, prevY = -1; for (const r of __fl) { if (r[1] < prevY - 1) back++; prevY = r[1]; } return { end: Math.round(end), back, n: __fl.length }`);
  ok('目錄: camera flies on through the bridge into the cave, then the catalogue opens', s.open && s.view === 'chapter' && tFly > 1500 && tFly < 8000 && fl.back === 0 && Math.abs(s.y - fl.end) <= 2, { tFly, fl, s });
  await pause(600);
  await shot('reader-chapter');
  ok('reader: topbar pinned, dock hidden, focus on the chapter title', !s.topbarHidden && (await evaluate(`return getComputedStyle(document.querySelector('.wiki-dock')).opacity === '0'`)) && s.focus === s.chapter, s);
  // ---- category browsing vs entry reading
  await evaluate(`document.querySelector('.sidebar-links a[href="#travel"]').click()`); await pause(300);
  s = await st(); ok('category: overview list, no entry bodies, URL #travel', s.view === 'chapter' && s.shown.join() === 'travel' && s.grid && !s.entries.length && s.hash === '#travel', s);
  await evaluate(`document.querySelector('.chapter-screen:not(.is-off) .wiki-card[href="#waystone"]').click()`); await pause(300);
  s = await st(); ok('entry: only that entry, URL #waystone, back available', s.view === 'entry' && s.entries.join() === 'waystone' && !s.grid && s.hash === '#waystone' && s.back && s.crumb.includes('茶咖路標'), s);
  await shot('reader-entry');
  await evaluate(`document.querySelector('.wiki-pager-next').click()`); await pause(300);
  s = await st(); ok('entry pager: next entry', s.view === 'entry' && s.entries.join() === 'home', s);
  // ---- search: magnifier and Enter run the same search; filtering lives with the results
  await evaluate(`document.getElementById('wiki-search').focus()`);
  await send('Input.insertText', { text: '指令' }); await pause(300);
  await evaluate(`document.querySelector('.wiki-search-go').click()`); await pause(300);
  const viaButton = await st();
  await evaluate(`document.getElementById('wiki-search').focus()`); await key('Enter', 'Enter'); await pause(300);
  const viaEnter = await st();
  ok('search: magnifier and Enter give the same results', viaButton.view === 'search' && viaButton.results > 0 && viaButton.results === viaEnter.results && viaButton.count === viaEnter.count, { viaButton: viaButton.count, viaEnter: viaEnter.count });
  ok('篩選結果 appears only with results across categories', viaEnter.refineLabel === (viaEnter.facets.length > 0) && viaEnter.facets.length >= 3, viaEnter);
  await shot('reader-search');
  const scope = viaEnter.facets[1].split(':')[0];
  await evaluate(`document.querySelector('.wiki-facet[data-scope="${scope}"]').click()`); await pause(300);
  s = await st(); ok('a filter narrows the results; reset shows all again', s.results < viaEnter.results && s.facets.includes(scope + ':true') && s.reset, s);
  await evaluate(`[...document.querySelectorAll('.wiki-refine .wiki-inline-btn')].find(b => b.textContent === '重設篩選').click()`); await pause(300);
  s = await st(); ok('reset filter', s.results === viaEnter.results && s.facets.includes(':true'), s);
  await key('ArrowDown', 'ArrowDown'); await key('Enter', 'Enter'); await pause(400);
  s = await st(); ok('keyboard: ArrowDown + Enter opens the first result as an entry', s.view === 'entry' && s.entries.length === 1, s);
  await evaluate(`document.querySelector('.wiki-reader-back').click()`); await pause(300);
  s = await st(); ok('back returns to the results with the query', s.view === 'search' && s.input === '指令' && s.results > 0, s);
  await evaluate(`document.querySelector('.wiki-search-clear').click()`); await pause(200);
  await evaluate(`document.querySelector('.wiki-search-go').click()`); await pause(200);
  s = await st(); ok('empty search: a hint, no error', s.view === 'search' && s.results === 0 && /輸入/.test(s.count), s);
  await send('Input.insertText', { text: '不存在的玩法xyz' }); await pause(300);
  s = await st(); ok('no results: clear message and 清除搜尋', s.results === 0 && /找不到/.test(s.count) && !s.refineLabel, s);
  await key('Escape', 'Escape'); await pause(200);
  s = await st(); ok('Esc in the field clears the query', s.input === '' && s.open, s);
  // ---- images (test-only figures injected into an entry): lazy, lightbox, fallback
  await evaluate(`const w = document.querySelector('.wiki-entry[data-entry="teleport"]');
    w.insertAdjacentHTML('beforeend', '<figure class="wiki-figure"><img src="/assets/scenes/wiki-01/poster-desktop.webp" alt="測試圖" width="1600" height="900"><figcaption>測試說明</figcaption></figure><figure class="wiki-figure"><img src="/missing-test.webp" alt="不存在的圖" width="10" height="10"></figure>');
    w.querySelectorAll('img').forEach(i => { i.loading = 'lazy'; i.closest('figure').dataset.alt = i.alt; });`);
  await evaluate(`location.hash = 'teleport'`); await pause(800);
  const img = await evaluate(`const f = document.querySelector('.wiki-entry[data-entry="teleport"] .wiki-figure img'); const r = f.getBoundingClientRect(); f.click(); await new Promise(r => setTimeout(r, 300));
    const box = document.querySelector('.wiki-lightbox'); return { open: box.open, cap: box.querySelector('.wiki-lightbox-cap').textContent, ratio: +(r.width / r.height).toFixed(2), broken: document.querySelectorAll('.wiki-figure.is-broken').length }`);
  await key('Escape', 'Escape'); await pause(300);
  const scroll0 = await evaluate(`const p = document.getElementById('wiki-reader-main'); p.scrollTop = 0; return { y: scrollY, max: p.scrollHeight - p.clientHeight, at: document.elementFromPoint(1000, 600)?.className, box: document.querySelector('.wiki-lightbox').open }`);
  await wheel(240, 1000, 600); await pause(400);
  const inner = await evaluate(`return { panel: document.getElementById('wiki-reader-main').scrollTop, y: scrollY }`);
  ok('wheel inside the reader scrolls the article, not the scenes', inner.y === scroll0.y && scroll0.max > 0 && (inner.panel > 0 || mobile), { scroll0, inner });
  s = await st();
  ok('images: keep proportions, enlarge with caption, Esc closes only the viewer, failed file shows alt', img.open && img.cap === '測試說明' && Math.abs(img.ratio - 1.78) < 0.03 && img.broken === 1 && s.open, { img, open: s.open });
  // ---- closing returns to where exploring stopped; Back / Forward / reload
  await key('Escape', 'Escape'); await pause(900);
  s = await st(); ok('Esc closes; scene position from before the flight restored', !s.open && s.vis === 'hidden' && Math.abs(s.y - y0) <= 2 && s.hash === '', { ...s, y0 });
  await key('/', 'Slash');
  await until(`TeaWikiReader.state().open`, 15000); await pause(500);
  s = await st(); ok('"/" flies in and opens search with the field focused', s.open && s.view === 'search' && s.focus === 'wiki-search', s);
  await evaluate(`history.back()`); await pause(1200);
  s = await st(); ok('browser Back closes the reader at the old position', !s.open && Math.abs(s.y - y0) <= 2, { ...s, y0 });
  await evaluate(`history.forward()`); await pause(900);
  s = await st(); ok('browser Forward reopens it', s.open, s);
  await evaluate(`document.querySelector('.sidebar-links a[href="#economy"]').click()`); await pause(300);
  await send('Page.reload'); await wait(1500);
  for (let i = 0; i < 40 && !(await evaluate('return !!window.TeaWikiReader && document.readyState === "complete"').catch(() => false)); i++) await wait(250);
  await evaluate(HELPERS);
  s = await st(); ok('reload keeps the reader on #economy', s.open && s.shown.join() === 'economy', s);
  await evaluate(`document.querySelector('.wiki-reader-close').click()`); await pause(1600);
  s = await st(); ok('…and closing after the reload still returns to the old scene position', !s.open && Math.abs(s.y - y0) <= 2, { ...s, y0 });
  // ---- cave entrance
  await evaluate(`scrollTo({ top: TeaSceneJourney.stops()[5], behavior: 'instant' })`); await settled(); await pause(500);
  const yCave = (await st()).y;
  await shot('explore-library');
  await evaluate(`document.querySelector('.scene-enter').click()`);
  const tCave = await until(`TeaWikiReader.state().open`, 10000);
  s = await st(); ok('進入藏書閣: a short flight deeper into the cave, then the catalogue', s.open && s.view === 'chapter' && tCave > 1200 && tCave < 4000, { tCave, s });
  await evaluate(`document.querySelector('.wiki-reader-close').click()`); await pause(900);
  s = await st(); ok('close returns to the cave entrance', !s.open && Math.abs(s.y - yCave) <= 2, { ...s, yCave });
  await step(1); await settled(); s = await st();
  ok('past the library: next gesture reaches the footer', Math.abs(s.y - stops[stops.length - 1]) <= 2 && (await evaluate(`return getComputedStyle(document.querySelector('.wiki-dock')).opacity === '0'`)), { y: s.y, stops });
  // ---- 搜尋 from the very opening: ink veil over the jump to act 2 at 0.7, then the flight
  await evaluate(`scrollTo({ top: 0, behavior: 'instant' })`); await settled(); await pause(800);
  await evaluate(`window.__fl = []; window.__veil = false; (function f(){ const sc = TeaScrollScene.scenes;
    __veil = __veil || document.querySelector('.scene-veil').classList.contains('is-on');
    __fl.push([performance.now(), scrollY, ...sc.map(x => [x.renderer && (x.renderer.video ? Math.round(x.renderer.video.currentTime * 30) : x.renderer.drawn), Math.round(x.progress() * 299), x.section.hasAttribute('data-scene-pinned')])]);
    if (!TeaWikiReader.state().open) requestAnimationFrame(f); })()`);
  const tFar0 = Date.now();
  await evaluate(`document.querySelector('.wiki-dock [data-wiki-open="search"]').click()`);
  const tFar = await until(`TeaWikiReader.state().open`, 20000);
  const far = await evaluate(`let back = 0, lagSum = 0, lagN = 0, lagMax = 0, prev = null;
    for (const r of __fl) { const pin = r.slice(2).findIndex(x => x[2]); if (pin < 0) continue; const [drawn, want] = r[2 + pin];
      if (drawn == null || drawn < 0) continue; const lag = Math.abs(want - drawn); lagSum += lag; lagN++; if (lag > lagMax) { lagMax = lag; window.__lagAt = [pin, drawn, want, Math.round(r[1]), __fl.indexOf(r), JSON.stringify(r.slice(2))]; }
      if (prev && prev[0] === pin && drawn < prev[1] - 1) back++; prev = [pin, drawn]; }
    return { veil: __veil, samples: __fl.length, back, lagAvg: +(lagSum / Math.max(1, lagN)).toFixed(1), lagMax, lagAt: window.__lagAt, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }`);
  s = await st();
  ok('搜尋 from the opening: veil over the jump, flight, search focused; frames never step back', s.open && s.view === 'search' && s.focus === 'wiki-search' && far.veil && far.back === 0 && tFar > 2500 && tFar < 11000, { tFar, far });
  console.log('far-journey', JSON.stringify({ ms: tFar, ...far }));
  await evaluate(`document.querySelector('.wiki-reader-close').click()`); await pause(2000);
  s = await st(); ok('…closing returns to the opening', !s.open && s.y <= 2, s);
  // ---- shared link
  await send('Page.navigate', { url: 'about:blank' }); await wait(500);
  await send('Page.navigate', { url: `${base}/wiki.html#teleport` }); await wait(1500);
  for (let i = 0; i < 40 && !(await evaluate('return !!window.TeaWikiReader && document.readyState === "complete"').catch(() => false)); i++) await wait(250);
  await evaluate(HELPERS);
  s = await st(); ok('fresh load of a shared link #teleport opens that entry', s.open && s.view === 'entry' && s.entries.join() === 'teleport' && s.focus === 'teleport', s);
  await evaluate(`document.querySelector('.wiki-reader-close').click()`); await pause(900);
  s = await st(); ok('closing a shared link stays on the page', !s.open && s.hash === '' && s.vis === 'hidden', s);
  const live = await evaluate(`return { errors: window.__errs || [] }`);
  ok('no page errors', !live.errors.length, live);
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : '  ' + JSON.stringify(c.info).slice(0, 900)}`);
  console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}

// MODE=reduced: prefers-reduced-motion. Static scenes, native scrolling, the reader opens at once.
async function reducedMode() {
  const checks = [];
  const ok = (name, pass, info) => { checks.push({ name, pass: !!pass, info }); };
  const s0 = await evaluate(`return { static: TeaScrollScene.scenes.every(s => s.section.classList.contains('is-static')), media: performance.getEntriesByType('resource').filter(e => /\\/assets\\/scenes\\/.+\\.(webp|mp4)/.test(e.name) && !/poster/.test(e.name)).length }`);
  ok('all scenes static, no frame/video downloads', s0.static && s0.media === 0, s0);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: 300 }); await wait(500);
  const y1 = await evaluate(`return Math.round(scrollY)`);
  ok('wheel scrolls natively (no glide)', y1 > 0 && y1 <= 400, { y1 });
  const t0 = Date.now();
  await evaluate(`document.querySelector('.wiki-dock [data-wiki-open="search"]').click()`); await wait(150);
  const s1 = await evaluate(`return { ...TeaWikiReader.state(), y: Math.round(scrollY), focus: document.activeElement.id }`);
  ok('dock opens search immediately, no flight, position untouched', s1.open && s1.view === 'search' && s1.focus === 'wiki-search' && s1.y === y1 && Date.now() - t0 < 1500, s1);
  await shot('reduced-reader');
  const errs = await evaluate(`return window.__errs || []`);
  ok('no page errors', !errs.length, errs);
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : '  ' + JSON.stringify(c.info)}`);
  console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { ws && ws.close(); } catch {} chrome.kill(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch {} }, 1500); });
