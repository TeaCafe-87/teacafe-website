/* TeaCafe home: scroll-scrubbed journey into the ink landscape.
 * The fixed background video's playback position follows scroll progress
 * through the .journey block: scrolling down advances into the painting,
 * scrolling up reverses the camera, stopping holds the frame.  The video
 * is never "played" — only seeked — so no autoplay policy applies.
 * Reduced motion, missing video or load errors fall back to the static
 * poster painting; content stays fully readable either way. */
(() => {
  'use strict';
  const journey = document.querySelector('[data-journey]');
  const video = journey && journey.querySelector('[data-journey-video]');
  if (!journey || !video) return;

  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  let duration = 0;          // seconds of film
  let target = 0;            // where scroll wants the film to be
  let current = 0;           // where we have asked the decoder to be
  let raf = 0;
  let live = false;          // metadata ready and scrubbing active
  let lastSeekAt = 0;

  const still = () => {
    journey.classList.remove('journey-live');
    journey.classList.add('journey-still');
    live = false;
  };

  const progress = () => {
    const rect = journey.getBoundingClientRect();
    const span = rect.height - innerHeight;
    return span > 60 ? clamp(-rect.top / span, 0, 1) : 0;
  };

  // Chase the target time with a light ease so fast flicks stay fluid, and
  // never queue a new seek while the decoder is still working on one.
  function frame(now) {
    raf = 0;
    if (!live) return;
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
  const wake = () => { if (!raf && live) raf = requestAnimationFrame(frame); };

  function onScroll() {
    // past the journey: the archive covers the viewport, stop compositing
    const rect = journey.getBoundingClientRect();
    journey.classList.toggle('journey-done', rect.bottom < -8);
    if (!live) return;
    target = progress() * duration;
    wake();
  }

  function start() {
    if (reduced()) { still(); return; }
    duration = Math.max((video.duration || 0) - 0.05, 0);
    if (!duration) { still(); return; }
    video.pause();
    live = true;
    journey.classList.remove('journey-still');
    journey.classList.add('journey-live');
    target = progress() * duration;
    current = clamp(video.currentTime, 0, duration);
    wake();
  }

  video.addEventListener('loadedmetadata', start);
  video.addEventListener('error', still);
  if (video.readyState >= 1) start();

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { onScroll(); } });

  const syncMotion = () => { if (reduced()) still(); else if (!live && video.readyState >= 1) start(); };
  motionQuery.addEventListener ? motionQuery.addEventListener('change', syncMotion) : motionQuery.addListener(syncMotion);
  new MutationObserver(syncMotion).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  onScroll();
})();
