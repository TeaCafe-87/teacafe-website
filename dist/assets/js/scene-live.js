/* TeaCafe scroll scenes: live world layer over a pre-rendered Blender flight.
 *
 * Same idea as journey-live.js on the home page, for real 3D scenes: the rendered frames hold
 * the camera move, and everything that should keep living lives here, drawn on a canvas laid
 * over the picture. Two clocks:
 *   scroll time  -> which rendered frame is on screen -> the Blender camera used for projection
 *   world time   -> performance.now(): koi swim, water falls, mist drifts, never backwards
 * so stopping the scroll freezes only the camera, and scrolling up never runs water uphill.
 *
 * Alignment: the scene exports its per-frame Blender camera (location + XYZ euler, lens/sensor);
 * world points are projected exactly as Blender does, then through the same cover/focus crop as
 * the frames. The waterfall is masked by the frame's own pixels (only where the picture is
 * waterfall-white), so cliffs and mist in front of it hide the live threads without depth data.
 *
 * Layering: over a <video> it draws on its own overlay canvas. Over the frame-sequence canvas it
 * paints INTO that canvas (frame, then world) instead: a second full-screen canvas over a
 * changing one cost ~6 ms per frame on a Radeon 780M (p95 14 -> 28 ms while scrolling).
 *
 *   const live = TeaSceneLive.attach(scene, canvas, { camera, live });   // from scroll-scene.js
 *   live.destroy();
 */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const mix = (a, b, k) => a + (b - a) * k;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function attach(scene, canvas, data) {
    const cam = data.camera, cfg = data.live || {};
    const host = scene.renderer && scene.renderer.canvas && scene.renderer.paintCurrent ? scene.renderer : null;
    const surface = host ? host.canvas : canvas;          // where the world is drawn
    canvas.hidden = !!host;
    let ctx = host ? host.ctx : canvas.getContext('2d');
    const coarse = matchMedia('(pointer: coarse)').matches;
    const minFrameMs = coarse ? 31 : 0;                  // phones: ~30 fps is plenty for drifting water
    let raf = 0, alive = true, visible = true, last = 0, prevT = 0;
    let box = { w: 1, h: 1, k: 1, ox: 0, oy: 0, dpr: 1, W: 1600, H: 900 };
    const r = rng(20261121);

    // ---------------------------------------------------------------- camera
    const mats = new Map();
    function camAt(f) {                                  // world -> camera rows for frame f (0-based)
      let m = mats.get(f);
      if (m) return m;
      const [x, y, z, rx, ry, rz] = cam.track[clamp(f, 0, cam.track.length - 1)];
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      // Blender XYZ euler: R = Rz * Ry * Rx; camera looks down its local -Z with +Y up.
      const R = [[cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx], [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx], [-sy, cy * sx, cy * cx]];
      m = { L: [x, y, z], R };
      mats.set(f, m);
      return m;
    }
    let C = null, fpx = 1;
    // [screenX, screenY, depth(m), px per metre at that depth] in CSS px, or null behind the camera
    function P(wx, wy, wz) {
      const dx = wx - C.L[0], dy = wy - C.L[1], dz = wz - C.L[2], R = C.R;
      const x = R[0][0] * dx + R[1][0] * dy + R[2][0] * dz;
      const y = R[0][1] * dx + R[1][1] * dy + R[2][1] * dz;
      const d = -(R[0][2] * dx + R[1][2] * dy + R[2][2] * dz);
      if (d < 0.2) return null;
      const s = fpx / d;
      return [box.ox + (box.W / 2 + x * s) * box.k, box.oy + (box.H / 2 - y * s) * box.k, d, s * box.k];
    }

    function layout() {
      const src = scene.liveSource();
      const rect = surface.getBoundingClientRect();
      const dpr = host ? surface.width / Math.max(1, rect.width) : Math.min(global.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
      const [W, H] = src.size, focus = src.focus;
      const k = Math.max(rect.width / W, rect.height / H);
      box = { w: rect.width, h: rect.height, k, ox: (rect.width - W * k) * focus[0], oy: (rect.height - H * k) * focus[1], dpr, W, H };
      fpx = cam.lensMm / cam.sensorMm * (src.fit === 'vertical' ? H : W);
      if (!host) {                                        // the host canvas is sized by its renderer
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
      }
      mask.stale = true;
    }

    // ---------------------------------------------------------------- river helpers
    const riverAt = (y) => {
      const t = cam.river, i = clamp(Math.floor((y - t[0][0]) / (t[1][0] - t[0][0])), 0, t.length - 2);
      const a = t[i], b = t[i + 1], k = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
      return [mix(a[1], b[1], k), mix(a[2], b[2], k)];
    };

    // ---------------------------------------------------------------- waterfall
    const wf = cam.waterfall;
    const curtain = (u, v) => [wf.x0 + (u - 0.5) * wf.width * (1 + wf.widen * v), wf.y0 - wf.lean * v * v * 4 - wf.bow * Math.sin(u * Math.PI), wf.top * (1 - v)];
    const threads = Array.from({ length: coarse ? 34 : 56 }, () => ({ u: 0.04 + r() * 0.92, ph: r(), sp: 0.22 + r() * 0.2, len: 0.05 + r() * 0.09, a: 0.28 + r() * 0.42, w: 0.6 + r() * 0.9 }));
    const spray = Array.from({ length: coarse ? 10 : 18 }, () => ({ u: r(), ph: r(), sp: 0.05 + r() * 0.05, R: 2 + r() * 4, a: 0.12 + r() * 0.12, dx: r() * 2 - 1 }));
    const mask = { c: document.createElement('canvas'), stale: true, frame: -1, bottom: 0, busy: false, ready: false };
    const mctx = mask.c.getContext('2d', { willReadFrequently: true });
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');

    // Alpha = "this pixel of the rendered frame is waterfall": bright and nearly colourless.
    // Built asynchronously: createImageBitmap crops + scales the waterfall region off the main
    // thread (a synchronous draw + readback of the full frame cost ~10 ms per scroll frame), then
    // only that tiny bitmap is read back. One job at a time; draws reuse the latest mask meanwhile.
    function buildMask(src, f, bx, by, bw, bh) {
      const img = src.image;
      const nw = img.naturalWidth || img.videoWidth, nh = img.naturalHeight || img.videoHeight;
      if (!nw || mask.busy) return;
      const sx = nw / box.W, sy = nh / box.H;
      const mw = clamp(Math.round(bw / 3), 6, 160), mh = clamp(Math.round(bh / 3), 6, 320);
      const cx = clamp(bx * sx, 0, nw - 1), cy = clamp(by * sy, 0, nh - 1);
      const cw = Math.max(1, Math.min(nw - cx, bw * sx)), ch = Math.max(1, Math.min(nh - cy, bh * sy));
      mask.busy = true;
      createImageBitmap(img, cx, cy, cw, ch, { resizeWidth: mw, resizeHeight: mh, resizeQuality: 'low' }).then((bmp) => {
        mask.busy = false;
        if (!alive) { bmp.close(); return; }
        // the crop was clamped to the frame: place it where it belongs inside the requested box
        mask.c.width = mw; mask.c.height = mh;
        mctx.clearRect(0, 0, mw, mh);
        mctx.drawImage(bmp, (cx - bx * sx) / (bw * sx) * mw, (cy - by * sy) / (bh * sy) * mh, cw / (bw * sx) * mw, ch / (bh * sy) * mh);
        bmp.close();
        finishMask(mw, mh);
        mask.frame = f; mask.stale = false; mask.ready = true;
      }, () => { mask.busy = false; });
    }
    function finishMask(mw, mh) {
      const id = mctx.getImageData(0, 0, mw, mh), d = id.data;
      let bottom = 0, bn = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const luma = 0.299 * R + 0.587 * G + 0.114 * B, sat = mx ? (mx - mn) / mx : 0;
        const a = smooth((luma - 196) / 34) * (1 - smooth((sat - 0.1) / 0.1));
        d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
        if (i / 4 >= mw * (mh - Math.max(2, mh >> 3))) { bottom += a; bn++; }
      }
      mctx.putImageData(id, 0, 0);
      mask.bottom = bn ? bottom / bn : 0;
    }

    function drawWaterfall(src, f, t) {
      if (f < 30) return;
      const c00 = P(...curtain(0, 0)), c10 = P(...curtain(1, 0)), c01 = P(...curtain(0, 1)), c11 = P(...curtain(1, 1));
      if (!c00 || !c10 || !c01 || !c11) return;
      const x0 = Math.min(c00[0], c01[0]) - 6, x1 = Math.max(c10[0], c11[0]) + 6;
      const y0 = Math.min(c00[1], c10[1]) - 4, y1 = Math.max(c01[1], c11[1]) + 4;
      const sh = y1 - y0;
      if (x1 < 0 || x0 > box.w || y1 < 0 || y0 > box.h || sh < 14) return;
      // While the camera moves, the baked waterfall animates by itself; the live threads (which
      // need a mask that matches the frame) fade in once the camera has rested for ~150 ms.
      const A = smooth((sh - 14) / 90) * still;
      if (still > 0.99 && (mask.stale || mask.frame !== f)) buildMask(src, f, (x0 - box.ox) / box.k, (y0 - box.oy) / box.k, (x1 - x0) / box.k, sh / box.k);
      if (!mask.ready || mask.frame !== f || A < 0.01) return;
      const lw = Math.max(1, Math.round((x1 - x0) * box.dpr)), lh = Math.max(1, Math.round(sh * box.dpr));
      if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; } else lctx.clearRect(0, 0, lw, lh);
      lctx.setTransform(box.dpr, 0, 0, box.dpr, -x0 * box.dpr, -y0 * box.dpr);
      lctx.globalCompositeOperation = 'source-over';
      lctx.lineCap = 'round';
      const ppm = (c00[3] + c11[3]) / 2;               // px per metre at the curtain
      for (const th of threads) {
        const s0 = (th.ph + t * th.sp) % 1, s1 = Math.min(1, s0 + th.len);
        const a = P(...curtain(th.u, s0)), b = P(...curtain(th.u, s1));
        if (!a || !b) continue;
        const fade = Math.sin(Math.PI * Math.min(1, s0 / 0.06, (1 - s0) / 0.06));
        lctx.strokeStyle = `rgba(255,255,252,${(th.a * fade).toFixed(3)})`;
        lctx.lineWidth = Math.max(0.7, 0.07 * th.w * ppm);
        lctx.beginPath(); lctx.moveTo(a[0], a[1]); lctx.lineTo(b[0], b[1]); lctx.stroke();
      }
      // keep threads only where the frame shows the falling water
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(mask.c, 0, 0, lw, lh);
      ctx.globalAlpha = A;
      ctx.drawImage(layer, x0, y0, x1 - x0, sh);
      ctx.globalAlpha = 1;
      // Plunge: rising spray and a breathing foam glow, only if the foot of the fall is visible.
      const foot = mask.bottom * A;
      if (foot < 0.05) return;
      for (const p of spray) {
        const k = (p.ph + t * p.sp) % 1;
        const base = curtain(p.u, 1);
        const q = P(base[0] + p.dx * 2.5 * k, base[1] - 2 - 3 * k, 1 + 10 * k);
        if (!q) continue;
        const R = p.R * (0.6 + k) * q[3];
        const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
        const al = p.a * foot * Math.sin(Math.PI * k);
        g.addColorStop(0, `rgba(252,250,244,${al.toFixed(3)})`); g.addColorStop(1, 'rgba(252,250,244,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill();
      }
      const pool = P(...curtain(0.5, 1));
      if (pool) {
        const R = wf.width * 0.9 * pool[3] * (1 + 0.05 * Math.sin(t * 0.9));
        ctx.save(); ctx.translate(pool[0], pool[1]); ctx.scale(1, 0.32);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, `rgba(255,254,248,${((0.2 + 0.06 * Math.sin(t * 1.3) + 0.04 * Math.sin(t * 2.9)) * foot).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,254,248,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.restore();
      }
    }

    // ---------------------------------------------------------------- koi
    const kc = cfg.koi || {};
    const PALETTE = { orange: [[204, 128, 70], [226, 216, 200]], white: [[222, 224, 214], [206, 120, 64]], ink: [[58, 62, 66], [214, 214, 206]] };
    const WATER = [92, 126, 124];
    const kinds = ['orange', 'white', 'ink', 'orange', 'white', 'orange', 'ink', 'white', 'orange', 'white', 'ink', 'orange'];
    const koi = Array.from({ length: kc.count || 0 }, (_, i) => {
      const a = r() * TAU, e = Math.sqrt(r()) * 0.7;
      return {
        x: kc.center[0] + Math.cos(a) * kc.radius[0] * e, y: kc.center[1] + Math.sin(a) * kc.radius[1] * e,
        z: mix(kc.depth[0], kc.depth[1], r()), size: mix(kc.size[0], kc.size[1], r()), kind: kinds[i % kinds.length],
        h: r() * TAU, s: 0.3, base: 0.22 + r() * 0.3, f1: 0.17 + r() * 0.25, f2: 0.41 + r() * 0.4, f3: 0.07 + r() * 0.12,
        p1: r() * TAU, p2: r() * TAU, p3: r() * TAU, tail: r() * TAU, turn: 0,
      };
    });
    function stepKoi(t, dt) {
      for (const k of koi) {
        let turn = 0.55 * Math.sin(t * k.f1 + k.p1) + 0.35 * Math.sin(t * k.f2 + k.p2);
        const ex = (k.x - kc.center[0]) / kc.radius[0], ey = (k.y - kc.center[1]) / kc.radius[1];
        const e = ex * ex + ey * ey;
        if (e > 0.55) {                                   // drift back toward the middle of the pond
          const want = Math.atan2(kc.center[1] - k.y, kc.center[0] - k.x);
          let diff = ((want - k.h + Math.PI) % TAU + TAU) % TAU - Math.PI;
          turn += diff * 2.2 * smooth((e - 0.55) / 0.45);
        }
        for (const o of koi) {                            // personal space
          if (o === k) continue;
          const dx = k.x - o.x, dy = k.y - o.y, d2 = dx * dx + dy * dy;
          if (d2 < 0.8 && d2 > 1e-6) {
            const away = Math.atan2(dy, dx);
            const diff = ((away - k.h + Math.PI) % TAU + TAU) % TAU - Math.PI;
            turn += diff * 1.2 * (1 - d2 / 0.8);
          }
        }
        k.turn += (clamp(turn, -1.6, 1.6) - k.turn) * Math.min(1, dt * 2.5);   // slow, fish-like turns
        k.h += k.turn * dt;
        const target = k.base * (0.6 + 0.6 * Math.pow(Math.sin(t * k.f3 + k.p3), 2)) * (1 - 0.35 * Math.min(1, Math.abs(k.turn)));
        k.s += (target - k.s) * Math.min(1, dt * 1.5);
        k.x += Math.cos(k.h) * k.s * dt; k.y += Math.sin(k.h) * k.s * dt;
        k.tail += dt * (4.5 + k.s * 14 + Math.abs(k.turn) * 3);
      }
    }
    // Body outline in fish units (lateral, forward); the head points to +forward.
    const BODY = [[0, 1], [0.18, 0.82], [0.27, 0.45], [0.26, 0.05], [0.18, -0.42], [0.08, -0.78], [0, -0.86], [-0.08, -0.78], [-0.18, -0.42], [-0.26, 0.05], [-0.27, 0.45], [-0.18, 0.82]];
    function drawKoi(f, t) {
      const gate = 1 - smooth((f - (kc.frames ? kc.frames[1] - 18 : 55)) / 18);
      if (gate <= 0.01) return;
      const tint = (col, w) => `rgb(${col.map((c, i) => Math.round(mix(c, WATER[i], w))).join(',')})`;
      const order = koi.map((k) => [k, P(k.x, k.y, k.z)]).filter((e) => e[1]).sort((a, b) => b[1][2] - a[1][2]);
      for (const [k] of order) {
        const sway = Math.sin(k.tail) * (0.35 + Math.min(0.25, Math.abs(k.turn) * 0.2));
        const fx = Math.cos(k.h), fy = Math.sin(k.h), rx = Math.sin(k.h), ry = -Math.cos(k.h);
        const wob = 0.025 * Math.sin(t * 1.7 + k.p1);          // light refraction wobble under the surface
        const W = (lat, fwd) => P(k.x + (rx * lat + fx * fwd) * k.size + wob, k.y + (ry * lat + fy * fwd) * k.size, k.z);
        const bend = (fwd) => (fwd < 0 ? -fwd * 0.22 * sway : 0);   // the rear half follows the tail
        const pts = BODY.map(([lat, fwd]) => W(lat + bend(fwd), fwd));
        if (pts.some((p) => !p)) continue;
        const cx = pts[0][0], cy = pts[0][1];
        if (cx < -60 || cy < -60 || cx > box.w + 60 || cy > box.h + 60) continue;
        const depthTint = 0.18 + 0.32 * clamp(-k.z, 0, 1);
        const [bodyCol, finCol] = PALETTE[k.kind];
        ctx.globalAlpha = 0.9 * gate;
        // tail: two lobes swinging around the tail root
        const root = [0 + bend(-0.86), -0.86];
        const tip = (side) => { const a = sway * 0.9, lx = side * 0.3, ly = -0.55; return [root[0] + lx * Math.cos(a) - ly * Math.sin(a), root[1] + lx * Math.sin(a) + ly * Math.cos(a)]; };
        const T0 = W(...root), T1 = W(...tip(-1)), T2 = W(...tip(1)), Tm = W(root[0] + Math.sin(sway * 0.9) * 0.38, root[1] - 0.38);
        ctx.fillStyle = tint(finCol, depthTint);
        if (T0 && T1 && T2 && Tm) { ctx.beginPath(); ctx.moveTo(T0[0], T0[1]); ctx.lineTo(T1[0], T1[1]); ctx.lineTo(Tm[0], Tm[1]); ctx.lineTo(T2[0], T2[1]); ctx.closePath(); ctx.fill(); }
        // pectoral fins, a slow paddle
        const flap = 0.08 * Math.sin(t * 3 + k.p2);
        for (const side of [-1, 1]) {
          const a = W(side * 0.18, 0.4), b = W(side * (0.52 + flap), 0.15), c = W(side * 0.2, 0.12);
          if (a && b && c) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); }
        }
        // body, smoothed through the outline midpoints
        ctx.fillStyle = tint(bodyCol, depthTint);
        ctx.beginPath();
        const n = pts.length, mid = (i) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
        let m = mid(n - 1); ctx.moveTo(m[0], m[1]);
        for (let i = 0; i < n; i++) { m = mid(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
        ctx.fill();
        if (k.kind === 'white') {                          // kohaku patch on the back
          const a = W(0, 0.62), b = W(0.1, 0.1), c = W(0, -0.32), d = W(-0.1, 0.1);
          if (a && b && c && d) { ctx.fillStyle = tint(finCol, depthTint); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.quadraticCurveTo(d[0], d[1], a[0], a[1]); ctx.fill(); }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- water shimmer & mist
    const shimmer = Array.from({ length: coarse ? 140 : 260 }, () => {
      const y = -14 + r() * 262, [rx0, hw] = riverAt(y);
      return { x: rx0 + (r() * 2 - 1) * hw * 0.72, y, len: 0.8 + r() * 2.6, ph: r() * TAU, f: 0.5 + r() * 1.1 };
    });
    function drawShimmer(t) {
      ctx.lineCap = 'round';
      for (const s of shimmer) {
        const a = P(s.x - s.len / 2, s.y, 0.02), b = P(s.x + s.len / 2, s.y, 0.02);
        if (!a || !b || a[2] < 3 || a[2] > 170) continue;
        if (a[1] < 0 || a[1] > box.h || Math.max(a[0], b[0]) < 0 || Math.min(a[0], b[0]) > box.w) continue;
        const A = Math.pow(Math.max(0, Math.sin(t * s.f + s.ph)), 3) * 0.42 * smooth((a[2] - 3) / 6) * (1 - smooth((a[2] - 110) / 60));
        if (A < 0.02) continue;
        ctx.strokeStyle = `rgba(255,255,250,${A.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, 0.05 * a[3]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    const mist = Array.from({ length: coarse ? 9 : 16 }, () => {
      const y = -6 + r() * 250, [rx0, hw] = riverAt(y);
      return { x: rx0 + (r() * 2 - 1) * hw * 0.6, y, z: 1.5 + r() * 5, w: 18 + r() * 26, h: 2.5 + r() * 4, sp: (0.35 + r() * 0.7) * (r() < 0.5 ? -1 : 1), span: 70, a: 0.1 + r() * 0.12, ph: r() * TAU };
    });
    function drawMist(t) {
      for (const m of mist) {
        const off = ((m.sp * t + m.ph * 10) % m.span + m.span) % m.span - m.span / 2;
        const edge = smooth((m.span / 2 - Math.abs(off)) / (m.span * 0.18));
        const q = P(m.x + off, m.y, m.z + 0.4 * Math.sin(t * 0.2 + m.ph));
        if (!q || q[2] < 8 || q[2] > 220) continue;
        const rx = m.w * q[3] / 2, ry = m.h * q[3] / 2;
        if (q[0] + rx < 0 || q[0] - rx > box.w || q[1] + ry < 0 || q[1] - ry > box.h) continue;
        const A = m.a * edge * smooth((q[2] - 8) / 14) * (1 - smooth((q[2] - 150) / 70)) * (0.8 + 0.2 * Math.sin(t * 0.31 + m.ph));
        if (A < 0.01) continue;
        ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(250,248,240,${A.toFixed(3)})`); g.addColorStop(0.6, `rgba(250,248,240,${(A * 0.5).toFixed(3)})`); g.addColorStop(1, 'rgba(250,248,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
      }
    }

    // ---------------------------------------------------------------- loop
    let lastLayoutKey = '', worldT = 0, worldSrc = null, lastFrame = -1, frameChangedAt = 0, still = 0;
    // Draw the world for the current camera into ctx (CSS px space scaled by box.dpr).
    function paintWorld(target) {
      const src = worldSrc;
      if (!src || src.frame < 0 || !src.image) return;
      ctx = target;
      C = camAt(src.frame);
      ctx.save();
      ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
      drawShimmer(worldT);
      drawKoi(src.frame, worldT);
      drawMist(worldT);
      drawWaterfall(src, src.frame, worldT);
      ctx.restore();
    }
    function draw(now) {
      const src = scene.liveSource();
      worldSrc = src;
      if (!host) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
      if (!src || src.frame < 0 || !src.image) return;
      const key = `${src.size}|${src.fit}|${surface.clientWidth}x${surface.clientHeight}|${surface.width}`;
      if (key !== lastLayoutKey) { lastLayoutKey = key; layout(); }
      const t = now / 1000;
      const dt = prevT ? Math.min(0.1, t - prevT) : 1 / 60;
      prevT = t;
      worldT = t;
      if (src.frame !== lastFrame) { lastFrame = src.frame; frameChangedAt = now; }
      still = smooth((now - frameChangedAt - 150) / 250);
      stepKoi(t, dt);                                    // world time keeps going even off-gate
      if (host) { if (host.paintedAt !== now) host.paintCurrent(); }   // frame + world, once per frame
      else paintWorld(ctx);
    }
    if (host) host.overlay = (hctx) => paintWorld(hctx);
    function tick(now) {
      raf = 0;
      if (!alive || !visible) return;
      if (now - last >= minFrameMs) { last = now; draw(now); }
      raf = requestAnimationFrame(tick);
    }
    const wake = () => { if (alive && visible && !raf) raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; if (visible) wake(); else { prevT = 0; } });
    io.observe(surface);
    const onVis = () => { visible = !document.hidden; prevT = 0; wake(); };
    document.addEventListener('visibilitychange', onVis);
    const onResize = () => { lastLayoutKey = ''; };
    addEventListener('resize', onResize, { passive: true });
    wake();

    return {
      /* testing / capture: render one frame at a given world time */
      renderAt(t) { draw(t * 1000); },
      koi: () => koi.map((k) => ({ x: k.x, y: k.y, h: k.h, s: k.s })),
      destroy() {
        alive = false;
        if (host && host.overlay) { host.overlay = null; host.paintCurrent(); }
        canvas.hidden = false;
        cancelAnimationFrame(raf);
        io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        removeEventListener('resize', onResize);
        if (!host) canvas.width = canvas.height = 0;
        layer.width = layer.height = 0;
        mask.c.width = mask.c.height = 0;
      },
    };
  }

  global.TeaSceneLive = { attach };
})(window);
