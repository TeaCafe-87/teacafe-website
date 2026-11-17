/* TeaCafe journey: live elements over the scroll-scrubbed background film.
 *
 * The film (journey-desktop.mp4 / journey-portrait.mp4) holds only camera
 * motion through a still painting, so scrubbing backwards never runs water
 * uphill.  Everything that moves on its own lives here, drawn on a canvas
 * laid exactly over the <video>:
 *   - the waterfall's falling threads, its plunge mist and stream glints
 *   - the boat drifting and bobbing on the lake
 *   - the flock of birds crossing the sky, wings beating
 * They always move forward in real time, whichever way the page scrolls.
 *
 * Alignment: the renderer exports its per-frame camera (journey-*.camera.json)
 * and this script applies the same projection.  requestVideoFrameCallback
 * reports which film frame is actually on screen, so the overlay follows the
 * decoded picture rather than the requested seek time.  The camera file also
 * carries a coarse per-frame occlusion grid (mountains/clouds in front of the
 * birds) and the waterfall's visibility, so live elements hide behind
 * nearer scenery.
 *
 * Usage:
 *   const live = TeaJourneyLive.attach(video, canvas, {
 *     camera: '/assets/video/journey-desktop.camera.json',
 *     live:   '/assets/video/journey-live.json',
 *     sprites:'/assets/video/journey-sprites.png',
 *   });
 *   live.setCamera(url)   // e.g. after switching to the portrait film
 *   live.destroy()
 */
(function (global) {
  'use strict';

  const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  function rng(seed) {             // deterministic per-element randomness
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function polyline(pts) {
    const seg = [0];
    for (let i = 1; i < pts.length; i++) {
      seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const len = seg[seg.length - 1];
    return {
      len,
      at(f) {                       // point + unit tangent at fraction f of the length
        const d = clamp(f, 0, 1) * len;
        let i = 1;
        while (i < seg.length - 1 && seg[i] < d) i++;
        const k = (d - seg[i - 1]) / Math.max(seg[i] - seg[i - 1], 1e-6);
        const a = pts[i - 1], b = pts[i];
        const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
        return [a[0] + tx * k, a[1] + ty * k, tx / tl, ty / tl];
      },
    };
  }

  function attach(video, canvas, opts) {
    const ctx = canvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let cam = null, live = null, sprites = null;
    let frame = 0, raf = 0, vfc = 0, alive = true, visible = true;
    let geom = null;                  // derived paths and per-element constants
    let box = { w: 0, h: 0, k: 1, ox: 0, oy: 0, dpr: 1 };

    const load = (url) => fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });

    function setCamera(url) {
      return load(url).then((c) => { cam = c; layout(); });
    }

    Promise.all([
      load(opts.live),
      new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = opts.sprites; }),
      setCamera(opts.camera),
    ]).then(([l, im]) => {
      live = l; sprites = im; build(); start();
    }).catch((e) => { console.warn('[journey-live] disabled:', e.message); canvas.hidden = true; });

    function build() {
      const r = rng(20261117);
      const wf = live.waterfall;
      const fall = (pts, w, n) => ({
        path: polyline(pts), w,
        threads: Array.from({ length: n }, () => ({
          off: r() * 0.8 - 0.4, phase: r(), speed: 0.55 + r() * 0.5, len: 0.06 + r() * 0.1, a: 0.35 + r() * 0.45,
        })),
      });
      geom = {
        falls: [fall(wf.upper, wf.upperWidth, 12), fall(wf.lower, wf.lowerWidth, 22)],
        pool: wf.pool,
        stream: polyline(live.stream.path),
        glints: Array.from({ length: 9 }, () => ({ phase: r(), off: r() * 0.6 - 0.3, len: 2 + r() * 3 })),
        birds: live.birds.map((b) => ({
          ...b, u0: (b.box[0] + b.box[2]) / 2, v0: (b.box[1] + b.box[3]) / 2,
          w: (b.box[2] - b.box[0]), h: (b.box[3] - b.box[1]),
          flap: 1.1 + r() * 0.9, phase: r() * TAU, bob: r() * TAU,
        })),
      };
    }

    // ---- layout: replicate object-fit: cover + object-position of the video
    function layout() {
      if (!cam) return;
      const rect = video.getBoundingClientRect();
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const cw = rect.width, ch = rect.height;
      const k = Math.max(cw / cam.width, ch / cam.height);
      const pos = getComputedStyle(video).objectPosition.split(' ');
      const pc = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n / 100 : 0.5; };
      const px = pc(pos[0]), py = pc(pos[1]);
      box = { w: cw, h: ch, k, ox: (cw - cam.width * k) * px, oy: (ch - cam.height * k) * py, dpr };
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
    }

    // ---- camera projection (identical to render.py)
    function proj(c, u, v, D) {
      const S = cam.s0 * c[3], dz = D - c[2];
      const x = cam.width / 2 + S * ((u - cam.uc) * D - c[0]) / dz;
      const y = cam.height / 2 + S * ((v - cam.vc) * D - c[1]) / dz;
      return [box.ox + x * box.k, box.oy + y * box.k, S * D / dz * box.k, x / cam.width, y / cam.height];
    }

    function washAt(p, xn, yn) {
      let m = 0;
      for (const [a0, a1, b0, b1, side] of cam.wash) {
        const w = smooth((p - a0) / (a1 - a0)) * (1 - smooth((p - b0) / (b1 - b0)));
        if (w <= 0) continue;
        const s = side === 'right' ? smooth((xn - 0.40) / 0.22)
          : side === 'left' ? 1 - smooth((xn - 0.38) / 0.22) : smooth((yn - 0.44) / 0.16);
        m = Math.max(m, s * w * 0.94);
      }
      return m;
    }

    function occAt(xn, yn) {
      const row = cam.occ && cam.occ[frame];
      if (!row) return 0;
      const [gw, gh] = cam.occGrid;
      const gx = clamp(Math.floor(xn * gw), 0, gw - 1), gy = clamp(Math.floor(yn * gh), 0, gh - 1);
      return (row.charCodeAt(gy * gw + gx) - 48) / 9;
    }

    // ---- drawing
    function draw(t) {
      const dpr = box.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!cam || !geom) return;
      const c = cam.track[clamp(frame, 0, cam.track.length - 1)];
      const p = frame / (cam.frames - 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWaterfall(c, p, t);
      drawBirds(c, p, t);
      drawBoat(c, p, t);
    }

    function drawWaterfall(c, p, t) {
      const D = live.waterfall.depth;
      const [g0, g1] = cam.fallGate;
      const top = proj(c, 330, 280, D);
      let A = smooth((p - g0) / (g1 - g0)) * (cam.fallVis ? cam.fallVis[frame] : 1) * (1 - washAt(p, top[3], top[4]));
      if (A < 0.02) return;
      const scale = top[2];                       // css px per original px at this depth
      ctx.lineCap = 'round';
      for (const f of geom.falls) {
        for (const th of f.threads) {
          const s0 = (th.phase + t * th.speed * 60 / f.path.len) % 1;
          const s1 = Math.min(1, s0 + th.len);
          const a = f.path.at(s0), b = f.path.at(s1);
          const w0 = f.w[0] + (f.w[1] - f.w[0]) * s0, w1 = f.w[0] + (f.w[1] - f.w[0]) * s1;
          const P0 = proj(c, a[0] + th.off * w0, a[1], D), P1 = proj(c, b[0] + th.off * w1, b[1], D);
          const fade = Math.sin(Math.PI * Math.min(1, s0 / 0.08, (1 - s0) / 0.08));
          ctx.strokeStyle = `rgba(255,254,248,${(th.a * A * fade).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.6, 0.45 * scale);
          ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
        }
      }
      // plunge mist breathing at the foot of the fall
      const [pu, pv, rx, ry] = geom.pool;
      const C = proj(c, pu, pv - 2, D);
      const breathe = 0.16 + 0.07 * Math.sin(t * 1.3) + 0.04 * Math.sin(t * 2.9);
      const R = rx * scale * (1 + 0.06 * Math.sin(t * 0.9));
      ctx.save();
      ctx.translate(C[0], C[1]); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, `rgba(255,253,246,${(breathe * A * 1.6).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,253,246,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.restore();
      // glints travelling down the stream
      for (const gl of geom.glints) {
        const s = (gl.phase + t * 10 / geom.stream.len) % 1;
        const q = geom.stream.at(s);
        const w = live.stream.width[0] + (live.stream.width[1] - live.stream.width[0]) * s;
        const nx = -q[3], ny = q[2];
        const cu = q[0] + nx * gl.off * w, cv = q[1] + ny * gl.off * w;
        const P0 = proj(c, cu - q[2] * gl.len / 2, cv - q[3] * gl.len / 2, D);
        const P1 = proj(c, cu + q[2] * gl.len / 2, cv + q[3] * gl.len / 2, D);
        const fade = Math.sin(Math.PI * s) * (1 - s * 0.6);
        ctx.strokeStyle = `rgba(255,255,250,${(0.55 * A * fade).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, 0.3 * scale);
        ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
      }
    }

    function drawBirds(c, p, t) {
      const D = cam.birdDepth || 6;
      if (D - c[2] < 0.3) return;
      const UMIN = 600, SPAN = 540, SPEED = 4.2;   // original px; flock drifts left and wraps
      const sc = live.scale;
      for (const b of geom.birds) {
        let u = UMIN + ((((b.u0 - UMIN - SPEED * t) % SPAN) + SPAN) % SPAN);
        const edge = smooth((u - UMIN) / 45) * smooth((UMIN + SPAN - u) / 45);
        const v = b.v0 + 1.1 * Math.sin(t * 0.55 + b.bob);
        const P = proj(c, u, v, D);
        let A = edge * (1 - washAt(p, P[3], P[4])) * (1 - occAt(P[3], P[4]));
        if (A < 0.02 || P[0] < -40 || P[1] < -40 || P[0] > box.w + 40 || P[1] > box.h + 40) continue;
        const wing = 0.62 + 0.38 * Math.cos(t * TAU * b.flap + b.phase);   // wingbeat: squash vertically
        const w = b.w * P[2], h = b.h * P[2];
        ctx.save();
        ctx.globalAlpha = A;
        ctx.translate(P[0], P[1]);
        ctx.scale(1, wing);
        const [rx, ry, rw, rh] = b.rect;
        ctx.drawImage(sprites, rx, ry, rw, rh, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }

    function drawBoat(c, p, t) {
      const bt = live.boat, D = bt.depth;
      const dz = D - c[2];
      if (dz < 0.35) return;
      const [u0, v0, u1, v1] = bt.box;
      const w = u1 - u0, h = v1 - v0;
      const u = (u0 + u1) / 2 + 26 * Math.sin(t * TAU / 80);           // slow drift across the lake
      const v = (v0 + v1) / 2 + 0.45 * Math.sin(t * TAU / 3.2);         // bob
      const P = proj(c, u, v, D);
      const A = smooth((dz - 0.35) / 0.6) * (1 - washAt(p, P[3], P[4]));
      if (A < 0.02) return;
      const [rx, ry, rw, rh] = bt.rect;
      ctx.save();
      ctx.globalAlpha = A;
      ctx.translate(P[0], P[1]);
      ctx.rotate(0.012 * Math.sin(t * TAU / 3.9));
      ctx.drawImage(sprites, rx, ry, rw, rh, -w * P[2] / 2, -h * P[2] / 2, w * P[2], h * P[2]);
      ctx.restore();
    }

    // ---- frame sync
    function onVideoFrame(now, meta) {
      if (!alive) return;
      if (cam) frame = clamp(Math.round(meta.mediaTime * cam.fps), 0, cam.frames - 1);
      vfc = video.requestVideoFrameCallback(onVideoFrame);
    }

    function tick(now) {
      raf = 0;
      if (!alive) return;
      if (!('requestVideoFrameCallback' in video) && cam) {
        frame = clamp(Math.round(video.currentTime * cam.fps), 0, cam.frames - 1);
      }
      draw(reduced.matches ? 0 : now / 1000);
      if (visible) raf = requestAnimationFrame(tick);
    }

    function start() {
      layout();
      if ('requestVideoFrameCallback' in video) vfc = video.requestVideoFrameCallback(onVideoFrame);
      raf = requestAnimationFrame(tick);
    }

    const onResize = () => layout();
    addEventListener('resize', onResize, { passive: true });
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting && !document.hidden;
      if (visible && !raf && alive) raf = requestAnimationFrame(tick);
    });
    io.observe(video);
    const onVis = () => { visible = !document.hidden; if (visible && !raf && alive) raf = requestAnimationFrame(tick); };
    document.addEventListener('visibilitychange', onVis);

    return {
      setCamera,
      redraw: () => draw(performance.now() / 1000),
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        if (vfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfc);
        removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        io.disconnect();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  }

  global.TeaJourneyLive = { attach };
})(window);
