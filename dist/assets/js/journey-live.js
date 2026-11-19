/* TeaCafe journey: live elements over the scroll-scrubbed background film.
 *
 * The film (journey-*.mp4) holds only camera motion through a still painting,
 * so scrubbing backwards never runs water uphill.  Everything that moves on
 * its own lives here, drawn on a canvas laid exactly over the <video>, always
 * moving forward in real time whichever way the page scrolls:
 *
 *   both themes  waterfall threads + plunge mist, stream glints, drifting mist
 *                bands, lake shimmer, the boat drifting with ripples, water
 *                running under the arch
 *   day          two flocks of birds (one in the opening sky, one above the
 *                cloud sea in act 4)
 *   night        twinkling stars and an occasional shooting star, the boat's
 *                lantern and its reflection, fireflies by the lake and bridge,
 *                moonlight path on the water
 *
 * Alignment: the renderer exports its per-frame camera (journey-*.camera.json)
 * and this script applies the same projection.  requestVideoFrameCallback
 * reports which film frame is on screen, so the overlay follows the decoded
 * picture rather than the requested seek time.  The camera file also carries
 * coarse per-frame occlusion grids (what lies in front of depth 6, of depth 12,
 * and of the sky), so live elements hide behind nearer scenery.
 *
 *   const live = TeaJourneyLive.attach(video, canvas, {
 *     camera:       '/assets/video/journey-desktop.camera.json',
 *     live:         '/assets/video/journey-live.json',
 *     sprites:      '/assets/video/journey-sprites.png',
 *     spritesNight: '/assets/video/journey-sprites-night.png',
 *   });
 *   live.setCamera(url)   // e.g. switch to the portrait or night film
 *   live.destroy()
 */
(function (global) {
  'use strict';

  const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;
  const wrap = (x, a, span) => a + ((((x - a) % span) + span) % span);

  function rng(seed) {
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
      at(f) {
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

  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }

  function attach(video, canvas, opts) {
    const ctx = canvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let cam = null, live = null;
    const atlas = {};
    let frame = 0, raf = 0, vfc = 0, alive = true, visible = true;
    let G = null;
    let box = { w: 0, h: 0, k: 1, ox: 0, oy: 0, dpr: 1 };

    const load = (url) => fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
    const night = () => !!cam && cam.theme === 'night';
    const sprite = () => (night() && atlas.night) || atlas.day;

    function setCamera(url) {
      return load(url).then((c) => {
        cam = c; layout();
        if (c.theme === 'night' && !atlas.night && opts.spritesNight) {
          loadImage(opts.spritesNight).then((im) => { atlas.night = im; }).catch(() => {});
        }
      });
    }

    Promise.all([load(opts.live), loadImage(opts.sprites), setCamera(opts.camera)])
      .then(([l, im]) => { live = l; atlas.day = im; build(); start(); })
      .catch((e) => { console.warn('[journey-live] disabled:', e.message); canvas.hidden = true; });

    // ------------------------------------------------------------ scene setup
    function build() {
      const r = rng(20261117);
      const wf = live.waterfall;
      const fall = (pts, w, n) => ({
        path: polyline(pts), w,
        threads: Array.from({ length: n }, () => ({ off: r() * 0.8 - 0.4, phase: r(), speed: 0.55 + r() * 0.5, len: 0.06 + r() * 0.1, a: 0.35 + r() * 0.45 })),
      });
      const wisps = (n, D, u0, u1, v0, v1, w0, w1, h0, h1, speed, occName) => Array.from({ length: n }, () => ({
        D, u0, span: u1 - u0, u: u0 + r() * (u1 - u0), v: v0 + r() * (v1 - v0),
        w: w0 + r() * (w1 - w0), h: h0 + r() * (h1 - h0), speed: speed * (0.6 + r() * 0.8) * (r() < 0.5 ? -1 : 1),
        a: 0.17 + r() * 0.16, ph: r() * TAU, occ: occName,
      }));
      const birdsFrom = (src, du, dv, D, gate) => src.map((b) => ({
        ...b, u0: (b.box[0] + b.box[2]) / 2 + du, v0: (b.box[1] + b.box[3]) / 2 + dv,
        w: b.box[2] - b.box[0], h: b.box[3] - b.box[1], D, gate,
        flap: 1.1 + r() * 0.9, phase: r() * TAU, bob: r() * TAU,
      }));
      G = {
        falls: [fall(wf.upper, wf.upperWidth, 12), fall(wf.lower, wf.lowerWidth, 22)],
        pool: wf.pool,
        stream: polyline(live.stream.path),
        glints: Array.from({ length: 9 }, () => ({ phase: r(), off: r() * 0.6 - 0.3, len: 2 + r() * 3 })),
        flocks: [
          { birds: birdsFrom(live.birds, 0, 0, 6, null), umin: 600, span: 540, speed: 4.2 },
          { birds: birdsFrom(live.birds, 560, -40, 12, [0.86, 0.93]), umin: 1150, span: 600, speed: 5.5 },
        ],
        mist: [
          ...wisps(10, 5.5, 250, 1350, 562, 604, 90, 190, 8, 15, 2.2, 'occ'),    // over the lake
          ...wisps(4, 11.5, 290, 480, 392, 418, 40, 80, 5, 8, 1.2, 'occ12'),     // waterfall foot
          ...wisps(3, 4.45, 800, 960, 562, 598, 30, 60, 5, 8, 1.0, null),        // bridge foot
        ],
        shimmer: Array.from({ length: 26 }, () => ({ u: 300 + r() * 1000, v: 606 + r() * 90, len: 4 + r() * 10, w: 2 + r() * 3, ph: r() * TAU })),
        underArch: Array.from({ length: 10 }, () => ({ phase: r(), v: 568 + r() * 30, len: 3 + r() * 5 })),
        stars: Array.from({ length: 150 }, () => ({ x: r(), y: Math.pow(r(), 1.35) * 0.62, s: 0.5 + Math.pow(r(), 3) * 1.6, ph: r() * TAU, f: 0.6 + r() * 1.8, a: 0.35 + r() * 0.6 })),
        fireflies: [
          ...Array.from({ length: 22 }, () => ({ D: 2.4 + r() * 0.8, u: 380 + r() * 860, v: 560 + r() * 80, ph: r() * TAU, k: 0.6 + r() * 0.8, b: r() * TAU })),
          ...Array.from({ length: 16 }, () => ({ D: 4.42, u: 815 + r() * 120, v: 488 + r() * 95, ph: r() * TAU, k: 0.6 + r() * 0.8, b: r() * TAU })),
        ],
        meteorSeed: r() * 100,
      };
    }

    // ------------------------------------------------------------ layout & projection
    function layout() {
      if (!cam) return;
      const rect = video.getBoundingClientRect();
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const cw = rect.width, ch = rect.height;
      const k = Math.max(cw / cam.width, ch / cam.height);
      const pos = getComputedStyle(video).objectPosition.split(' ');
      const pc = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n / 100 : 0.5; };
      box = { w: cw, h: ch, k, ox: (cw - cam.width * k) * pc(pos[0]), oy: (ch - cam.height * k) * pc(pos[1]), dpr };
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
    }

    // [cssX, cssY, cssPxPerOrigPx, xFrac, yFrac] for a painting point (u, v) at depth D
    function proj(c, u, v, D) {
      const S = cam.s0 * c[3], dz = D - c[2];
      const x = cam.width / 2 + S * ((u - cam.uc) * D - c[0]) / dz;
      const y = cam.height / 2 + S * ((v - cam.vc) * D - c[1]) / dz;
      return [box.ox + x * box.k, box.oy + y * box.k, S * D / dz * box.k, x / cam.width, y / cam.height];
    }
    const fromFrac = (xn, yn) => [box.ox + xn * cam.width * box.k, box.oy + yn * cam.height * box.k];
    const onScreen = (P, m) => P[0] > -m && P[1] > -m && P[0] < box.w + m && P[1] < box.h + m;

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

    function occ(name, xn, yn) {
      const rows = cam[name];
      const row = rows && rows[frame];
      if (!row) return 0;
      const [gw, gh] = cam.occGrid;
      const gx = clamp(Math.floor(xn * gw), 0, gw - 1), gy = clamp(Math.floor(yn * gh), 0, gh - 1);
      return (row.charCodeAt(gy * gw + gx) - 48) / 9;
    }

    // ------------------------------------------------------------ drawing
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!cam || !G) return;
      const c = cam.track[clamp(frame, 0, cam.track.length - 1)];
      const p = frame / (cam.frames - 1);
      ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
      ctx.lineCap = 'round';
      if (night()) drawStars(p, t);
      drawMist(c, p, t, (w) => w.D > 6);
      drawWaterfall(c, p, t);
      if (!night()) drawBirds(c, p, t);
      drawShimmer(c, p, t);
      drawUnderArch(c, p, t);
      drawBoat(c, p, t);
      if (night()) drawFireflies(c, p, t);
      drawMist(c, p, t, (w) => w.D <= 6);
    }

    function drawStars(p, t) {
      const moon = cam.moon;
      for (const s of G.stars) {
        const yfade = 1 - smooth((s.y - 0.42) / 0.2);
        let A = s.a * yfade * (0.55 + 0.45 * Math.sin(t * s.f + s.ph));
        A *= (1 - occ('occAll', s.x, s.y)) * (1 - 0.55 * washAt(p, s.x, s.y));
        if (moon) {
          const dx = (s.x - moon.at[0]) * cam.width, dy = (s.y - moon.at[1]) * cam.height;
          A *= smooth((Math.hypot(dx, dy) - moon.at[2] * 1.5) / (moon.at[2] * 5));
        }
        if (A < 0.03) continue;
        const [x, y] = fromFrac(s.x, s.y);
        const R = s.s * box.k;
        ctx.fillStyle = `rgba(232,236,255,${A.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        if (s.s > 1.5) {
          ctx.strokeStyle = `rgba(220,228,255,${(A * 0.35).toFixed(3)})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(x - R * 4, y); ctx.lineTo(x + R * 4, y); ctx.moveTo(x, y - R * 4); ctx.lineTo(x, y + R * 4); ctx.stroke();
        }
      }
      // a shooting star roughly every 13 s, high in the sky
      const period = 13, tt = t + G.meteorSeed, k = Math.floor(tt / period), ft = (tt % period) / 1.1;
      if (ft < 1) {
        const r = rng(k * 7919 + 13);
        const asp = cam.width / cam.height;
        const x0 = 0.15 + r() * 0.6, y0 = 0.05 + r() * 0.18, ang = 0.35 + r() * 0.35;
        const e = smooth(ft), head = [x0 + Math.cos(ang) * 0.12 * e, y0 + Math.sin(ang) * 0.12 * e * asp];
        if (1 - occ('occAll', head[0], head[1]) > 0.5) {
          const tail = [head[0] - Math.cos(ang) * 0.05, head[1] - Math.sin(ang) * 0.05 * asp];
          const [hx, hy] = fromFrac(head[0], head[1]), [tx, ty] = fromFrac(tail[0], tail[1]);
          const A = Math.sin(Math.PI * ft) * (1 - 0.6 * washAt(p, head[0], head[1]));
          const g = ctx.createLinearGradient(tx, ty, hx, hy);
          g.addColorStop(0, 'rgba(230,236,255,0)'); g.addColorStop(1, `rgba(240,244,255,${(0.85 * A).toFixed(3)})`);
          ctx.strokeStyle = g; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        }
      }
    }

    function drawMist(c, p, t, pick) {
      const col = night() ? '150,170,205' : '252,249,240';
      for (const w of G.mist) {
        if (!pick(w)) continue;
        const dz = w.D - c[2];
        if (dz < 0.25) continue;
        const u = wrap(w.u + w.speed * t, w.u0, w.span);
        const edge = smooth((u - w.u0) / (w.span * 0.12)) * smooth((w.u0 + w.span - u) / (w.span * 0.12));
        const P = proj(c, u, w.v + 1.5 * Math.sin(t * 0.21 + w.ph), w.D);
        if (!onScreen(P, w.w * P[2])) continue;
        let A = w.a * edge * (0.75 + 0.25 * Math.sin(t * 0.33 + w.ph)) * smooth((dz - 0.25) / 0.5);
        A *= 1 - washAt(p, P[3], P[4]);
        if (w.occ) A *= 1 - occ(w.occ, P[3], P[4]);
        if (A < 0.01) continue;
        const rx = w.w * P[2] / 2, ry = w.h * P[2] / 2;
        ctx.save();
        ctx.translate(P[0], P[1]); ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(${col},${A.toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${col},${(A * 0.55).toFixed(3)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    function drawWaterfall(c, p, t) {
      const D = live.waterfall.depth;
      const [g0, g1] = cam.fallGate;
      const top = proj(c, 330, 280, D);
      const A = smooth((p - g0) / (g1 - g0)) * (cam.fallVis ? cam.fallVis[frame] : 1) * (1 - washAt(p, top[3], top[4]));
      if (A < 0.02) return;
      const scale = top[2];
      const col = night() ? '214,226,248' : '255,254,248';
      for (const f of G.falls) {
        for (const th of f.threads) {
          const s0 = (th.phase + t * th.speed * 60 / f.path.len) % 1;
          const s1 = Math.min(1, s0 + th.len);
          const a = f.path.at(s0), b = f.path.at(s1);
          const w0 = f.w[0] + (f.w[1] - f.w[0]) * s0, w1 = f.w[0] + (f.w[1] - f.w[0]) * s1;
          const P0 = proj(c, a[0] + th.off * w0, a[1], D), P1 = proj(c, b[0] + th.off * w1, b[1], D);
          const fade = Math.sin(Math.PI * Math.min(1, s0 / 0.08, (1 - s0) / 0.08));
          ctx.strokeStyle = `rgba(${col},${(th.a * A * fade).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.6, 0.45 * scale);
          ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
        }
      }
      const [pu, pv, rx, ry] = G.pool;
      const C = proj(c, pu, pv - 2, D);
      const breathe = 0.16 + 0.07 * Math.sin(t * 1.3) + 0.04 * Math.sin(t * 2.9);
      const R = rx * scale * (1 + 0.06 * Math.sin(t * 0.9));
      ctx.save();
      ctx.translate(C[0], C[1]); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, `rgba(${col},${(breathe * A * 1.6).toFixed(3)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.restore();
      for (const gl of G.glints) {
        const s = (gl.phase + t * 10 / G.stream.len) % 1;
        const q = G.stream.at(s);
        const w = live.stream.width[0] + (live.stream.width[1] - live.stream.width[0]) * s;
        const cu = q[0] - q[3] * gl.off * w, cv = q[1] + q[2] * gl.off * w;
        const P0 = proj(c, cu - q[2] * gl.len / 2, cv - q[3] * gl.len / 2, D);
        const P1 = proj(c, cu + q[2] * gl.len / 2, cv + q[3] * gl.len / 2, D);
        ctx.strokeStyle = `rgba(${col},${(0.55 * A * Math.sin(Math.PI * s) * (1 - s * 0.6)).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, 0.3 * scale);
        ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
      }
    }

    function drawBirds(c, p, t) {
      const im = sprite();
      for (const fl of G.flocks) {
        for (const b of fl.birds) {
          if (b.D - c[2] < 0.3) continue;
          const gate = b.gate ? smooth((p - b.gate[0]) / (b.gate[1] - b.gate[0])) : 1;
          if (gate < 0.01) continue;
          const u = wrap(b.u0 - fl.speed * t, fl.umin, fl.span);
          const edge = smooth((u - fl.umin) / 45) * smooth((fl.umin + fl.span - u) / 45);
          const P = proj(c, u, b.v0 + 1.1 * Math.sin(t * 0.55 + b.bob), b.D);
          if (!onScreen(P, 40)) continue;
          const A = gate * edge * (1 - washAt(p, P[3], P[4])) * (1 - occ(b.D < 7 ? 'occ' : 'occ12', P[3], P[4]));
          if (A < 0.02) continue;
          const wing = 0.62 + 0.38 * Math.cos(t * TAU * b.flap + b.phase);
          const w = b.w * P[2], h = b.h * P[2];
          ctx.save();
          ctx.globalAlpha = A;
          ctx.translate(P[0], P[1]); ctx.scale(1, wing);
          const [rx, ry, rw, rh] = b.rect;
          ctx.drawImage(im, rx, ry, rw, rh, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
    }

    function drawShimmer(c, p, t) {
      const D = 2.3, dz = D - c[2];
      if (dz < 0.3) return;
      const moon = night() && cam.moon;
      const moonX = moon ? fromFrac(moon.at[0], 0)[0] : 0;
      const moonVis = moon ? (moon.vis[frame] ?? 1) : 0;
      for (const s of G.shimmer) {
        const P = proj(c, s.u + 2 * Math.sin(t * 0.4 + s.ph), s.v, D);
        if (!onScreen(P, 30)) continue;
        let A = Math.pow(Math.max(0, Math.sin(t * (0.7 + s.w * 0.15) + s.ph)), 3);
        A *= moon ? 0.22 + 1.2 * Math.exp(-Math.pow((P[0] - moonX) / (box.w * 0.07), 2)) * moonVis : 0.45;
        A *= smooth((dz - 0.3) / 0.5) * (1 - washAt(p, P[3], P[4]));
        if (A < 0.02) continue;
        ctx.strokeStyle = moon ? `rgba(236,232,206,${A.toFixed(3)})` : `rgba(255,255,250,${A.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.6, 0.35 * P[2]);
        const L = s.len * P[2] / 2;
        ctx.beginPath(); ctx.moveTo(P[0] - L, P[1]); ctx.lineTo(P[0] + L, P[1]); ctx.stroke();
      }
    }

    function drawUnderArch(c, p, t) {
      const D = 4.55, dz = D - c[2];
      if (dz < 0.25) return;
      const col = night() ? '200,214,240' : '255,255,250';
      for (const g of G.underArch) {
        const s = (g.phase + t * 0.05) % 1;
        const P = proj(c, 838 + s * 70, g.v, D);
        if (!onScreen(P, 20)) continue;
        const A = 0.4 * Math.sin(Math.PI * s) * smooth((dz - 0.25) / 0.4) * (1 - washAt(p, P[3], P[4]));
        if (A < 0.02) continue;
        ctx.strokeStyle = `rgba(${col},${A.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, 0.3 * P[2]);
        const L = g.len * P[2] / 2;
        ctx.beginPath(); ctx.moveTo(P[0] - L, P[1]); ctx.lineTo(P[0] + L, P[1]); ctx.stroke();
      }
    }

    function drawBoat(c, p, t) {
      const bt = live.boat, D = bt.depth, dz = D - c[2];
      if (dz < 0.35) return;
      const [u0, v0, u1, v1] = bt.box;
      const w = u1 - u0, h = v1 - v0;
      const u = (u0 + u1) / 2 + 26 * Math.sin(t * TAU / 80);
      const v = (v0 + v1) / 2 + 0.45 * Math.sin(t * TAU / 3.2);
      const P = proj(c, u, v, D);
      const A = smooth((dz - 0.35) / 0.6) * (1 - washAt(p, P[3], P[4]));
      if (A < 0.02 || !onScreen(P, 200)) return;
      const S = P[2];
      const water = proj(c, u, v0 + h * 0.62, D);
      const rc = night() ? '170,190,225' : '255,255,250';
      for (let i = 0; i < 3; i++) {        // ripples spreading from the hull
        const f = ((t / 3.2) + i / 3) % 1;
        ctx.strokeStyle = `rgba(${rc},${(0.38 * (1 - f) * A).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, 0.25 * S);
        ctx.beginPath();
        ctx.ellipse(water[0], water[1], (w * 0.45 + f * 16) * S, (2 + f * 3.2) * S, 0, 0.12 * Math.PI, 0.88 * Math.PI);
        ctx.stroke();
      }
      const lantern = proj(c, u - w * 0.18, v0 + h * 0.38, D);
      const flick = 0.85 + 0.15 * Math.sin(t * 9.1) * Math.sin(t * 3.7);
      if (night()) {                        // lantern light on the water, under the hull
        const refl = ctx.createLinearGradient(0, water[1], 0, water[1] + 18 * S);
        refl.addColorStop(0, `rgba(255,196,118,${(0.45 * flick * A).toFixed(3)})`);
        refl.addColorStop(1, 'rgba(255,196,118,0)');
        ctx.fillStyle = refl;
        ctx.fillRect(lantern[0] - 1.6 * S, water[1], 3.2 * S, 18 * S);
      }
      const [rx, ry, rw, rh] = bt.rect;
      ctx.save();
      ctx.globalAlpha = A;
      ctx.translate(P[0], P[1]);
      ctx.rotate(0.012 * Math.sin(t * TAU / 3.9));
      ctx.drawImage(sprite(), rx, ry, rw, rh, -w * S / 2, -h * S / 2, w * S, h * S);
      ctx.restore();
      if (night()) {
        const g = ctx.createRadialGradient(lantern[0], lantern[1], 0, lantern[0], lantern[1], 9 * S);
        g.addColorStop(0, `rgba(255,214,140,${(0.95 * flick * A).toFixed(3)})`);
        g.addColorStop(0.18, `rgba(255,186,100,${(0.55 * flick * A).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lantern[0], lantern[1], 9 * S, 0, TAU); ctx.fill();
      }
    }

    function drawFireflies(c, p, t) {
      for (const f of G.fireflies) {
        const dz = f.D - c[2];
        if (dz < 0.3) continue;
        const u = f.u + 7 * Math.sin(t * 0.23 * f.k + f.ph) + 3 * Math.sin(t * 0.61 * f.k + f.ph * 2);
        const v = f.v + 4 * Math.sin(t * 0.31 * f.k + f.ph * 3) + 2 * Math.cos(t * 0.83 * f.k);
        const P = proj(c, u, v, f.D);
        if (!onScreen(P, 20)) continue;
        const blink = smooth((Math.sin(t * 1.3 * f.k + f.b) - 0.15) / 0.6);
        const A = blink * smooth((dz - 0.3) / 0.5) * (1 - washAt(p, P[3], P[4]));
        if (A < 0.03) continue;
        const R = Math.max(1.2, 0.5 * P[2]);
        const g = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], R * 4);
        g.addColorStop(0, `rgba(236,255,170,${(0.95 * A).toFixed(3)})`);
        g.addColorStop(0.25, `rgba(206,245,130,${(0.45 * A).toFixed(3)})`);
        g.addColorStop(1, 'rgba(190,240,110,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P[0], P[1], R * 4, 0, TAU); ctx.fill();
      }
    }

    // ------------------------------------------------------------ frame sync & lifecycle
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
      /* capture/testing: draw a given film frame at a given time (stop the loop first with pause()) */
      renderAt(f, t) { frame = clamp(f | 0, 0, cam ? cam.frames - 1 : 0); draw(t); },
      pause() { visible = false; cancelAnimationFrame(raf); raf = 0; if (vfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfc); },
      ready: () => !!(G && cam && atlas.day && (!night() || atlas.night || !opts.spritesNight)),
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
