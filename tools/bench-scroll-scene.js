/* Scroll-scene benchmark. Served by tools/bench-server.py, which injects it into pages
 * opened with ?bench=<case>. Cases: frames | video-g1 | video-g8 | video-g30.
 * It can also be pasted into DevTools and run with `await teaBench.all()`.
 * Drives window scroll programmatically and reports frame pacing plus scene stats. */
window.teaBench = (() => {
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const r1 = v => Math.round(v * 10) / 10;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const scene = () => TeaScrollScene.scenes[0];
  let loafMs = 0;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) loafMs += e.duration; }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}

  function frameReport(name, gaps, extra = {}) {
    const g = gaps.slice(1);
    return { name, frames: g.length, frameAvgMs: r1(g.reduce((a, b) => a + b, 0) / g.length), frameP95Ms: r1(pct(g, .95)),
      frameMaxMs: r1(Math.max(...g)), over20ms: g.filter(x => x > 20).length, over34ms: g.filter(x => x > 34).length, ...extra };
  }

  function sweep(name, ms, path, pointer) {
    const sc = scene();
    const top = sc.section.offsetTop, len = sc.section.offsetHeight - innerHeight;
    Object.assign(sc.stats, { seeks: 0, seekMs: [], staleFrames: [], draws: 0 });
    loafMs = 0;
    const gaps = [];
    return new Promise(done => {
      const t0 = performance.now(); let last = t0;
      const step = now => {
        gaps.push(now - last); last = now;
        const u = (now - t0) / ms;
        if (u >= 1) {
          const stop = performance.now();
          const settle = () => {
            const r = sc.renderer, want = Math.round(sc.progress() * (sc.frameCount - 1));
            const exact = !r || r.drawn === want || (r.video && !r.video.seeking && Math.abs(r.video.currentTime * sc.manifest.fps - want) < .6);
            if (!exact && performance.now() - stop < 3000) return requestAnimationFrame(settle);
            const s = sc.stats;
            done(frameReport(name, gaps, {
              seeks: s.seeks, seekAvgMs: r1(s.seekMs.reduce((a, b) => a + b, 0) / (s.seekMs.length || 1)), seekP95Ms: r1(pct(s.seekMs, .95)),
              lagFramesAvg: r1(s.staleFrames.reduce((a, b) => a + b, 0) / (s.staleFrames.length || 1)), lagFramesMax: Math.max(0, ...s.staleFrames),
              settleMs: Math.round(performance.now() - stop), longFrameMs: Math.round(loafMs) }));
          };
          return requestAnimationFrame(settle);
        }
        scrollTo({ top: top + path(u) * len, behavior: 'instant' });
        if (pointer) pointer(u);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // Synthetic pointer circles over the stage: exercises the ink canvas (it listens on window).
  const circle = u => {
    const x = innerWidth * (.5 + .3 * Math.cos(u * 18)), y = innerHeight * (.5 + .25 * Math.sin(u * 18));
    dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true, bubbles: true }));
  };

  async function all() {
    const out = [];
    scrollTo({ top: 0, behavior: 'instant' }); await wait(800);
    out.push(await sweep('slow-down 6s', 6000, u => u)); await wait(400);
    out.push(await sweep('reverse-up 6s', 6000, u => 1 - u)); await wait(400);
    out.push(await sweep('fast-down 0.8s', 800, u => u)); await wait(400);
    out.push(await sweep('fast-up 0.8s', 800, u => 1 - u)); await wait(400);
    out.push(await sweep('wheel-steps', 1500, u => Math.floor(u * 12) / 12)); await wait(400);
    scrollTo({ top: 0, behavior: 'instant' }); await wait(400);
    out.push(await sweep('ink+scroll 4s', 4000, u => u * .5, circle)); await wait(400);
    out.push(await sweep('ink-only 3s', 3000, () => .05, circle));
    return out;
  }

  async function as(kind, video) {
    const sc = scene();
    const v = matchMedia('(max-aspect-ratio: 3/4)').matches ? 'mobile' : 'desktop';
    if (video) sc.manifest.sources[v].video = video;
    sc.manifest.renderer[v] = kind; sc.mountedKey = null; sc.failed = false; sc.mount();
    const t0 = performance.now();
    while (!sc.mediaHost.classList.contains('is-ready') && performance.now() - t0 < 10000) await wait(50);
    await wait(3000);                                        // let coarse-to-fine loading finish
    return all();
  }

  function env() {
    let gpu = 'n/a';
    try { const gl = document.createElement('canvas').getContext('webgl'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch {}
    const s = scene().stats;
    const nav = performance.getEntriesByType('navigation')[0];
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
    const media = performance.getEntriesByType('resource').filter(e => /\/scenes\//.test(e.name));
    return { renderer: s.renderer, gpu, viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, firstFrameMs: Math.round(s.firstFrameMs),
      loaded: `${s.loaded}/${s.total}`, heapMB: performance.memory ? r1(performance.memory.usedJSHeapSize / 1048576) : 'n/a',
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd || 0), lcpMs: Math.round(lcp?.startTime || 0),
      sceneBytesKB: Math.round(media.reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0) / 1024), sceneRequests: media.length };
  }

  async function auto() {
    const kind = new URLSearchParams(location.search).get('bench');
    if (!kind) return;
    while (!window.TeaScrollScene?.scenes[0]?.manifest) await wait(50);
    let result;
    if (kind.startsWith('shot-')) {                           // position the page for a headless --screenshot
      const p = Number(kind.slice(5)), sc = scene();
      await wait(3500);
      if (p > 1) scrollTo({ top: sc.section.offsetTop + sc.section.offsetHeight + (p - 1) * innerHeight, behavior: 'instant' });
      else scrollTo({ top: sc.section.offsetTop + p * (sc.section.offsetHeight - innerHeight), behavior: 'instant' });
      return;
    }
    if (kind === 'revealcheck') {                           // functional: reveal values vs expected, both directions
      await wait(4000);
      const h = document.getElementById('travel');
      const top = () => { let y = 0; for (let n = h; n; n = n.offsetParent) y += n.offsetTop; return y; };
      const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
      const rows = [];
      for (const f of [0.95, 0.85, 0.5, 0.1, 0.05, 0.1, 0.5, 0.85, 0.95]) {
        scrollTo({ top: top() - innerHeight * f, behavior: 'instant' }); await wait(250);
        const got = [+h.style.getPropertyValue('--rv-in'), +h.style.getPropertyValue('--rv-out')], exp = [sm((1 - f) / .28), sm((.18 - f) / .23)];
        rows.push({ at: f, in: got[0], expIn: +exp[0].toFixed(3), out: got[1], expOut: +exp[1].toFixed(3), ok: Math.abs(got[0] - exp[0]) < .01 && Math.abs(got[1] - exp[1]) < .01 });
      }
      // Scene beats at fixed progress points, down then up.
      const sc = scene(), beats = [];
      for (const p of [0, .15, .29, .45, .75, .95, .75, .45, .29, .15, 0]) {
        scrollTo({ top: sc.section.offsetTop + p * (sc.section.offsetHeight - innerHeight), behavior: 'instant' }); await wait(700);
        beats.push({ p, frame: sc.renderer?.drawn ?? (sc.renderer?.video ? Math.round(sc.renderer.video.currentTime * 30) : null), want: Math.round(p * 179),
          active: [...sc.section.querySelectorAll('[data-beat-active]')].map(e => e.dataset.beat + (e.tagName === 'SPAN' ? '-' + e.className : '')).join(',') });
      }
      await fetch('/__bench', { method: 'POST', body: JSON.stringify({ case: kind, allOk: rows.every(r => r.ok), rows, beats }) });
      return;
    }
    if (kind === 'staticcheck') {                           // reduced motion / Save-Data fallback state
      await wait(4000);
      const sc = scene(), sec = sc.section;
      const res = { case: kind, reducedQuery: matchMedia('(prefers-reduced-motion: reduce)').matches, isStatic: sec.classList.contains('is-static'),
        sectionH: sec.offsetHeight, vh: innerHeight, media: sec.querySelectorAll('video,canvas.scroll-scene-canvas').length,
        revealReady: 'revealReady' in document.documentElement.dataset,
        beatsOpacity: [...sec.querySelectorAll('[data-beat]')].map(e => e.dataset.beat + ':' + getComputedStyle(e).opacity + ':' + getComputedStyle(e).visibility),
        sceneRequests: performance.getEntriesByType('resource').filter(e => /scenes\/wiki-01\/(frames|.*\.mp4)/.test(e.name)).length,
        inkCanvasPx: document.querySelector('[data-ink-canvas]').width };
      await fetch('/__bench', { method: 'POST', body: JSON.stringify(res) });
      return;
    }
    if (kind === 'inkprobe') {                               // first ink interaction cost only
      await wait(5000);
      const gaps = []; let last = performance.now(); const t0 = last;
      await new Promise(done => { const step = now => { gaps.push(now - last); last = now; const u = (now - t0) / 1500; circle(u); if (u < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
      const loaf = performance.getEntriesByType('long-animation-frame').filter(e => e.startTime > t0 - 50).map(e => ({ dur: Math.round(e.duration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), block: Math.round(e.blockingDuration), scripts: e.scripts.map(x => ({ src: (x.sourceURL || '').split('/').pop(), fn: x.sourceFunctionName, inv: x.invoker, ms: Math.round(x.duration) })) }));
      await fetch('/__bench', { method: 'POST', body: JSON.stringify({ case: kind, first: frameReport('first-ink 1.5s', gaps), loaf }) });
      return;
    }
    try {
      const v = matchMedia('(max-aspect-ratio: 3/4)').matches ? 'mobile' : 'desktop';
      const [r, g] = kind.split('-g');
      const sweeps = await as(r, g ? `/assets/scenes/wiki-01/${v}-g${g}.mp4` : undefined);
      result = { case: kind, env: env(), sweeps };
    } catch (e) { result = { case: kind, error: String(e && e.stack || e) }; }
    await fetch('/__bench', { method: 'POST', body: JSON.stringify(result) });
  }
  addEventListener('load', auto);
  return { sweep, all, as, env };
})();
