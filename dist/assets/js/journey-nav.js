/* TeaCafe journey navigation, shared by the home film and the scroll-scene pages.
 *
 *   TeaJourneyNav({ stops, page?, paused?, heroY?, pinTopbar? }) -> { glide, go, peekTopbar, updateTopbar, gliding }
 *
 * One scroll gesture = the next stop. A wheel notch, a swipe or Arrow/Page/Space glides to the
 * next stop (stops() -> ascending scroll Y). The glide is a timed scroll, so whatever the page
 * drives from scroll position (the home film, a scene's frames, its copy) plays the move between
 * stops in sync. A gesture during a glide extends it toward the following stop, so a continuous
 * scroll flows through without halting. Decaying wheel deltas (trackpad inertia) are ignored, so
 * one flick never skips several stops. page(dir) may return an intermediate target first (a
 * section taller than the screen is paged through). While paused() is true nothing is
 * intercepted (an open reader scrolls natively). Text fields, dialogs and the scrollbar always
 * work normally. Reduced motion: glides become instant jumps.
 *
 * Topbar: shown near the top (y < heroY()) and while hovered, focused, a menu is open or
 * pinTopbar() is true; elsewhere it tucks away and peeks for a moment on the way back up, when the
 * pointer reaches the top edge, or when keyboard focus enters it.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const maxY = () => root.scrollHeight - innerHeight;

  window.TeaJourneyNav = function TeaJourneyNav(opts) {
    const paused = opts.paused || (() => false);
    const heroY = opts.heroY || (() => innerHeight * 0.55);

    function nextTarget(dir) {
      const paged = opts.page ? opts.page(dir) : null;
      if (paged != null) return paged;
      const list = opts.stops().map((y) => clamp(Math.round(y), 0, maxY())), y = scrollY;
      return dir > 0 ? (list.find((s) => s > y + 8) ?? y) : ([...list].reverse().find((s) => s < y - 8) ?? y);
    }

    let gliding = false, glideTo = 0, glideRaf = 0, lastIntent = 0, onDone = null;
    // Within a section (text to text) stays brisk; a longer move lets the camera be watched.
    const durationFor = (dist) => (dist <= innerHeight * 1.35
      ? clamp(650 + dist * 0.42, 800, 1500)
      : clamp(2200 + dist * 0.62, 3800, 7200));
    function finish() { gliding = false; const f = onDone; onDone = null; f?.(); }
    function glide(to, { chained = false, duration, ease, done } = {}) {
      to = clamp(Math.round(to), 0, maxY());
      const from = scrollY, dist = to - from;
      cancelAnimationFrame(glideRaf);
      onDone = done || null;
      if (Math.abs(dist) < 2 || reduced()) { if (Math.abs(dist) >= 2) scrollTo({ top: to, behavior: 'instant' }); finish(); return; }
      gliding = true;
      glideTo = to;
      const span = duration || durationFor(Math.abs(dist));
      const curve = ease || (chained ? easeOut : easeInOut); // a chained glide is already moving: no slow start
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / span);
        scrollTo({ top: from + dist * curve(k), behavior: 'instant' });
        if (k < 1) glideRaf = requestAnimationFrame(step);
        else finish();
      };
      glideRaf = requestAnimationFrame(step);
    }
    function stop() { cancelAnimationFrame(glideRaf); gliding = false; onDone = null; }
    function go(dir) {
      if (dir < 0) peekTopbar();
      if (gliding && Math.sign(glideTo - scrollY) === dir) {
        const y = scrollY;                                   // extend: plan from where this glide was heading
        scrollTo({ top: glideTo, behavior: 'instant' });
        const next = nextTarget(dir);
        scrollTo({ top: y, behavior: 'instant' });
        if (next !== glideTo) glide(next, { chained: true });
        return;
      }
      glide(nextTarget(dir), { chained: gliding });
    }
    const blocked = (target) => paused() || document.querySelector('dialog[open]')
      || (target instanceof Element && target.closest('input, textarea, select, [contenteditable], dialog'));
    const intent = (dir) => {
      const now = performance.now();
      if (now - lastIntent < 300) return;                    // one step per beat, however fast the wheel spins
      lastIntent = now;
      go(dir);
    };

    // Wheel: a fresh push (a pause, or deltas holding or growing) is intent; decaying deltas are inertia.
    let wheelSum = 0, wheelAt = 0, lastDelta = 0;
    addEventListener('wheel', (event) => {
      if (event.ctrlKey || blocked(event.target)) return;
      event.preventDefault();
      const now = performance.now();
      const delta = event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY;
      const fresh = now - wheelAt > 160 || Math.abs(delta) >= Math.abs(lastDelta) || Math.sign(delta) !== Math.sign(lastDelta);
      wheelAt = now;
      lastDelta = delta;
      if (!fresh) return;
      wheelSum = Math.sign(wheelSum) === Math.sign(delta) ? wheelSum + delta : delta;
      if (Math.abs(wheelSum) >= 24) { wheelSum = 0; intent(Math.sign(delta)); }
    }, { passive: false });

    let touchY = null;
    addEventListener('touchstart', (event) => {
      touchY = event.touches.length === 1 && !blocked(event.target) ? event.touches[0].clientY : null;
    }, { passive: true });
    addEventListener('touchmove', (event) => { if (touchY !== null && event.cancelable) event.preventDefault(); }, { passive: false });
    addEventListener('touchend', (event) => {
      if (touchY === null) return;
      const dy = touchY - event.changedTouches[0].clientY;
      touchY = null;
      if (Math.abs(dy) > 36) intent(Math.sign(dy));
    }, { passive: true });

    addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || blocked(event.target)) return;
      const down = ['ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !event.shiftKey);
      const up = ['ArrowUp', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey);
      if (!down && !up && event.key !== 'Home' && event.key !== 'End') return;
      if (event.target instanceof Element && event.target.closest('button, a, summary') && event.key === ' ') return;
      event.preventDefault();
      if (event.key === 'Home') { peekTopbar(); glide(0); }
      else if (event.key === 'End') glide(maxY());
      else intent(down ? 1 : -1);
    });

    /* ---- Topbar ---- */
    const topbar = document.querySelector('.topbar');
    let peekUntil = 0, topbarTimer = 0;
    function peekTopbar() { peekUntil = performance.now() + 2600; updateTopbar(); }
    function updateTopbar() {
      if (!topbar || document.body.classList.contains('site-intro-pending')) return;
      const inHero = scrollY < heroY();
      // A menu, the settings/login dialogs or a page panel (pinTopbar) keep it in place.
      const engaged = topbar.matches(':hover, :focus-within') || topbar.querySelector('details[open]')
        || document.querySelector('dialog[open]') || (opts.pinTopbar && opts.pinTopbar());
      const show = inHero || engaged || performance.now() < peekUntil;
      topbar.classList.toggle('topbar-hidden', !show);
      clearTimeout(topbarTimer);
      if (show && !inHero) topbarTimer = setTimeout(updateTopbar, Math.max(400, peekUntil - performance.now() + 50));
    }
    addEventListener('scroll', updateTopbar, { passive: true });
    addEventListener('teacafe-intro-finished', () => setTimeout(updateTopbar, 900));
    topbar?.addEventListener('mouseleave', () => setTimeout(updateTopbar, 600));
    topbar?.addEventListener('focusout', () => setTimeout(updateTopbar, 600));
    topbar?.addEventListener('focusin', updateTopbar);
    topbar?.addEventListener('toggle', () => setTimeout(updateTopbar, 600), true);      // 更多 menu closed
    document.addEventListener('close', () => setTimeout(updateTopbar, 600), true);     // a dialog closed
    // The pointer reaching the top edge brings a hidden bar back (it cannot be hovered while hidden).
    addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse' && event.clientY < 18 && topbar?.classList.contains('topbar-hidden')) peekTopbar();
    }, { passive: true });

    return { glide, go, stop, peekTopbar, updateTopbar, gliding: () => gliding };
  };
})();
