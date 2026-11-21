/* TeaCafe scroll scenes: live world layer over a pre-rendered Blender flight.
 *
 * Same idea as journey-live.js on the home page, for real 3D scenes: the rendered frames hold
 * the camera move (their water, waterfall and mist textures are static), and everything that
 * should keep living lives here. Two clocks:
 *   scroll time  -> which rendered frame is on screen -> the Blender camera used for projection
 *   world time   -> performance.now(): koi swim, water falls, mist drifts, lanterns flicker,
 *                   never backwards
 * so stopping the scroll freezes only the camera, and scrolling up never runs water uphill.
 *
 * Alignment: the scene exports its per-frame Blender camera (location + XYZ euler, lens/sensor);
 * world points are projected exactly as Blender does, then through the same cover/focus crop as
 * the frames. Occlusion comes from Cowork's per-frame masks (half the frame size, same camera):
 * R = visible lake/river, G = visible waterfall curtain; rock, trees and bridges in front are
 * black. Masks load on demand for the frame on screen (one at a time, ~9/s while scrolling) and
 * are reduced off the main thread with createImageBitmap; only tiny bitmaps are read back.
 * Lanterns use Cowork's per-frame visibility list (camera_analysis.json -> lanterns_visible).
 *
 * Layering: over a <video> it draws on its own overlay canvas. Over the frame-sequence canvas it
 * paints INTO that canvas (frame, then world) instead: a second full-screen canvas over a
 * changing one cost ~6 ms per frame on a Radeon 780M (p95 14 -> 28 ms while scrolling).
 *
 * Features are switched on per scene by the manifest's `live` block:
 *   koi {..}, water, waterfall, mist {frames}, lanterns {glowM, dark}
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
    const has = { water: !!(cfg.water && cam.river), fall: !!(cfg.waterfall && cam.waterfall), mist: !!(cfg.mist && cam.river), lanterns: !!(cfg.lanterns && cam.lanterns) };

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
    // [x, y] in source-frame px (before the cover crop), depth (m), px per metre; null behind the camera
    function S(M, wx, wy, wz) {
      const dx = wx - M.L[0], dy = wy - M.L[1], dz = wz - M.L[2], R = M.R;
      const x = R[0][0] * dx + R[1][0] * dy + R[2][0] * dz;
      const y = R[0][1] * dx + R[1][1] * dy + R[2][1] * dz;
      const d = -(R[0][2] * dx + R[1][2] * dy + R[2][2] * dz);
      if (d < 0.2) return null;
      const s = fpx / d;
      return [box.W / 2 + x * s, box.H / 2 - y * s, d, s];
    }
    // [screenX, screenY, depth(m), px per metre at that depth] in CSS px, or null behind the camera
    function P(wx, wy, wz) {
      const q = S(C, wx, wy, wz);
      return q && [box.ox + q[0] * box.k, box.oy + q[1] * box.k, q[2], q[3] * box.k];
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
      const ws = coarse ? 0.5 : 0.6;                      // water effects are soft: a smaller layer is enough
      wl.width = Math.max(1, Math.round(rect.width * dpr * ws));
      wl.height = Math.max(1, Math.round(rect.height * dpr * ws));
      wl.scale = dpr * ws;
    }

    // ---------------------------------------------------------------- river helpers
    const riverAt = (y) => {
      const t = cam.river, i = clamp(Math.floor((y - t[0][0]) / (t[1][0] - t[0][0])), 0, t.length - 2);
      const a = t[i], b = t[i + 1], k = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
      return [mix(a[1], b[1], k), mix(a[2], b[2], k)];
    };

    // ---------------------------------------------------------------- masks
    const cover = cam.cover || null;                     // per-frame permille: skip frames with nothing visible
    const covered = (variant, kind, f) => !cover || !cover[variant] || (cover[variant][kind][f] || 0) > 0;
    const masks = { imgs: new Map(), loading: -1, busy: false, lastReq: 0, d: null };
    // Read-back canvases are CPU-backed (willReadFrequently); each result is copied once into a
    // plain (GPU) canvas so the per-frame draws never upload from the CPU.
    const scratchW = document.createElement('canvas'), wctx = scratchW.getContext('2d', { willReadFrequently: true });
    const scratchF = document.createElement('canvas'), fctx = scratchF.getContext('2d', { willReadFrequently: true });
    const waterC = document.createElement('canvas'), waterG = waterC.getContext('2d');
    const fallC = document.createElement('canvas'), fallG = fallC.getContext('2d');
    const wl = document.createElement('canvas'), wlctx = wl.getContext('2d');     // water layer: shimmer + koi
    const layer = document.createElement('canvas'), lctx = layer.getContext('2d'); // falling threads
    const maskUrl = (src, f) => src.masks.replace(/\{(0+)\}/, (_, pad) => String(f + 1).padStart(pad.length, '0'));

    // Waterfall curtain bounds for frame f in source px, clipped to the frame.
    const wf = cam.waterfall;
    const curtain = (u, v) => [wf.x0 + (u - 0.5) * wf.width * (1 + wf.widen * v), wf.y0 - wf.lean * v * v * 4 - wf.bow * Math.sin(u * Math.PI), wf.top * (1 - v)];
    function fallBox(f) {
      const M = camAt(f);
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1]].map(([u, v]) => S(M, ...curtain(u, v)));
      if (pts.some((p) => !p)) return null;
      const x0 = Math.max(0, Math.min(...pts.map((p) => p[0])) - 6), x1 = Math.min(box.W, Math.max(...pts.map((p) => p[0])) + 6);
      const y0 = Math.max(0, Math.min(...pts.map((p) => p[1])) - 4), y1 = Math.min(box.H, Math.max(...pts.map((p) => p[1])) + 4);
      return x1 - x0 > 4 && y1 - y0 > 7 ? [x0, y0, x1 - x0, y1 - y0] : null;
    }

    function wantMask(src, f, now) {
      if (!src.masks || !(has.water || has.fall)) return;
      if (masks.loading >= 0 || masks.busy || (masks.d && masks.d.f === f && (masks.d.lum || !masks.d.fall || still < 0.5))) return;
      if (!covered(src.variant, 'water', f) && !covered(src.variant, 'fall', f)) { masks.d = null; return; }
      if (now - masks.lastReq < (still > 0.5 ? 0 : 110)) return;   // while scrolling: at most ~9 masks/s
      masks.lastReq = now;
      const cached = masks.imgs.get(f);
      if (cached) { derive(src, f, cached); return; }
      masks.loading = f;
      const img = new Image();
      img.decoding = 'async';
      img.src = maskUrl(src, f);
      img.decode().then(() => {
        masks.loading = -1;
        if (!alive) return;
        masks.imgs.set(f, img);
        if (masks.imgs.size > 8) masks.imgs.delete(masks.imgs.keys().next().value);
        derive(scene.liveSource() || src, f, img);
      }, () => { masks.loading = -1; });
    }

    // Reduce one mask (and the waterfall crop of the frame on screen) to small alpha canvases:
    //   waterC alpha = R (visible water); fallC alpha = G x frame brightness, because G covers the
    //   curtain's full extent incl. its faded edges and the live threads belong on the white streaks.
    function derive(src, f, img) {
      if (!src || !src.image) return;
      const [W, H] = src.size, [MW, MH] = src.maskSize, ms = MW / W;
      const fi = src.image, fw = fi.naturalWidth || fi.videoWidth, fs = fw / W;
      const ww = Math.round(MW / 4), wh = Math.round(MH / 4);
      const wantWater = has.water && covered(src.variant, 'water', f);
      const fb = has.fall && covered(src.variant, 'fall', f) ? fallBox(f) : null;
      // Frame brightness only once the camera rests: reading back the frame while scrolling is the
      // expensive part; meanwhile G alone (slightly wider than the white streaks) is fine.
      const withLum = fb && still > 0.5;
      const mw = fb ? clamp(Math.round(fb[2] / 3), 6, 160) : 0, mh = fb ? clamp(Math.round(fb[3] / 3), 6, 320) : 0;
      const opt = (w, h) => ({ resizeWidth: w, resizeHeight: h, resizeQuality: 'low' });
      masks.busy = true;
      Promise.all([
        wantWater ? createImageBitmap(img, opt(ww, wh)) : null,
        fb ? createImageBitmap(img, fb[0] * ms, fb[1] * ms, fb[2] * ms, fb[3] * ms, opt(mw, mh)) : null,
        withLum && fw ? createImageBitmap(fi, fb[0] * fs, fb[1] * fs, fb[2] * fs, fb[3] * fs, opt(mw, mh)) : null,
      ]).then(([wb, mb, pb]) => {
        masks.busy = false;
        if (!alive) { [wb, mb, pb].forEach((b) => b && b.close()); return; }
        const d = { f, water: false, fall: null, bottom: 0, lum: !!pb };
        if (wb) {
          scratchW.width = ww; scratchW.height = wh;
          wctx.drawImage(wb, 0, 0); wb.close();
          const id = wctx.getImageData(0, 0, ww, wh), p = id.data;
          for (let i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 255; }
          wctx.putImageData(id, 0, 0);
          waterC.width = ww; waterC.height = wh; waterG.drawImage(scratchW, 0, 0);
          d.water = true;
        }
        if (mb) {
          scratchF.width = mw; scratchF.height = mh;
          let lum = null;
          if (pb) { fctx.drawImage(pb, 0, 0); pb.close(); lum = fctx.getImageData(0, 0, mw, mh).data; }
          fctx.clearRect(0, 0, mw, mh);
          fctx.drawImage(mb, 0, 0); mb.close();
          const id = fctx.getImageData(0, 0, mw, mh), p = id.data;
          let bottom = 0, bn = 0;
          const foot = mw * (mh - Math.max(2, mh >> 3));
          for (let i = 0; i < p.length; i += 4) {
            const l = lum ? 0.299 * lum[i] + 0.587 * lum[i + 1] + 0.114 * lum[i + 2] : 255;
            const a = (p[i + 1] / 255) * smooth((l - 150) / 70);
            p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = a * 255;
            if (i / 4 >= foot) { bottom += a; bn++; }
          }
          fctx.putImageData(id, 0, 0);
          fallC.width = mw; fallC.height = mh; fallG.drawImage(scratchF, 0, 0);
          d.fall = fb; d.bottom = bn ? bottom / bn : 0;
        }
        masks.d = d;
      }, () => { masks.busy = false; });
    }

    // ---------------------------------------------------------------- waterfall
    // The baked curtain is static and already white: light threads alone barely change it, so
    // about 40% are blue-grey gaps travelling down with them, which is what reads as falling water.
    const threads = Array.from({ length: coarse ? 40 : 68 }, () => ({ u: 0.04 + r() * 0.92, ph: r(), sp: 0.22 + r() * 0.2, len: 0.05 + r() * 0.09, a: 0.28 + r() * 0.42, w: 0.6 + r() * 0.9, dark: r() < 0.4 }));
    const spray = Array.from({ length: coarse ? 10 : 18 }, () => ({ u: r(), ph: r(), sp: 0.05 + r() * 0.05, R: 2 + r() * 4, a: 0.12 + r() * 0.12, dx: r() * 2 - 1 }));

    function drawWaterfall(d, t, A0) {
      const fb = d.fall;
      const x0 = box.ox + fb[0] * box.k, y0 = box.oy + fb[1] * box.k, bw = fb[2] * box.k, sh = fb[3] * box.k;
      if (x0 + bw < 0 || x0 > box.w || y0 + sh < 0 || y0 > box.h || sh < 14) return;
      const A = smooth((sh - 14) / 90) * A0;
      if (A < 0.01) return;
      const lw = Math.max(1, Math.round(bw * box.dpr)), lh = Math.max(1, Math.round(sh * box.dpr));
      if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; } else lctx.clearRect(0, 0, lw, lh);
      lctx.setTransform(box.dpr, 0, 0, box.dpr, -x0 * box.dpr, -y0 * box.dpr);
      lctx.globalCompositeOperation = 'source-over';
      lctx.lineCap = 'round';
      const c00 = P(...curtain(0, 0)), c11 = P(...curtain(1, 1));
      const ppm = c00 && c11 ? (c00[3] + c11[3]) / 2 : 1;   // px per metre at the curtain
      for (const th of threads) {
        const s0 = (th.ph + t * th.sp) % 1, s1 = Math.min(1, s0 + th.len);
        const a = P(...curtain(th.u, s0)), b = P(...curtain(th.u, s1));
        if (!a || !b) continue;
        const fade = Math.sin(Math.PI / 2 * Math.min(1, s0 / 0.06, (1 - s0) / 0.06));   // 0 at the lip and the pool, 1 between
        lctx.strokeStyle = th.dark ? `rgba(112,134,140,${(th.a * 0.6 * fade).toFixed(3)})` : `rgba(255,255,252,${(th.a * fade).toFixed(3)})`;
        lctx.lineWidth = Math.max(0.7, (th.dark ? 0.1 : 0.07) * th.w * ppm);
        lctx.beginPath(); lctx.moveTo(a[0], a[1]); lctx.lineTo(b[0], b[1]); lctx.stroke();
      }
      // keep threads only on the visible, bright part of the curtain
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(fallC, 0, 0, lw, lh);
      ctx.globalAlpha = A;
      ctx.drawImage(layer, x0, y0, bw, sh);
      ctx.globalAlpha = 1;
      // Plunge: rising spray and a breathing foam glow, only if the foot of the fall is visible.
      const foot = d.bottom * A;
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
    const shimmer = has.water ? Array.from({ length: coarse ? 140 : 260 }, () => {
      const y = -14 + r() * 262, [rx0, hw] = riverAt(y);
      return { x: rx0 + (r() * 2 - 1) * hw * 0.72, y, len: 0.8 + r() * 2.6, ph: r() * TAU, f: 0.5 + r() * 1.1 };
    }) : [];
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
    const mist = has.mist ? Array.from({ length: coarse ? 9 : 16 }, () => {
      const y = -6 + r() * 250, [rx0, hw] = riverAt(y);
      return { x: rx0 + (r() * 2 - 1) * hw * 0.6, y, z: 1.5 + r() * 5, w: 18 + r() * 26, h: 2.5 + r() * 4, sp: (0.35 + r() * 0.7) * (r() < 0.5 ? -1 : 1), span: 70, a: 0.1 + r() * 0.12, ph: r() * TAU };
    }) : [];
    const mistFrames = (cfg.mist && cfg.mist.frames) || [1, 1e9];
    function drawMist(f, t) {
      const n = f + 1;                                    // manifest frames are 1-based
      const gate = smooth((n - mistFrames[0] + 1) / 8) * (1 - smooth((n - mistFrames[1] + 8) / 8));
      if (gate <= 0.01) return;
      for (const m of mist) {
        const off = ((m.sp * t + m.ph * 10) % m.span + m.span) % m.span - m.span / 2;
        const edge = smooth((m.span / 2 - Math.abs(off)) / (m.span * 0.18));
        const q = P(m.x + off, m.y, m.z + 0.4 * Math.sin(t * 0.2 + m.ph));
        if (!q || q[2] < 8 || q[2] > 220) continue;
        const rx = m.w * q[3] / 2, ry = m.h * q[3] / 2;
        if (q[0] + rx < 0 || q[0] - rx > box.w || q[1] + ry < 0 || q[1] - ry > box.h) continue;
        const A = gate * m.a * edge * smooth((q[2] - 8) / 14) * (1 - smooth((q[2] - 150) / 70)) * (0.8 + 0.2 * Math.sin(t * 0.31 + m.ph));
        if (A < 0.01) continue;
        ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(250,248,240,${A.toFixed(3)})`); g.addColorStop(0.6, `rgba(250,248,240,${(A * 0.5).toFixed(3)})`); g.addColorStop(1, 'rgba(250,248,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
      }
    }

    // ---------------------------------------------------------------- lanterns (wiki-03)
    // Glow breathes and flickers on world time; dust drifts up through each lantern's light.
    const lan = cam.lanterns, lc = cfg.lanterns || {};
    const flame = has.lanterns ? lan.world.map(() => ({ p1: r() * TAU, p2: r() * TAU, p3: r() * TAU, f1: 5 + r() * 4, f2: 11 + r() * 6 })) : [];
    const dust = has.lanterns ? Array.from({ length: coarse ? 90 : 170 }, (_, i) => {
      const a = r() * TAU, rad = 0.25 + Math.sqrt(r()) * 1.5;
      return { li: i % lan.world.length, ox: Math.cos(a) * rad, oy: Math.sin(a) * rad, h: 2.6 + r() * 1.4, ph: r(), sp: 0.035 + r() * 0.06, sw: r() * TAU, sz: 0.008 + r() * 0.014 };
    }) : [];
    function drawLanterns(src, f, t) {
      const vis = lan.visible[src.variant] && lan.visible[src.variant][f];
      if (!vis || !vis.length) return;
      const dk = lc.dark || [130, 170];
      const dark = smooth((f + 1 - dk[0]) / (dk[1] - dk[0]));
      const glowM = lc.glowM || 0.55;
      const lit = new Map();
      ctx.globalCompositeOperation = 'lighter';
      for (const i of vis) {
        const q = P(...lan.world[i]);
        if (!q || q[0] < -200 || q[0] > box.w + 200 || q[1] < -200 || q[1] > box.h + 200) continue;
        const fl = flame[i];
        // slow breath + quick flicker + an occasional dip, never fully out
        const k = 0.84 + 0.07 * Math.sin(t * 1.1 + fl.p3) + 0.05 * Math.sin(t * fl.f1 + fl.p1) + 0.03 * Math.sin(t * fl.f2 + fl.p2)
          - 0.14 * Math.pow(Math.max(0, Math.sin(t * 0.37 + fl.p2 * 3)), 16);
        lit.set(i, k);
        const R = glowM * q[3] * 2.4 * (0.94 + 0.08 * k);
        const halo = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
        halo.addColorStop(0, `rgba(255,190,110,${(0.2 * k * (0.35 + 0.65 * dark)).toFixed(3)})`);
        halo.addColorStop(0.35, `rgba(255,160,80,${(0.07 * k * (0.35 + 0.65 * dark)).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(255,150,70,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill();
        const Rc = Math.max(2, glowM * q[3] * 0.5);
        const core = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], Rc);
        core.addColorStop(0, `rgba(255,232,180,${(0.28 * k).toFixed(3)})`); core.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(q[0], q[1], Rc, 0, TAU); ctx.fill();
      }
      if (dark > 0.05) {
        for (const p of dust) {
          const k = lit.get(p.li);
          if (k === undefined) continue;
          const L = lan.world[p.li], u = (p.ph + t * p.sp) % 1;
          const wx = L[0] + p.ox + 0.12 * Math.sin(t * 0.6 + p.sw), wy = L[1] + p.oy + 0.12 * Math.cos(t * 0.5 + p.sw);
          const q = P(wx, wy, L[2] - 1.2 + u * p.h);
          if (!q || q[0] < 0 || q[0] > box.w || q[1] < 0 || q[1] > box.h) continue;
          const dist = Math.hypot(p.ox, p.oy, -1.2 + u * p.h);
          const A = dark * k * 0.5 * Math.sin(Math.PI * u) * (1 - smooth((dist - 0.4) / 1.4));
          if (A < 0.02) continue;
          ctx.fillStyle = `rgba(255,214,150,${A.toFixed(3)})`;
          const s = Math.max(0.8, p.sz * q[3]);
          ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------------- loop
    let lastLayoutKey = '', worldT = 0, worldSrc = null, lastFrame = -1, frameChangedAt = 0, still = 0;
    // Draw the world for the current camera into ctx (CSS px space scaled by box.dpr).
    function paintWorld(target) {
      const src = worldSrc;
      if (!src || src.frame < 0 || !src.image) return;
      const f = src.frame, t = worldT;
      ctx = target;
      C = camAt(f);
      ctx.save();
      ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
      // a mask a few frames old (still loading while scrolling) is close enough; older ones fade out
      const d = masks.d, near = d ? 1 - smooth((Math.abs(d.f - f) - 2) / 5) : 0;
      if (d && d.water && near > 0.01 && (shimmer.length || koi.length)) {
        const main = ctx;
        ctx = wlctx;
        wlctx.setTransform(1, 0, 0, 1, 0, 0);
        wlctx.globalCompositeOperation = 'source-over';
        wlctx.clearRect(0, 0, wl.width, wl.height);
        wlctx.setTransform(wl.scale, 0, 0, wl.scale, 0, 0);
        drawShimmer(t);
        drawKoi(f, t);
        wlctx.globalCompositeOperation = 'destination-in';   // only where water is visible
        wlctx.drawImage(waterC, box.ox, box.oy, box.W * box.k, box.H * box.k);
        ctx = main;
        ctx.globalAlpha = near;
        ctx.drawImage(wl, 0, 0, box.w, box.h);
        ctx.globalAlpha = 1;
      }
      if (has.mist) drawMist(f, t);
      if (d && d.fall && near > 0.01) drawWaterfall(d, t, near);
      if (has.lanterns) drawLanterns(src, f, t);
      ctx.restore();
    }
    function draw(now) {
      const src = scene.liveSource();
      worldSrc = src;
      if (!host) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
      if (!src || src.frame < 0 || !src.image) return;
      const key = `${src.size}|${src.fit}|${surface.clientWidth}x${surface.clientHeight}|${surface.width}`;
      if (key !== lastLayoutKey) { lastLayoutKey = key; layout(); masks.d = null; }
      const t = now / 1000;
      const dt = prevT ? Math.min(0.1, t - prevT) : 1 / 60;
      prevT = t;
      worldT = t;
      if (src.frame !== lastFrame) { lastFrame = src.frame; frameChangedAt = now; }
      still = smooth((now - frameChangedAt - 80) / 120);
      wantMask(src, src.frame, now);
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
      debug: () => ({ fall: fallC.toDataURL(), layer: layer.toDataURL(), water: waterC.toDataURL(), box, fb: masks.d && masks.d.fall }),
      mask: () => (masks.d ? { f: masks.d.f, water: masks.d.water, fall: !!masks.d.fall, bottom: masks.d.bottom } : null),
      destroy() {
        alive = false;
        if (host && host.overlay) { host.overlay = null; host.paintCurrent(); }
        canvas.hidden = false;
        cancelAnimationFrame(raf);
        io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        removeEventListener('resize', onResize);
        if (!host) canvas.width = canvas.height = 0;
        for (const c of [layer, wl, waterC, fallC, scratchW, scratchF]) c.width = c.height = 0;
        masks.imgs.clear();
      },
    };
  }

  global.TeaSceneLive = { attach };
})(window);
