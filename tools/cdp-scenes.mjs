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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000); window.__errs = []; addEventListener("error", (e) => __errs.push(String(e.message)));' });
  await send('Page.navigate', { url: `${base}/wiki.html` });
  await wait(3000);
  await evaluate(HELPERS);
  if (process.env.MODE === 'perf') return perf();
  if (process.env.MODE === 'perf2') return perf2();
  if (process.env.MODE === 'reader') return reader();
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
// MODE=reader: the Wiki reader end to end with real key/text input; prints checks, saves shots.
async function reader() {
  const checks = [];
  const ok = (name, pass, info) => { checks.push({ name, pass: !!pass, info }); };
  const st = () => evaluate(`const s = TeaWikiReader.state(), L = document.getElementById('wiki-reader');
    return { ...s, hash: location.hash, y: Math.round(scrollY), vis: getComputedStyle(L).visibility, focus: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName),
      shown: [...document.querySelectorAll('.chapter-screen:not(.is-off) h2')].map(h => h.id), target: (document.querySelector('.is-target') || {}).id || null,
      crumb: document.querySelector('.wiki-crumb').textContent, back: !document.querySelector('.wiki-reader-back').hidden,
      results: document.querySelectorAll('.wiki-result').length, count: document.querySelector('.wiki-results-count').textContent,
      first: (document.querySelector('.wiki-result b') || {}).textContent || null, input: document.getElementById('wiki-search').value };`);
  const key = async (k, code, mods = 0) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: { Escape: 27, Enter: 13, Slash: 191, ArrowDown: 40 }[code] || 0, text: type === 'keyDown' && k.length === 1 ? k : undefined }); };
  const pause = (ms = 600) => wait(ms);
  let s = await st();
  ok('closed on load, dock ready', !s.open && s.vis === 'hidden' && await evaluate(`return getComputedStyle(document.querySelector('.wiki-dock')).display !== 'none'`), s);
  await evaluate(`scrollTo({ top: __c.y(1, .45), behavior: 'instant' }); await __c.settle(1, .45); await new Promise(r => setTimeout(r, 900));`);
  const y0 = (await st()).y;
  await shot('explore-chapters');
  await evaluate(`[...document.querySelectorAll('.scene-cat')].find(a => a.hash === '#travel').click()`); await pause();
  s = await st(); ok('chapter link in the scene opens that chapter', s.open && s.vis === 'visible' && s.hash === '#travel' && s.shown.join() === 'travel', s);
  await shot('reader-chapter');
  await evaluate(`document.querySelector('.wiki-entries a[href="#waystone"]').click()`); await pause();
  s = await st(); ok('entry link scrolls to the entry, back appears', s.hash === '#waystone' && s.target === 'waystone' && s.back && s.crumb.includes('茶咖路標'), s);
  await evaluate(`document.getElementById('wiki-search').focus()`);
  await send('Input.insertText', { text: '釣魚' }); await pause();
  s = await st(); ok('typing searches across chapters', s.view === 'search' && s.results > 0 && /釣魚/.test(s.first), s);
  await shot('reader-search');
  await evaluate(`[...document.querySelectorAll('.wiki-filter button')].find(b => b.textContent === '經濟與道具').click()`); await pause(300);
  s = await st(); ok('scope filter narrows results', s.results === 0 && /找不到/.test(s.count), s);
  await evaluate(`document.querySelector('.wiki-filter button[data-filter=""]').click()`); await pause(300);
  await key('ArrowDown', 'ArrowDown'); await key('Enter', 'Enter'); await pause();
  s = await st(); ok('keyboard: ArrowDown + Enter opens the first result', s.view === 'chapter' && s.shown[0] === 'activities' && s.target, s);
  await evaluate(`document.querySelector('.wiki-reader-back').click()`); await pause();
  s = await st(); ok('back returns to the results with the query', s.view === 'search' && s.input === '釣魚' && s.results > 0, s);
  await evaluate(`document.getElementById('wiki-search').focus()`);
  await key('Escape', 'Escape'); await pause(300);
  s = await st(); ok('Esc in the field clears the query', s.input === '' && s.open, s);
  await key('Escape', 'Escape'); await pause(900);
  s = await st(); ok('Esc again closes; scene position kept; hash cleared', !s.open && s.vis === 'hidden' && Math.abs(s.y - y0) < 2 && s.hash === '', { ...s, y0 });
  await key('/', 'Slash'); await pause();
  s = await st(); ok('"/" opens search with the field focused', s.open && s.view === 'search' && s.focus === 'wiki-search', s);
  await send('Input.insertText', { text: '不存在的玩法xyz' }); await pause(300);
  s = await st(); ok('no results: helpful message', s.results === 0 && /找不到/.test(s.count), s);
  await shot('reader-empty');
  await evaluate(`document.querySelector('.wiki-search-clear').click()`); await pause(300);
  await evaluate(`history.back()`); await pause(900);
  s = await st(); ok('browser Back closes the reader', !s.open && Math.abs(s.y - y0) < 2, s);
  await evaluate(`scrollTo({ top: __c.y(2, .8), behavior: 'instant' }); await __c.settle(2, .8); await new Promise(r => setTimeout(r, 900));`);
  await shot('explore-library');
  await evaluate(`document.querySelector('.scene-enter').click()`); await pause();
  s = await st(); ok('cave entrance opens the catalogue', s.open && s.view === 'chapter', s);
  await evaluate(`document.querySelector('.wiki-reader-close').click()`); await pause(900);
  s = await st(); ok('close button returns to the cave', !s.open && s.vis === 'hidden', s);
  await evaluate(`location.hash = 'beans'`); await pause();
  s = await st(); ok('in-page #beans (no reload) opens the reader there', s.open && s.shown[0] === 'economy' && s.target === 'beans', s);
  await send('Page.navigate', { url: 'about:blank' }); await wait(500);
  await send('Page.navigate', { url: `${base}/wiki.html#teleport` }); await wait(1500);
  for (let i = 0; i < 40 && !(await evaluate('return !!window.TeaWikiReader && document.readyState === "complete"').catch(() => false)); i++) await wait(250);
  await evaluate(HELPERS);
  s = await st(); ok('fresh load of a shared link #teleport opens the reader at the entry', s.open && s.shown[0] === 'travel' && s.entry === 'teleport' && s.focus === 'teleport', s);
  await evaluate(`document.querySelector('.wiki-reader-close').click()`); await pause(900);
  s = await st(); ok('closing a shared link stays on the page (no history.back off-site)', !s.open && s.hash === '' && s.vis === 'hidden', s);
  const live = await evaluate(`return { paused: document.documentElement.hasAttribute('data-wiki-reader'), errors: window.__errs || [] }`);
  ok('no page errors', !live.errors.length, live);
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : '  ' + JSON.stringify(c.info)}`);
  console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { ws && ws.close(); } catch {} chrome.kill(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch {} }, 1500); });
