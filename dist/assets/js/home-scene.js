(() => {
  'use strict';
  const video = document.querySelector('[data-scene-video]');
  const line = document.querySelector('[data-home-line]');
  if (!video || !line) return;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const paths = [...line.querySelectorAll('path')].map(path => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);
    return { path, length };
  });
  const revealTargets = [...document.querySelectorAll('.server-overview-inner, .home-links-screen .screen-inner, .home-news-screen .screen-inner')];
  if (!reduced() && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('is-visible', entry.isIntersecting);
    }, { threshold: .1 });
    for (const target of revealTargets) { target.dataset.sceneReveal = ''; observer.observe(target); }
  }
  let frame = 0;
  let ready = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  function update() {
    frame = 0;
    if (reduced()) {
      for (const { path } of paths) path.style.strokeDashoffset = '0';
      video.classList.remove('is-ready');
      return;
    }
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const progress = clamp(scrollY / maxScroll);
    const lineProgress = clamp(scrollY / Math.max(1, innerHeight * 1.4));
    for (const { path, length } of paths) path.style.strokeDashoffset = String(length * (1 - lineProgress));
    if (ready && Number.isFinite(video.duration) && video.duration > 0) {
      const target = progress * Math.max(0, video.duration - .04);
      if (Math.abs(video.currentTime - target) > .035) {
        try { video.currentTime = target; } catch { /* Video metadata may still be loading on iOS. */ }
      }
    }
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  video.addEventListener('loadedmetadata', () => {
    ready = true;
    queue();
  }, { once: true });
  video.addEventListener('loadeddata', () => { if (!reduced()) video.classList.add('is-ready'); }, { once: true });
  video.addEventListener('error', () => { ready = false; video.classList.remove('is-ready'); });
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  addEventListener('teacafe-motion-change', queue);
  queue();
})();
