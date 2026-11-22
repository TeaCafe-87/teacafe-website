/* Scroll-scene journeys: stops and flights for any page built from scroll scenes.
 *
 *   <section data-scroll-scene="…json" data-scene-stops="0.4,0.73">   stop at these scene progresses
 *
 * Wires journey-nav.js (the home page's wheel / touch / keyboard glides and auto-hiding topbar) to
 * the scenes: each listed progress of each scene is a stop, plus the page top and the page end.
 * Because a stop is a scroll position and the scenes draw from scroll position, the frames and the
 * copy beats stay exactly in sync during a glide.
 *
 * Paused (native scrolling, topbar pinned) while html has [data-journey-paused] (a reader panel is
 * open), and whenever the scenes are static (reduced motion, Save-Data): those visitors get plain
 * scrolling.
 *
 *   TeaSceneJourney.fly({ from, to, duration })  -> Promise<boolean>
 * A short camera flight: from/to are { scene: <index or section>, p: 0..1 }. If the camera is still
 * before `from`, an ink veil covers a jump there; the flight waits (max 3 s) until that picture can
 * be drawn, then plays the frames to `to` in `duration` ms. From past `from`, it flies on from where
 * the camera is. Resolves false (the caller just opens its panel) with reduced motion, static
 * scenes, frames that never arrive, or Esc. The veil ends covering the screen when `veilAtEnd` is
 * set; TeaSceneJourney.unveil() lifts it once the caller's panel is on screen.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const sections = [...document.querySelectorAll('[data-scroll-scene]')];
  if (!window.TeaJourneyNav || !sections.some((s) => s.dataset.sceneStops)) return;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';
  const isStatic = () => sections.some((s) => s.classList.contains('is-static'));
  const maxY = () => root.scrollHeight - innerHeight;
  const sceneOf = (section) => window.TeaScrollScene?.scenes.find((s) => s.section === section);
  // Before a scene's manifest loads, its geometry alone gives the same answer as Scene.scrollAt.
  const scrollAt = (section, p) => sceneOf(section)?.scrollAt(p)
    ?? section.getBoundingClientRect().top + scrollY + p * Math.max(1, section.offsetHeight - innerHeight);

  function stops() {
    const list = [0];
    for (const s of sections) for (const p of (s.dataset.sceneStops || '').split(',')) if (p.trim()) list.push(scrollAt(s, +p));
    list.push(maxY());
    return list.sort((a, b) => a - b);
  }
  let flying = false;
  const nav = window.TeaJourneyNav({
    stops,
    paused: () => flying || reduced() || isStatic() || root.hasAttribute('data-journey-paused'),
    pinTopbar: () => root.hasAttribute('data-journey-paused'),
  });

  // The page restores its own scroll position: the browser's restoration on Back/Forward would
  // otherwise fight a panel that puts the camera back where it was. Saved per history entry.
  history.scrollRestoration = 'manual';
  const save = () => { try { history.replaceState({ ...(history.state || {}), sceneY: Math.round(scrollY) }, ''); } catch { /* rate-limited */ } };
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  if (history.state && history.state.sceneY > 0) scrollTo({ top: history.state.sceneY, behavior: 'instant' });

  // ---- ink veil: a soft wash that hides a jump (never a blank screen: the scene stays under it)
  const veil = document.createElement('div');
  veil.className = 'scene-veil';
  veil.setAttribute('aria-hidden', 'true');
  document.body.append(veil);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function cover(tone) { veil.dataset.tone = tone || 'paper'; veil.classList.add('is-on'); return wait(420); }
  function unveil() { veil.classList.remove('is-on'); }

  const pick = (ref) => ({ section: typeof ref.scene === 'number' ? sections[ref.scene] : ref.scene, p: ref.p });
  async function ready(section, p, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (sceneOf(section)?.readyAt(p)) return true;
      await new Promise(requestAnimationFrame);
    }
    return false;
  }

  async function fly({ from, to, duration = 4200, minSpan = 1200, veilAtEnd = false, tone = 'paper', endTone = 'ink' }) {
    if (flying || reduced() || isStatic()) return false;
    from = pick(from); to = pick(to);
    nav.stop();
    flying = true;
    let aborted = false;
    const onKey = (e) => { if (e.key === 'Escape') { aborted = true; nav.stop(); } };
    addEventListener('keydown', onKey, true);
    root.setAttribute('data-journey-flying', '');
    const path = sections.slice(sections.indexOf(from.section), sections.indexOf(to.section) + 1);
    try {
      const startY = scrollAt(from.section, from.p), endY = Math.min(scrollAt(to.section, to.p), maxY());
      let span = duration;
      // Far before the start: jump there under the veil. Close to it (or past it): fly on from here.
      if (scrollY < startY - innerHeight * 1.6) {
        await cover(tone);
        scrollTo({ top: startY, behavior: 'instant' });
        if (!(await ready(from.section, from.p, 3000)) || aborted) { unveil(); return false; }
        path.forEach((s) => sceneOf(s)?.keepFull(true));
        unveil();
      } else {                                            // already past it: a shorter flight from here
        path.forEach((s) => sceneOf(s)?.keepFull(true));
        span = Math.max(minSpan, duration * Math.min(1, (endY - scrollY) / Math.max(1, endY - startY)));
      }
      if (Math.abs(endY - scrollY) > 2) {
        await new Promise((done) => {
          nav.glide(endY, { duration: span, ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), done });
          if (veilAtEnd) setTimeout(() => !aborted && cover(endTone), Math.max(0, span - 520));
          const poll = setInterval(() => { if (aborted || !nav.gliding()) { clearInterval(poll); done(); } }, 50);
        });
      } else if (veilAtEnd) await cover(endTone);
      if (aborted) { unveil(); return false; }
      if (veilAtEnd && !veil.classList.contains('is-on')) await cover(endTone);
      return true;
    } finally {
      path.forEach((s) => sceneOf(s)?.keepFull(false));
      removeEventListener('keydown', onKey, true);
      root.removeAttribute('data-journey-flying');
      flying = false;
    }
  }

  // Jump straight to y (closing a reader): the veil hides the scenes until that picture is drawable.
  async function jump(y) {
    const at = sections.filter((s) => { const top = scrollAt(s, 0); return y >= top - 1 && y <= scrollAt(s, 1) + 1; }).pop();
    const far = Math.abs(y - scrollY) > innerHeight * 1.5;
    if (far && at) { veil.dataset.tone = 'paper'; veil.classList.add('is-on', 'is-instant'); void veil.offsetWidth; veil.classList.remove('is-instant'); }
    scrollTo({ top: y, behavior: 'instant' });
    if (far && at) {
      const top = scrollAt(at, 0), span = Math.max(1, scrollAt(at, 1) - top);
      await ready(at, (y - top) / span, 1500);
      unveil();
    }
  }

  window.TeaSceneJourney = { fly, jump, unveil, stops, nav, scrollAt: (ref) => scrollAt(pick(ref).section, ref.p), flying: () => flying };
})();
