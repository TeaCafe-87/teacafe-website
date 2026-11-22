/* TeaCafe scroll journey: a fixed background film whose playback position follows scroll.
 * Scrolling down advances the camera, scrolling up reverses it, stopping holds the frame.
 * The film is never "played", only seeked, so no autoplay policy applies.
 *
 * Inner pages: one film (journey.mp4), progress = scroll through the [data-journey] block.
 * Home ([data-film-set]): the v2 four-act films, picked by orientation (portrait below 3:4) and
 * day/night (Taipei clock, or the visitor's setting), with the journey-live overlay (waterfall,
 * boat, birds) and the ink-fluid cursor effect. Progress there is anchored to content: every
 * [data-p="a,b"] element maps "top enters the viewport bottom" to film progress a and "bottom
 * leaves the viewport top" to b, so each act's text scrolls past while its half-blank frame
 * holds, however long the text is; the gaps between them carry the camera moves.
 * Reduced motion, missing video or load errors fall back to the still poster. */
(() => {
  'use strict';
  const journey = document.querySelector('[data-journey]');
  const video = journey && journey.querySelector('[data-journey-video]');
  if (!journey || !video) return;

  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---- Film choice (home only) ---- */
  const V = '/assets/video/';
  const filmSet = journey.hasAttribute('data-film-set');
  const poster = journey.querySelector('.journey-poster');
  const liveCanvas = journey.querySelector('[data-journey-live]');
  const fluidCanvas = journey.querySelector('[data-ink-fluid]');
  const taipeiHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const isNight = () => {
    let pref = 'auto';
    try { pref = localStorage.getItem('teacafe-theme') || 'auto'; } catch {}
    if (pref === 'day' || pref === 'night') return pref === 'night';
    const h = taipeiHour();
    return h >= 18 || h < 6;
  };
  let base = '';
  const pickBase = () => (isNight() ? 'journey-night-' : 'journey-') + (innerWidth / innerHeight <= 0.75 ? 'portrait' : 'desktop');
  let live = null;

  function chooseFilm() {
    if (!filmSet) return;
    const next = pickBase();
    document.body.classList.toggle('theme-night', next.includes('night'));
    if (next === base) return;
    const resume = video.currentTime || 0;
    base = next;
    if (poster) poster.src = V + base + '-start.jpg';
    video.src = V + base + '.mp4';
    video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(resume, video.duration || 0); }, { once: true });
    const camera = V + base + '.camera.json';
    if (live) live.setCamera(camera);
    else if (liveCanvas && window.TeaJourneyLive) {
      live = window.TeaJourneyLive.attach(video, liveCanvas, {
        camera, live: V + 'journey-live.json', sprites: V + 'journey-sprites.png', spritesNight: V + 'journey-sprites-night.png',
      });
    }
  }
  chooseFilm();

  // Home loader (intro-gate.js): fonts, the poster and the first film frame fill the seal ring;
  // once all three are in, the opening plays, so the page appears complete and in the right theme.
  if (filmSet && window.teaIntro && !window.teaIntro.done) {
    const ready = { fonts: false, poster: false, film: false };
    const tick = (key) => {
      if (ready[key]) return;
      ready[key] = true;
      const n = Object.values(ready).filter(Boolean).length;
      window.teaIntro.progress(n / 3);
      if (n === 3) setTimeout(() => window.teaIntro.go(), 450); // let the ring visibly close first
    };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => tick('fonts'));
    if (!poster || (poster.complete && poster.naturalWidth)) tick('poster');
    else { poster.addEventListener('load', () => tick('poster'), { once: true }); poster.addEventListener('error', () => tick('poster'), { once: true }); }
    if (video.readyState >= 2) tick('film');
    else { video.addEventListener('loadeddata', () => tick('film'), { once: true }); video.addEventListener('error', () => tick('film'), { once: true }); }
    window.teaIntro.progress(0.08);
  }
  if (fluidCanvas && window.TeaInkFluid) {
    window.TeaInkFluid.attach(fluidCanvas, { video, overlay: liveCanvas, active: () => !journey.classList.contains('journey-done') });
  }

  /* ---- Scroll -> film progress ---- */
  let anchors = [];            // [scrollY, p] pairs, ascending
  function measure() {
    const marks = [...journey.querySelectorAll('[data-p]')];
    const vh = innerHeight;
    anchors = [];
    for (const el of marks) {
      const [a, b] = el.dataset.p.split(',').map(Number);
      const top = el.getBoundingClientRect().top + scrollY;
      anchors.push([top - vh, a], [top + el.offsetHeight, b]);
    }
    anchors.sort((x, y) => x[0] - y[0]);
  }
  const progress = () => {
    if (!anchors.length) {
      const rect = journey.getBoundingClientRect();
      const span = rect.height - innerHeight;
      return span > 60 ? clamp(-rect.top / span, 0, 1) : 0;
    }
    const y = scrollY;
    if (y <= anchors[0][0]) return clamp(anchors[0][1], 0, 1);
    for (let i = 1; i < anchors.length; i++) {
      const [y1, p1] = anchors[i];
      if (y <= y1) {
        const [y0, p0] = anchors[i - 1];
        return clamp(p0 + (p1 - p0) * ((y - y0) / Math.max(y1 - y0, 1)), 0, 1);
      }
    }
    return clamp(anchors[anchors.length - 1][1], 0, 1);
  };

  let duration = 0;          // seconds of film
  let target = 0;            // where scroll wants the film to be
  let current = 0;           // where we have asked the decoder to be
  let raf = 0;
  let playing = false;       // metadata ready and scrubbing active
  let lastSeekAt = 0;

  const still = () => {
    journey.classList.remove('journey-live');
    journey.classList.add('journey-still');
    playing = false;
  };

  // Chase the target time with a light ease so fast flicks stay fluid, and
  // never queue a new seek while the decoder is still working on one.
  function frame(now) {
    raf = 0;
    if (!playing) return;
    const delta = target - current;
    if (Math.abs(delta) < 0.018) {
      if (current !== target && !video.seeking) {
        current = target;
        video.currentTime = current;
      }
      return; // settled: hold this frame until the next scroll
    }
    if (!video.seeking || now - lastSeekAt > 120) {
      current += delta * 0.24;
      lastSeekAt = now;
      video.currentTime = current;
    }
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && playing) raf = requestAnimationFrame(frame); };

  function onScroll() {
    // past the journey: the archive covers the viewport, stop compositing
    const rect = journey.getBoundingClientRect();
    journey.classList.toggle('journey-done', rect.bottom < -8);
    if (!playing) return;
    target = progress() * duration;
    wake();
  }

  function start() {
    if (reduced()) { still(); return; }
    duration = Math.max((video.duration || 0) - 0.05, 0);
    if (!duration) { still(); return; }
    video.pause();
    playing = true;
    journey.classList.remove('journey-still');
    journey.classList.add('journey-live');
    target = progress() * duration;
    current = clamp(video.currentTime, 0, duration);
    wake();
  }

  video.addEventListener('loadedmetadata', start);
  video.addEventListener('error', still);
  if (video.readyState >= 1) start();

  const relayout = () => { chooseFilm(); measure(); onScroll(); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', relayout, { passive: true });
  addEventListener('load', relayout);
  addEventListener('teacafe-theme', relayout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { measure(); onScroll(); }).observe(journey);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { chooseFilm(); onScroll(); } });

  const syncMotion = () => { if (reduced()) still(); else if (!playing && video.readyState >= 1) start(); };
  motionQuery.addEventListener ? motionQuery.addEventListener('change', syncMotion) : motionQuery.addListener(syncMotion);
  new MutationObserver(syncMotion).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  measure();
  onScroll();

  /* ---- Home: one scroll gesture = the next scroll (卷) ----
   * A wheel notch, a swipe or Arrow/Page/Space glides to the next stop: the hero, then each scene
   * centred in its act's blank half, then the page end. The glide is a timed scroll, so the film
   * plays the camera move between acts. A scene taller than the screen is paged through first.
   * The scrollbar, anchor links and text fields keep working normally. */
  if (!filmSet || !window.TeaJourneyNav) return;
  const scenes = [...journey.querySelectorAll('.act .scene')];
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  function stops() {
    const vh = innerHeight, list = [0];
    for (const el of scenes) {
      const top = docTop(el), h = el.offsetHeight;
      list.push(h < vh * 0.8 ? top + h / 2 - vh / 2 : top - vh * 0.12);
    }
    const featured = document.querySelector('[data-featured-section]');
    if (featured && !featured.hidden) list.push(docTop(featured));
    list.push(maxY());
    return list.map((y) => clamp(Math.round(y), 0, maxY())).filter((y, i, a) => i === 0 || y > a[i - 1] + 8);
  }
  // Gestures, glides and the topbar: journey-nav.js (shared with the scroll-scene pages).
  const nav = window.TeaJourneyNav({
    stops,
    page(dir) {   // a scene taller than the screen is paged through before moving on
      const vh = innerHeight, y = scrollY;
      const cur = scenes.find((el) => { const r = el.getBoundingClientRect(); return r.top < vh * 0.5 && r.bottom > vh * 0.5; });
      if (!cur) return null;
      const r = cur.getBoundingClientRect();
      if (dir > 0 && r.bottom > vh + 24) return y + Math.min(r.bottom - vh + 48, vh * 0.75);
      if (dir < 0 && r.top < -24) return y + Math.max(r.top - vh * 0.12, -vh * 0.75);
      return null;
    },
  });
  const { glide, peekTopbar } = nav;
  window.teaGlideTo = (y, duration) => glide(y, { duration });

  // In-page links (如何入住, the footer seal) glide slowly so the film plays the whole way there.
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element && event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    const id = decodeURIComponent(link.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target && id !== 'top') return;
    event.preventDefault();
    if (!target) { peekTopbar(); glide(0); return; }
    const top = docTop(target), h = target.offsetHeight, vh = innerHeight;
    const y = h < vh * 0.8 ? top + h / 2 - vh / 2 : top - vh * 0.12;
    glide(y, { duration: clamp(2600 + Math.abs(y - scrollY) * 0.4, 3600, 8000) });
    history.replaceState(null, '', '#' + encodeURIComponent(id));
  }, true);

})();
