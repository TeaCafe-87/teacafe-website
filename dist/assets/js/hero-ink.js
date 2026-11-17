/* TeaCafe hero: liquid-ink cursor effect over the journey painting.
 * A page-anchored colour field is revealed only where the fluid currently is.
 * Where the fluid crosses the headline, those parts of the glyphs turn white.
 * Canvas 2D only, no dependencies. Respects reduced motion and pauses off-screen.
 * Runs separately from the scroll-scrubbed background video (home-journey.js)
 * and thins away smoothly as the camera journey begins. */
(() => {
  'use strict';
  const hero = document.querySelector('[data-ink-hero]');
  const canvas = hero && hero.querySelector('[data-ink-canvas]');
  const title = hero && hero.querySelector('[data-ink-title]');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx || !title) return;

  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const noHover = matchMedia('(hover: none)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';

  // Colour field in the painting's own pigments: night ink (left) -> mountain
  // slate -> tea gold (right). Anchored to the hero, never to the cursor.
  const STOPS = [[0, '#22303f'], [0.5, '#3c566d'], [0.85, '#546274'], [1, '#6e5a3c']];
  const MAX_PARTICLES = 460;
  // Follow response. Steady-state lag behind a moving cursor is v*DAMPING/STIFFNESS, so a high
  // stiffness with a proportional damping keeps the ink close to the cursor while still trailing
  // and overshooting like liquid (DAMPING sits just under critical, 2*sqrt(STIFFNESS)).
  const STIFFNESS = 1000, DAMPING = 49;
  const SPRING_STEP = 1 / 120; // sub-step size: keeps the stiff spring stable when frames are long
  const EDGE_LO = 0.40, EDGE_HI = 0.60; // metaball threshold band: wide enough to anti-alias the contour, narrow enough to stay crisp
  const FRAME_MS = 15;                  // caps 120 Hz displays at ~60 fps

  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 96;
  {
    const g = sprite.getContext('2d');
    const ramp = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    ramp.addColorStop(0, 'rgba(255,255,255,1)');
    ramp.addColorStop(0.45, 'rgba(255,255,255,.86)');
    ramp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ramp;
    g.fillRect(0, 0, 96, 96);
  }
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) return;

  let W = 1, H = 1, dpr = 1, S = 3, mw = 1, mh = 1;
  let originX = 0, originY = 0;
  let gradient = null, glyphs = [], glyphFont = '';
  let particles = [];
  let enabled = false, visible = true, raf = 0, last = 0, time = 0;
  let userMoved = false, wasInside = false;
  const ptr = { x: 0, y: 0, active: false };
  const head = { x: 0, y: 0, vx: 0, vy: 0 };
  let box = null; // dirty rectangle of the last frame, CSS px

  const rand = (a, b) => a + Math.random() * (b - a);
  const inkSize = () => clamp(Math.min(W, H) * 0.075, 34, 104); // blob radius, scaled to the smaller axis so phones match
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function measureGlyphs() {
    glyphs = [];
    const cs = getComputedStyle(title);
    glyphFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.font = glyphFont;
    const m = ctx.measureText('茶');
    const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.88;
    const heroRect = hero.getBoundingClientRect();
    const range = document.createRange();
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue;
      for (let i = 0; i < text.length;) {
        const ch = String.fromCodePoint(text.codePointAt(i));
        range.setStart(node, i);
        range.setEnd(node, i + ch.length);
        const r = range.getClientRects()[0];
        if (r && r.width > 0 && /\S/.test(ch)) glyphs.push({ ch, x: r.left - heroRect.left, y: r.top - heroRect.top + ascent });
        i += ch.length;
      }
    }
  }

  function resize() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    originX = r.left + scrollX;
    originY = r.top + scrollY;
    dpr = Math.min(devicePixelRatio || 1, 2);
    while (dpr > 1 && W * H * dpr * dpr > 5e6) dpr = Math.max(1, dpr - 0.25);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = W * H > 2.6e6 ? 4 : W * H > 1.1e6 ? 3 : 2; // mask resolution divisor; larger blobs tolerate a coarser mask
    mw = Math.ceil(W / S);
    mh = Math.ceil(H / S);
    mask.width = mw;
    mask.height = mh;
    gradient = ctx.createLinearGradient(0, H * 0.12, W, H * 0.88);
    STOPS.forEach(([o, c]) => gradient.addColorStop(o, c));
    measureGlyphs();
    if (particles.length) render();
  }

  // Divergence-free swirl: two octaves of a stream-function derivative. Gives curling, non-uniform drift.
  function swirl(x, y, t, out) {
    const a = x * 0.0065 + t * 0.9, b = y * 0.0078 - t * 0.7;
    const c = x * 0.017 - t * 1.3, d = y * 0.015 + t * 1.1;
    out[0] = -Math.sin(a) * Math.sin(b) - 0.5 * Math.sin(c) * Math.sin(d);
    out[1] = -Math.cos(a) * Math.cos(b) - 0.5 * Math.cos(c) * Math.cos(d);
  }
  const flow = [0, 0];

  function spawn(x, y, vx, vy, r, life, droplet) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ x, y, vx, vy, r, age: 0, life, droplet, ang: 0, stretch: 1 });
  }

  function burst(x, y) {
    const base = inkSize();
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2), s = rand(90, 300);
      spawn(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * s, Math.sin(a) * s, base * rand(0.22, 0.5), rand(0.7, 1.2), true);
    }
    spawn(x, y, 0, 0, base * 0.9, rand(0.9, 1.3), false);
  }

  function step(dt) {
    time += dt;
    if (noHover.matches && !userMoved) { // touch-only devices: a slow idle wander until the first touch
      ptr.x = W * (0.5 + 0.34 * Math.sin(time * 0.55));
      ptr.y = H * (0.5 + 0.22 * Math.sin(time * 0.83 + 1));
      ptr.active = true;
    }
    const inside = ptr.active && ptr.x > -40 && ptr.x < W + 40 && ptr.y > -40 && ptr.y < H + 40;
    if (inside && !wasInside) { head.x = ptr.x; head.y = ptr.y; head.vx = head.vy = 0; }
    wasInside = inside;

    // Spring with slight overshoot: the ink lags and swings behind the cursor.
    const ox = head.x, oy = head.y;
    for (let left = dt; left > 0; left -= SPRING_STEP) {
      const h = left < SPRING_STEP ? left : SPRING_STEP;
      head.vx += ((ptr.x - head.x) * STIFFNESS - head.vx * DAMPING) * h;
      head.vy += ((ptr.y - head.y) * STIFFNESS - head.vy * DAMPING) * h;
      head.x += head.vx * h;
      head.y += head.vy * h;
    }

    if (inside) {
      const dx = head.x - ox, dy = head.y - oy, dist = Math.hypot(dx, dy), speed = dist / dt;
      if (speed > 8) {
        const base = inkSize();
        const r0 = base * (0.72 + Math.min(speed / 1600, 1) * 0.7);
        const n = Math.min(Math.ceil(dist / Math.max(r0 * 0.26, 3)), 40);
        for (let i = 1; i <= n; i++) {
          const k = i / n, r = r0 * rand(0.86, 1.16);
          spawn(ox + dx * k + rand(-1, 1) * r * 0.18, oy + dy * k + rand(-1, 1) * r * 0.18,
            head.vx * 0.1 + rand(-12, 12), head.vy * 0.1 + rand(-12, 12), r, rand(0.85, 1.4), false);
          if (Math.random() < Math.min(speed / 3400, 0.22)) { // detached droplet, thrown sideways
            const side = Math.random() < 0.5 ? -1 : 1, nx = -dy / dist * side, ny = dx / dist * side;
            const throwSpeed = speed * rand(0.12, 0.34) + 50;
            spawn(ox + dx * k, oy + dy * k, nx * throwSpeed + head.vx * 0.35, ny * throwSpeed + head.vy * 0.35,
              base * rand(0.1, 0.2), rand(0.7, 1.25), true);
          }
        }
      }
    }

    let w = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      swirl(p.x, p.y, time, flow);
      const drag = Math.exp(-dt * (p.droplet ? 1.2 : 2.4));
      p.vx = p.vx * drag + flow[0] * 320 * dt;
      p.vy = p.vy * drag + flow[1] * 320 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const sp = Math.hypot(p.vx, p.vy);
      p.ang = Math.atan2(p.vy, p.vx);
      p.stretch = 1 + Math.min(sp / 300, 1.5) * (p.droplet ? 0.6 : 0.9);
      particles[w++] = p;
    }
    particles.length = w;
  }

  function render() {
    const cw = canvas.width, ch = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    if (!particles.length) { box = null; return; }

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalCompositeOperation = 'source-over';
    mctx.clearRect(0, 0, mw, mh);
    mctx.globalCompositeOperation = 'lighter';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of particles) {
      const u = p.age / p.life;
      const amp = clamp((1 - u) * 2.4, 0, 1);
      const R = p.r * (1 - u * u * 0.5);
      const along = p.stretch, across = 1 / Math.sqrt(p.stretch);
      const cos = Math.cos(p.ang), sin = Math.sin(p.ang);
      mctx.globalAlpha = amp;
      mctx.setTransform(cos * along / S, sin * along / S, -sin * across / S, cos * across / S, p.x / S, p.y / S);
      mctx.drawImage(sprite, -R, -R, R * 2, R * 2);
      const e = R * along * 1.05;
      if (p.x - e < x0) x0 = p.x - e;
      if (p.y - e < y0) y0 = p.y - e;
      if (p.x + e > x1) x1 = p.x + e;
      if (p.y + e > y1) y1 = p.y + e;
    }
    mctx.globalAlpha = 1;
    mctx.setTransform(1, 0, 0, 1, 0, 0);

    const bx = clamp(Math.floor(x0 / S) - 1, 0, mw), by = clamp(Math.floor(y0 / S) - 1, 0, mh);
    const bw = clamp(Math.ceil(x1 / S) + 1, 0, mw) - bx, bh = clamp(Math.ceil(y1 / S) + 1, 0, mh) - by;
    if (bw <= 0 || bh <= 0) { box = null; return; }

    // Threshold the summed density into a crisp, irregular ink edge.
    const img = mctx.getImageData(bx, by, bw, bh), d = img.data, span = EDGE_HI - EDGE_LO;
    for (let i = 3; i < d.length; i += 4) {
      const t = (d[i] / 255 - EDGE_LO) / span;
      d[i] = t <= 0 ? 0 : t >= 1 ? 255 : t * t * (3 - 2 * t) * 255;
    }
    mctx.putImageData(img, bx, by);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mask, bx, by, bw, bh, bx * S, by * S, bw * S, bh * S);
    box = { x: bx * S, y: by * S, w: bw * S, h: bh * S };

    ctx.globalCompositeOperation = 'source-in'; // colour only where fluid exists, at page-anchored positions
    ctx.fillStyle = gradient;
    ctx.fillRect(box.x, box.y, box.w, box.h);

    ctx.globalCompositeOperation = 'source-atop'; // headline: only the part inside the fluid turns white
    ctx.fillStyle = '#fff';
    ctx.font = glyphFont;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const size = parseFloat(glyphFont.split(' ').find((s) => s.endsWith('px')) || '0');
    for (const g of glyphs) {
      if (g.x > box.x + box.w || g.x + size < box.x || g.y - size > box.y + box.h || g.y + size * 0.3 < box.y) continue;
      ctx.fillText(g.ch, g.x, g.y);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    raf = 0;
    if (!enabled || !visible || document.hidden) return;
    if (now - last < FRAME_MS) { raf = requestAnimationFrame(frame); return; }
    const dt = clamp((now - last) / 1000, 0.001, 0.033);
    last = now;
    step(dt);
    render();
    const idleWander = noHover.matches && !userMoved;
    if (particles.length || (ptr.active && wasInside) || idleWander) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (raf || !enabled || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onMove(e) {
    if (e.pointerType === 'touch' && e.type === 'pointermove' && !e.isPrimary) return;
    userMoved = true;
    ptr.x = e.clientX + scrollX - originX;
    ptr.y = e.clientY + scrollY - originY;
    ptr.active = true;
    if (e.type === 'pointerdown' && ptr.x >= 0 && ptr.x <= W && ptr.y >= 0 && ptr.y <= H) burst(ptr.x, ptr.y);
    wake();
  }
  const onLeave = () => { ptr.active = false; };

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (enabled) resize(); }) : null;
  const visibilityObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); }) : null;
  const attrObserver = new MutationObserver(() => { if (enabled) { measureGlyphs(); render(); } });

  function enable() {
    if (enabled) return;
    enabled = true;
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onMove, { passive: true });
    root.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', wake);
    resizeObserver && (resizeObserver.observe(hero), resizeObserver.observe(title));
    visibilityObserver && visibilityObserver.observe(hero);
    attrObserver.observe(root, { attributes: true, attributeFilter: ['data-text-size', 'data-font-style'] });
    resize();
    wake();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    cancelAnimationFrame(raf);
    raf = 0;
    particles = [];
    wasInside = false;
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerdown', onMove);
    root.removeEventListener('mouseleave', onLeave);
    document.removeEventListener('visibilitychange', wake);
    resizeObserver && resizeObserver.disconnect();
    visibilityObserver && visibilityObserver.disconnect();
    attrObserver.disconnect();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // The journey begins with the first scroll: the cursor ink thins out with it
  // (the canvas has a CSS opacity transition) and clears once fully faded.
  let fade = 1;
  function applyScrollFade() {
    const f = clamp(1 - scrollY / (innerHeight * 0.55), 0, 1);
    if (f === fade) return;
    const wasVisible = fade > 0;
    fade = f;
    canvas.style.opacity = String(f);
    if (f === 0 && wasVisible && particles.length) { particles = []; render(); }
  }
  addEventListener('scroll', applyScrollFade, { passive: true });

  const sync = () => (reduced() ? disable() : enable());
  motionQuery.addEventListener ? motionQuery.addEventListener('change', sync) : motionQuery.addListener(sync);
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  if (document.fonts) {
    document.fonts.ready.then(() => { if (enabled) { measureGlyphs(); render(); } });
    document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { if (enabled) { measureGlyphs(); render(); } });
  }
  addEventListener('load', () => { if (enabled) resize(); });
  sync();
})();
