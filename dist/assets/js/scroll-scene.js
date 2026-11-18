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
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const portraitQuery = matchMedia('(max-aspect-ratio: 3/4)');
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const reduced = () => reducedQuery.matches || root.dataset.motion === 'reduced';
  const lowData = () => Boolean(navigator.connection?.saveData) || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
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
    return { renderer: '', draws: 0, seeks: 0, seekMs: [], staleFrames: [], loaded: 0, total: 0, firstFrameMs: 0 };
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
      this.cursor = 0;
      this.inflight = 0;
      this.drawn = -1;
      this.alive = true;
      scene.stats.total = this.count;
      this.resize();
      this.pump();
    }
    url(i) {
      return this.source.frames.replace(/\{(0+)\}/, (_, pad) => String(i + 1).padStart(pad.length, '0'));
    }
    pump() {
      const limit = 6;
      while (this.alive && this.inflight < limit && this.cursor < this.queueOrder.length) {
        const i = this.queueOrder[this.cursor++];
        const img = new Image();
        img.decoding = 'async';
        img.src = this.url(i);
        this.inflight++;
        img.decode().then(() => {
          if (!this.alive) return;
          this.images[i] = img;
          this.ready[i] = 1;
          this.scene.stats.loaded++;
          if (i === 0) {
            this.scene.stats.firstFrameMs = performance.now() - this.scene.startedAt;
            this.host.classList.add('is-ready');
          }
          this.scene.queue();
        }).catch(() => { if (i === 0) this.scene.fail(); }).finally(() => { this.inflight--; this.pump(); });
      }
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
        const img = this.images[have];
        const { width: cw, height: ch } = this.canvas;
        const [x, y, w, h] = coverRect(img.naturalWidth, img.naturalHeight, cw, ch, this.source.focus);
        this.ctx.drawImage(img, x, y, w, h);
        this.drawn = have;
        this.scene.stats.draws++;
        if (have !== want) this.scene.stats.staleFrames.push(Math.abs(have - want));
      }
      return have !== want;                               // keep polling until the exact frame lands
    }
    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);   // frames are 1280w; more pixels buy nothing
      const r = this.host.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.drawn = -1;
    }
    unlockOnGesture() {}
    destroy() {
      this.alive = false;
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
      if (m.placeholder) this.section.dataset.scenePlaceholder = '';
      // Grade hook: day (default) | dusk | night. A future site theme can set data-scene-time directly.
      const time = new URLSearchParams(location.search).get('time');
      if (/^(day|dusk|night)$/.test(time || '')) this.section.dataset.sceneTime = time;
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
      this.mount();
    }
    // (Re)choose renderer + source for the current device state.
    mount() {
      const still = reduced() || lowData() || this.failed;
      this.section.classList.toggle('is-static', still);
      const variant = portraitQuery.matches ? 'mobile' : 'desktop';
      const kind = override || this.manifest.renderer?.[variant] || 'video';
      const key = still ? 'static' : `${variant}:${kind}`;
      if (key === this.mountedKey) return this.queue();
      this.mountedKey = key;
      this.renderer?.destroy();
      this.renderer = null;
      this.mediaHost.classList.remove('is-ready');
      this.shown = null;
      if (!still) {
        const src = this.manifest.sources[variant];
        const source = { ...src, focus: src.focus || [0.5, 0.5] };
        this.stats = stats();
        this.stats.renderer = `${variant}:${kind}`;
        this.startedAt = performance.now();
        this.renderer = kind === 'frames' ? new FrameRenderer(this.mediaHost, source, this) : new VideoRenderer(this.mediaHost, source, this);
      }
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
      const target = this.progress();
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
    }
  }

  const scenes = [];
  function boot() {
    for (const section of document.querySelectorAll('[data-scroll-scene]')) {
      if (section.dataset.sceneBooted) continue;
      section.dataset.sceneBooted = '';
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
