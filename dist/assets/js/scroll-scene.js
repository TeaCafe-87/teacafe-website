/* TeaCafe scroll scene engine.
 *
 * One engine for every chapter scene (Wiki, careers, rules, ...). A page only declares:
 *   <section data-scroll-scene="/data/scenes/<id>.json" style="--scene-length:420svh">
 *     <div class="scroll-scene-stage">
 *       <img class="scroll-scene-poster" ...>   (LCP + no-JS / reduced-motion fallback)
 *       <div class="scroll-scene-media"></div>    (engine mounts <video> or <canvas> here)
 *       <div class="page-title-inner"> ... [data-beat="id"] ... </div>
 *     </div>
 *   </section>
 * Timing (beats), media sources and crop focus live in the scene JSON, copy lives in
 * the HTML, so a new scene is a new JSON + markup block with no engine changes.
 *
 * Renderers (picked by manifest `renderer`, overridable with ?renderer=video|frames):
 *   video  - one muted MP4, scrubbed via currentTime; seeks never overlap.
 *   frames - an image sequence drawn to <canvas>; loads coarse-to-fine so fast
 *            scrolling always has a nearby frame.
 * Scroll is never intercepted; progress comes from the section's position.
 *
 * Several scenes on one page chain seamlessly when the next one's first frame is the previous
 * one's last (wiki-01 -> 02 -> 03): CSS overlaps the sections by one stage height and the engine
 * flags the pinned stage (data-scene-pinned) so it paints on top. A scene more than ~1.5 screens
 * away sleeps: its renderer, frames, decoder and live layers are released, and it remounts
 * before it comes back into view, so a long page never holds every scene's media at once.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const portraitQuery = matchMedia('(max-aspect-ratio: 3/4)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const reduced = () => reducedQuery.matches || root.dataset.motion === 'reduced';
  // Save-Data, 2G, or <=1 GB devices get the poster instead of a moving scene.
  const lowData = () => Boolean(navigator.connection?.saveData) || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')
    || (navigator.deviceMemory || 8) <= 1;
  const override = new URLSearchParams(location.search).get('renderer');

  // Beat envelope: 0 -> 1 over the first `edge` of its range, holds, 1 -> 0 over the last `edge`.
  // Pure function of progress, so reversing the scroll reverses the animation exactly.
  function beatState(progress, beat) {
    const span = Math.max(1e-6, beat.to - beat.from);
    const local = (progress - beat.from) / span;
    const edge = beat.edge ?? 0.22;
    const enter = beat.from <= 0 ? 1 : smooth(local / edge);     // a beat at 0 is visible on load
    const leave = beat.to >= 1 ? 0 : smooth((local - (1 - edge)) / edge);
    return { enter, leave };
  }

  // Order frame indices coarse-to-fine: 0, last, every 32nd, 16th, ... 1st.
  function loadOrder(count) {
    const order = [], seen = new Uint8Array(count);
    const push = i => { if (i >= 0 && i < count && !seen[i]) { seen[i] = 1; order.push(i); } };
    push(0); push(count - 1);
    for (let step = 32; step >= 1; step >>= 1) for (let i = 0; i < count; i += step) push(i);
    return order;
  }

  // Cover-fit with a focus point so portrait/landscape crops keep the composition.
  function coverRect(mw, mh, cw, ch, focus = [0.5, 0.5]) {
    const s = Math.max(cw / mw, ch / mh), w = mw * s, h = mh * s;
    return [(cw - w) * focus[0], (ch - h) * focus[1], w, h];
  }

  function stats() {
    return { renderer: '', draws: 0, seeks: 0, seekMs: [], staleFrames: [], loaded: 0, total: 0, firstFrameMs: 0,
      allLoadedMs: 0, decodeMs: [] };
  }

  class VideoRenderer {
    constructor(host, source, scene) {
      this.scene = scene;
      this.video = document.createElement('video');
      Object.assign(this.video, { muted: true, playsInline: true, preload: 'auto', disablePictureInPicture: true });
      this.video.setAttribute('muted', '');
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('aria-hidden', 'true');
      this.video.className = 'scroll-scene-video';
      this.video.style.objectPosition = `${source.focus[0] * 100}% ${source.focus[1] * 100}%`;
      this.target = 0;
      this.seekStart = 0;
      this.onSeeked = () => {
        if (this.seekStart) scene.stats.seekMs.push(performance.now() - this.seekStart);
        this.seekStart = 0;
        scene.queue();
      };
      this.onReady = () => {
        if (!scene.stats.firstFrameMs) scene.stats.firstFrameMs = performance.now() - scene.startedAt;
        host.classList.add('is-ready');
        scene.queue();
      };
      this.onError = () => scene.fail();
      this.video.addEventListener('seeked', this.onSeeked);
      this.video.addEventListener('loadeddata', this.onReady);
      this.video.addEventListener('error', this.onError);
      this.video.src = source.video;
      host.append(this.video);
      scene.stats.total = 1;
    }
    // Returns true while the displayed frame still lags the requested one.
    draw(progress) {
      const v = this.video;
      if (v.readyState < 2 || !Number.isFinite(v.duration)) return true;
      const fps = this.scene.manifest.fps;
      const t = Math.round(progress * (this.scene.frameCount - 1)) / fps;
      this.target = Math.min(t, v.duration - 1 / (fps * 2));
      if (v.seeking) return true;                         // newest position is applied on 'seeked'
      if (Math.abs(v.currentTime - this.target) < 1 / (fps * 2)) return false;
      this.scene.stats.staleFrames.push(Math.round(Math.abs(v.currentTime - this.target) * fps));
      this.seekStart = performance.now();
      this.scene.stats.seeks++;
      try { v.currentTime = this.target; } catch { /* metadata can reset on source change */ }
      return true;
    }
    resize() {}
    unlockOnGesture() {
      // iOS may defer decoding until a gesture; a muted play/pause primes the first frame.
      if (this.video.readyState < 2) this.video.play()?.then(() => this.video.pause()).catch(() => {});
    }
    destroy() {
      this.video.removeEventListener('seeked', this.onSeeked);
      this.video.removeEventListener('loadeddata', this.onReady);
      this.video.removeEventListener('error', this.onError);
      this.video.removeAttribute('src');
      this.video.load();                                  // releases the decoder
      this.video.remove();
    }
  }

  // Frame sequence on <canvas>. Each frame is an <img> decoded once; the browser's own image
  // decode cache decides how many decoded frames stay resident (Chrome evicts on its own).
  // Only the active (pinned) scene of a page holds its full set. An inactive neighbour keeps a
  // coarse set (first, last, every 32nd: ~11 frames, incl. the frame it shares with the next
  // scene): two full sets overflowed Chrome's decode cache and the visible scene re-decoded its
  // frames on draw (desktop p95 10 -> 20 ms while the neighbour loaded).
  // Measured on the real 300-frame wiki-01 set (Radeon 780M, Chrome 157): peak +~220 MB over a
  // no-scene baseline and 0 lagging frames. Manual caches were worse: a 16-frame ImageBitmap
  // window peaked at +320..790 MB (decode/close churn), an <img> window at +370..500 MB.
  class FrameRenderer {
    constructor(host, source, scene) {
      this.scene = scene;
      this.host = host;
      this.source = source;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'scroll-scene-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      host.append(this.canvas);
      this.count = scene.frameCount;
      this.images = new Array(this.count);
      this.ready = new Uint8Array(this.count);
      this.queueOrder = loadOrder(this.count);
      this.coarse = new Uint8Array(this.count);
      for (let i = 0; i < this.count; i += 32) this.coarse[i] = 1;
      this.coarse[this.count - 1] = 1;
      this.full = false;
      this.cursor = 0;
      this.inflight = 0;
      this.drawn = -1;
      this.alive = true;
      scene.stats.total = this.count;
      this.resize();
      this.pump();
    }
    url(i) {   // index 0 -> file 0001 (1-based frame numbering); `patches` override frame ranges
      const n = i + 1;
      const patch = (this.source.patches || []).find((q) => n >= q.from && n <= q.to);
      return (patch ? patch.frames : this.source.frames).replace(/\{(0+)\}/, (_, pad) => String(n).padStart(pad.length, '0'));
    }
    pump() {
      while (this.alive && this.inflight < (this.full ? 6 : 2) && this.cursor < this.queueOrder.length) {
        const i = this.queueOrder[this.cursor];
        if (this.ready[i]) { this.cursor++; continue; }
        if (!this.full && !this.coarse[i]) break;          // inactive: coarse set only
        this.cursor++;
        const img = new Image();
        img.decoding = 'async';
        img.src = this.url(i);
        this.inflight++;
        const t0 = performance.now();
        img.decode().then(() => {
          if (!this.alive || this.ready[i]) return;
          if (!this.full && !this.coarse[i]) { img.src = ''; return; }   // went inactive meanwhile
          this.images[i] = img;
          this.ready[i] = 1;
          const st = this.scene.stats;
          st.loaded++;
          st.decodeMs.push(performance.now() - t0);        // fetch + decode, per frame
          if (st.loaded === this.count) st.allLoadedMs = performance.now() - this.scene.startedAt;
          this.scene.queue();
        }).catch(() => { if (i === 0) this.scene.fail(); }).finally(() => { this.inflight--; this.pump(); });
      }
    }
    // Active: load everything, nearest to the current frame first (every 4th, then the rest).
    // Inactive: release all but the coarse set so a page holds one full scene at a time.
    setActive(active, want) {
      if (active === this.full) return;
      this.full = active;
      const todo = [];
      for (let i = 0; i < this.count; i++) {
        if (!active && !this.coarse[i] && this.images[i]) {
          if (i === this.drawn) continue;                   // keep what is on screen
          this.images[i].src = ''; this.images[i] = undefined; this.ready[i] = 0; this.scene.stats.loaded--;
        }
        if (!this.ready[i]) todo.push(i);
      }
      const key = i => (this.coarse[i] ? 0 : i % 4 ? 2e6 : 1e6) + Math.abs(i - want);
      this.queueOrder = todo.sort((a, b) => key(a) - key(b));
      this.cursor = 0;
      if (active) this.pump();
    }
    nearest(i) {
      if (this.ready[i]) return i;
      for (let d = 1; d < this.count; d++) {
        if (i - d >= 0 && this.ready[i - d]) return i - d;
        if (i + d < this.count && this.ready[i + d]) return i + d;
      }
      return -1;
    }
    draw(progress) {
      const want = Math.round(progress * (this.count - 1));
      const have = this.nearest(want);
      if (have < 0) return true;
      if (have !== this.drawn) {
        const first = this.drawn < 0;
        this.drawn = have;
        this.paintCurrent();
        if (first && !this.host.classList.contains('is-ready')) {
          this.scene.stats.firstFrameMs = performance.now() - this.scene.startedAt;
          this.host.classList.add('is-ready');
        }
        this.scene.stats.draws++;
        if (have !== want) this.scene.stats.staleFrames.push(Math.abs(have - want));
      }
      return have !== want;                               // keep polling until the exact frame lands
    }
    // Paint the frame on screen, then whatever lives over it (scene-live.js sets `overlay`).
    paintCurrent() {
      const img = this.images[this.drawn];
      if (!img) return;
      const { width: cw, height: ch } = this.canvas;
      const [W, H] = this.source.size || [img.naturalWidth, img.naturalHeight];
      const [x, y, w, h] = coverRect(W, H, cw, ch, this.source.focus);
      this.ctx.drawImage(img, x, y, w, h);
      this.paintedAt = this.scene.lastTick;               // lets the live layer skip a second paint this frame
      if (this.overlay) this.overlay(this.ctx);
    }
    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = this.host.getBoundingClientRect();
      const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
      const [W, H] = this.source.size || [1600, 900];
      const scale = Math.max(1, Math.max(cw / W, ch / H));   // never allocate more pixels than the source has
      this.canvas.width = Math.round(cw / scale);
      this.canvas.height = Math.round(ch / scale);
      this.drawn = -1;
    }
    unlockOnGesture() {}
    destroy() {
      this.alive = false;
      for (const img of this.images) if (img) img.src = '';   // let the decoded data go with the elements
      this.images = [];
      this.canvas.width = this.canvas.height = 0;        // frees the backing store immediately
      this.canvas.remove();
    }
  }

  class Scene {
    constructor(section) {
      this.section = section;
      this.stage = section.querySelector('.scroll-scene-stage');
      this.mediaHost = section.querySelector('.scroll-scene-media');
      this.beats = [...section.querySelectorAll('[data-beat]')];
      this.manifest = null;
      this.renderer = null;
      this.frame = 0;
      this.shown = null;          // smoothed progress actually displayed
      this.lastTick = 0;
      this.visible = true;
      this.awake = true;
      this.pinned = false;
      this.failed = false;
      this.stats = stats();
      this.startedAt = performance.now();
      this.queue = this.queue.bind(this);
      this.tick = this.tick.bind(this);
      this.onResize = () => { this.renderer?.resize(); this.queue(); };
      this.onGesture = () => this.renderer?.unlockOnGesture();
      this.onVisibility = () => (document.hidden ? this.cancel() : this.queue());
      this.sync = () => this.mount();
    }
    async start() {
      try {
        const res = await fetch(this.section.dataset.scrollScene, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`scene ${res.status}`);
        this.manifest = await res.json();
      } catch { this.fail(); return; }
      const m = this.manifest;
      this.frameCount = m.frames ?? Math.round(m.duration * m.fps);
      this.section.dataset.sceneId = m.id;
      this.beatData = this.beats.map(el => ({ el, beat: m.beats.find(b => b.id === el.dataset.beat), last: '' }))
        .filter(b => b.beat);
      addEventListener('scroll', this.queue, { passive: true });
      addEventListener('resize', this.onResize, { passive: true });
      addEventListener('pageshow', this.queue);
      addEventListener('pointerdown', this.onGesture, { passive: true, once: true });
      document.addEventListener('visibilitychange', this.onVisibility);
      reducedQuery.addEventListener('change', this.sync);
      portraitQuery.addEventListener('change', this.sync);
      this.motionObserver = new MutationObserver(this.sync);
      this.motionObserver.observe(root, { attributes: true, attributeFilter: ['data-motion'] });
      this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.queue(); });
      this.io.observe(this.section);
      // Sleep beyond 1.5 screens; scenes start at 1 screen (boot), so the band has hysteresis.
      this.awakeIo = new IntersectionObserver(([e]) => {
        if (e.isIntersecting === this.awake) return;
        this.awake = e.isIntersecting;
        if (this.manifest && this.mountedKey !== undefined) this.mount();
      }, { rootMargin: '150% 0px' });
      this.awakeIo.observe(this.section);
      if (m.camera) {
        try { this.camera = await (await fetch(m.camera, { credentials: 'same-origin' })).json(); } catch { this.camera = null; }
      }
      this.mount();
    }
    // What the live layer needs: the picture on screen, its frame index and its crop.
    liveSource() {
      const r = this.renderer, src = r?.source;
      if (!r || !src) return null;
      if (r.video) {
        const v = r.video;
        return { image: v.readyState >= 2 ? v : null, frame: Math.round(v.currentTime * this.manifest.fps), size: src.size || [v.videoWidth, v.videoHeight], focus: src.focus, fit: src.fit, masks: src.masks, maskSize: src.maskSize, variant: this.variant };
      }
      return { image: r.images[r.drawn] || null, frame: r.drawn, size: src.size, focus: src.focus, fit: src.fit, masks: src.masks, maskSize: src.maskSize, variant: this.variant };
    }
    attachLayers() {
      this.live?.destroy(); this.live = null;
      this.fluid?.destroy(); this.fluid = null;
      const liveCanvas = this.stage.querySelector('[data-scene-world]');
      const fluidCanvas = this.stage.querySelector('[data-scene-fluid]');
      if (!this.renderer) return;
      if (liveCanvas && this.camera && window.TeaSceneLive) {
        liveCanvas.hidden = false;
        this.live = window.TeaSceneLive.attach(this, liveCanvas, { camera: this.camera, live: this.manifest.live });
      }
      // The ink-fluid cursor needs a mouse; touch scrolling would stir it constantly on phones.
      if (fluidCanvas && window.TeaInkFluid && finePointer.matches) {
        const picture = this.renderer.video || this.renderer.canvas;
        // A fresh <canvas> per attach: a WebGL context cannot be re-created on a lost canvas.
        const fresh = fluidCanvas.cloneNode(false);
        fluidCanvas.replaceWith(fresh);
        // Over frames the live world is already inside the picture canvas; over video it is its own layer.
        const overlay = this.renderer.video ? liveCanvas : null;
        this.fluid = window.TeaInkFluid.attach(fresh, { video: picture, overlay, active: () => this.fluidActive() });
      }
    }
    fluidActive() {
      const r = this.stage.getBoundingClientRect();
      return this.visible && r.top > -8 && r.bottom > innerHeight * 0.9 && !root.hasAttribute('data-wiki-reader');
    }
    // (Re)choose renderer + source for the current device state.
    mount() {
      if (!this.awake) {                                  // far away: release media, keep the poster
        if (this.mountedKey === 'sleep') return;
        this.mountedKey = 'sleep';
        this.live?.destroy(); this.live = null;
        this.fluid?.destroy(); this.fluid = null;
        this.renderer?.destroy(); this.renderer = null;
        this.mediaHost.classList.remove('is-ready');
        return;
      }
      let still = reduced() || lowData() || this.failed;
      const variant = portraitQuery.matches ? 'mobile' : 'desktop';
      this.variant = variant;
      const src = this.manifest.sources[variant] || {};
      let kind = override || this.manifest.renderer?.[variant] || 'video';
      if (!src[kind]) kind = src.frames ? 'frames' : src.video ? 'video' : '';   // use whatever the scene ships
      if (!kind) still = true;
      this.section.classList.toggle('is-static', still);
      const key = still ? 'static' : `${variant}:${kind}`;
      if (key === this.mountedKey) return this.queue();
      this.mountedKey = key;
      this.renderer?.destroy();
      this.renderer = null;
      this.mediaHost.classList.remove('is-ready');
      this.shown = null;
      if (!still) {
        const source = { ...src, focus: src.focus || [0.5, 0.5] };
        this.stats = stats();
        this.stats.renderer = `${variant}:${kind}`;
        this.startedAt = performance.now();
        this.renderer = kind === 'frames' ? new FrameRenderer(this.mediaHost, source, this) : new VideoRenderer(this.mediaHost, source, this);
        this.renderer.source = source;
      }
      this.attachLayers();
      this.queue();
    }
    progress() {
      const r = this.section.getBoundingClientRect();
      return clamp(-r.top / Math.max(1, r.height - innerHeight));
    }
    queue() {
      if (!this.frame && !document.hidden) this.frame = requestAnimationFrame(this.tick);
    }
    cancel() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.lastTick = 0;
    }
    tick(now) {
      this.frame = 0;
      if (!this.manifest) return;
      const dt = Math.min(64, now - (this.lastTick || now - 16));
      this.lastTick = now;
      const r = this.section.getBoundingClientRect();
      const target = clamp(-r.top / Math.max(1, r.height - innerHeight));
      // Pinned = the sticky stage fills the viewport; the pinned stage of a chain paints on top.
      const pinned = r.top <= 0.5 && r.bottom >= this.stage.offsetHeight - 0.5;
      if (pinned !== this.pinned) { this.pinned = pinned; this.section.toggleAttribute('data-scene-pinned', pinned); }
      // Active (full frame set) = pinned. Dropping back to the coarse set waits 1.5 s, so stopping
      // right at a hand-over does not reload a scene's frames over and over.
      if (this.renderer?.setActive) {
        if (pinned) { clearTimeout(this.trimTimer); this.trimTimer = 0; this.renderer.setActive(true, Math.round(target * (this.frameCount - 1))); }
        else if (this.renderer.full && !this.trimTimer) this.trimTimer = setTimeout(() => { this.trimTimer = 0; if (!this.pinned) this.renderer?.setActive(false, 0); }, 1500);
      }
      const still = this.section.classList.contains('is-static');
      // Critically damped follow (~80 ms) hides wheel steps without feeling detached.
      if (this.shown === null || still) this.shown = target;
      else this.shown += (target - this.shown) * (1 - Math.exp(-dt / 80));
      if (Math.abs(target - this.shown) < 1 / (this.frameCount * 4)) this.shown = target;
      this.section.style.setProperty('--scene-progress', this.shown.toFixed(4));
      this.section.dataset.sceneLive = '';
      for (const b of this.beatData) {
        const { enter, leave } = still ? { enter: 1, leave: 0 } : beatState(this.shown, b.beat);
        const key = `${enter.toFixed(3)}|${leave.toFixed(3)}`;
        if (key === b.last) continue;                      // skip style writes when nothing changed
        b.last = key;
        b.el.style.setProperty('--beat-in', enter.toFixed(3));
        b.el.style.setProperty('--beat-out', leave.toFixed(3));
        b.el.toggleAttribute('data-beat-active', enter > 0.01 && leave < 0.99);
      }
      let pending = false;
      if (this.renderer && this.visible) pending = this.renderer.draw(this.shown);
      if (this.shown !== target || pending) this.queue();
    }
    fail() {
      this.failed = true;
      if (this.manifest) this.mount();
      else this.section.classList.add('is-static');
    }
    destroy() {
      this.cancel();
      clearTimeout(this.trimTimer);
      this.live?.destroy(); this.live = null;
      this.fluid?.destroy(); this.fluid = null;
      this.renderer?.destroy();
      this.renderer = null;
      removeEventListener('scroll', this.queue);
      removeEventListener('resize', this.onResize);
      removeEventListener('pageshow', this.queue);
      removeEventListener('pointerdown', this.onGesture);
      document.removeEventListener('visibilitychange', this.onVisibility);
      reducedQuery.removeEventListener('change', this.sync);
      portraitQuery.removeEventListener('change', this.sync);
      this.motionObserver?.disconnect();
      this.io?.disconnect();
      this.awakeIo?.disconnect();
    }
  }

  const scenes = [];
  function boot() {
    for (const section of document.querySelectorAll('[data-scroll-scene]')) {
      if (section.dataset.sceneBooted) continue;
      section.dataset.sceneBooted = '';
      // Scenes start lazily; without motion, collapse the later ones now so the page never jumps.
      if (reduced() || lowData()) section.classList.add('is-static');
      const scene = new Scene(section);
      scenes.push(scene);
      // Start fetching only when the scene is within one viewport (future multi-scene pages).
      const near = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        near.disconnect();
        scene.start();
      }, { rootMargin: '100% 0px' });
      near.observe(section);
    }
  }
  // Full teardown only when the page is really discarded; bfcache keeps scenes alive.
  addEventListener('pagehide', e => { if (!e.persisted) scenes.splice(0).forEach(s => s.destroy()); });
  window.TeaScrollScene = { scenes, boot, beatState, loadOrder, coverRect };
  boot();
})();
