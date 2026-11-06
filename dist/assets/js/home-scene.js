(() => {
  'use strict';
  const video = document.querySelector('[data-scene-video]');
  const main = document.querySelector('.home-page-main');
  if (!video || !main) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = matchMedia('(max-aspect-ratio: 3/4)');
  const connection = navigator.connection;
  const panels = [...main.querySelectorAll('section[id]')].map(section => ({
    section,
    stage: section.querySelector('.scene-panel'),
    content: section.querySelector('.home-hero-content, .server-overview-inner, .screen-inner')
  })).filter(panel => panel.content);
  let frame = 0;
  let lastTick = 0;
  let smoothedTime = null;
  let activeSource = '';
  let failed = false;
  const clamp = value => Math.min(1, Math.max(0, value));
  const ease = value => { const t = clamp(value); return t*t*(3-2*t); };
  const reduceMotion = () => reduced.matches || root.dataset.motion === 'reduced';
  const staticScene = () => reduceMotion() || connection?.saveData;
  function queue() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  }

  function update(timestamp) {
    frame = 0;
    const dt = Math.min(64, timestamp - (lastTick || timestamp - 16));
    lastTick = timestamp;
    const height = innerHeight;
    // Recalculate after responsive layout, late fonts, player updates and restoration.
    const distance = Math.max(1, root.scrollHeight - height);
    const progress = clamp(scrollY / distance);
    for (const { section, stage, content } of panels) {
      const panelHeight = stage?.offsetHeight || height;
      // Tall phone layouts scroll through their full contents before pinning.
      section.style.setProperty('--scene-panel-height', `${panelHeight}px`);
      section.style.setProperty('--scene-pin-top', `${Math.min(0, height-panelHeight)}px`);
      const rect = section.getBoundingClientRect();
      const hero = section.id === 'home';
      const enter = hero ? 1 : ease((height - rect.top) / (height * .6));
      const leave = ease((rect.bottom-panelHeight+height*.2)/(height*.45));
      content.style.setProperty('--scene-opacity', reduceMotion() ? 1 : enter * leave);
      content.style.setProperty('--scene-y', `${reduceMotion() ? 0 : (1-enter)*52-(1-leave)*28}px`);
      content.style.setProperty('--scene-blur', `${reduceMotion() ? 0 : (1-enter*leave)*5}px`);
      content.style.setProperty('--scene-scale', reduceMotion() ? 1 : 1-(1-leave)*.025);
    }
    if (staticScene() || failed || !Number.isFinite(video.duration) || video.readyState < 2) return;
    const target = progress * Math.max(0, video.duration - 1/30);
    smoothedTime = smoothedTime === null ? target : smoothedTime + (target-smoothedTime)*(1-Math.exp(-dt/70));
    if (Math.abs(target-smoothedTime) < 1/120) smoothedTime = target;
    // Never stack seeks: decode the current request, then use the newest scroll position.
    if (!video.seeking && Math.abs(video.currentTime-smoothedTime) > 1/60) {
      try { video.currentTime = smoothedTime; } catch { /* Metadata may change on rotation. */ }
    }
    if (Math.abs(target-smoothedTime) > 1/120) queue();
  }

  function selectSource() {
    video.pause();
    if (staticScene()) {
      video.classList.remove('is-ready');
      if (video.hasAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
      activeSource = '';
      smoothedTime = null;
      queue();
      return;
    }
    const next = portrait.matches ? video.dataset.srcMobile : video.dataset.srcDesktop;
    if (next && next !== activeSource) {
      activeSource = next;
      failed = false;
      smoothedTime = null;
      video.classList.remove('is-ready');
      video.src = next;
      video.load();
    }
    queue();
  }

  main.dataset.sceneStory = '';
  for (const { content } of panels) content.dataset.sceneReveal = '';
  video.addEventListener('loadeddata', () => {
    if (!staticScene()) video.classList.add('is-ready');
    queue();
  });
  video.addEventListener('loadedmetadata', queue);
  video.addEventListener('seeked', queue);
  video.addEventListener('error', () => {
    failed = true;
    video.classList.remove('is-ready');
  });
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  addEventListener('pageshow', queue);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTick = 0;
    } else queue();
  });
  // A gesture unlocks the first frame if a mobile browser deferred decoding.
  const prime = () => {
    if (!staticScene() && !failed && activeSource && video.readyState < 2) {
      const attempt = video.play();
      attempt?.then(() => { video.pause(); queue(); }).catch(() => {});
    }
  };
  addEventListener('pointerdown', prime, { passive: true, once: true });
  addEventListener('keydown', prime, { once: true });
  reduced.addEventListener('change', selectSource);
  portrait.addEventListener('change', selectSource);
  connection?.addEventListener('change', selectSource);
  new MutationObserver(selectSource).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  if ('ResizeObserver' in window) new ResizeObserver(queue).observe(document.body);
  document.fonts?.ready.then(queue);
  selectSource();
})();
