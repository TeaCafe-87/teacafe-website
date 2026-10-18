(() => {
  'use strict';
  const hero = document.querySelector('.home-video-hero');
  const title = hero?.querySelector('.home-hero-content h1');
  const canvas = hero?.querySelector('[data-home-particles]');
  const plane = hero?.querySelector('[data-home-plane]');
  const more = hero?.querySelector('[data-home-more]');
  const tea = hero?.querySelector('[data-home-tea]');
  if (!hero || !title || !canvas || !plane || !more || !tea) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  if (reduced) { tea.classList.add('is-visible', 'is-steaming', 'is-written'); more.classList.add('is-visible'); return; }
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { more.classList.add('is-visible'); return; }
  let started = false;
  let points = [];
  let frame = 0;
  let flying = false;
  let flightStart = 0;
  let lastTrail = 0;
  let stageTime = 0;
  let metrics;
  const ease = value => 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);
  const wait = (ms, callback) => setTimeout(callback, ms);
  function sizeCanvas() {
    const rect = hero.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    metrics = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
  }
  function sampleTitle() {
    sizeCanvas();
    const rect = title.getBoundingClientRect();
    const style = getComputedStyle(title);
    const fontSize = Number.parseFloat(style.fontSize);
    const sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.ceil(rect.width));
    sample.height = Math.max(1, Math.ceil(rect.height));
    const pen = sample.getContext('2d', { willReadFrequently: true });
    pen.fillStyle = '#fff';
    pen.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    pen.textBaseline = 'top';
    pen.fillText(title.textContent.trim(), 0, Math.max(0, (sample.height - fontSize) / 2));
    const pixels = pen.getImageData(0, 0, sample.width, sample.height).data;
    const candidates = [];
    for (let y = 0; y < sample.height; y += 6) {
      for (let x = 0; x < sample.width; x += 6) {
        if (pixels[(y * sample.width + x) * 4 + 3] > 90) candidates.push([x, y]);
      }
    }
    const stride = Math.max(1, Math.ceil(candidates.length / 320));
    points = candidates.filter((_, index) => index % stride === 0).map(([x, y], index) => ({
      x: rect.left - metrics.left + x,
      y: rect.top - metrics.top + y,
      delay: x / sample.width * .65,
      size: 1 + index % 3 * .48,
      drift: ((index * 37) % 100) / 100 - .5
    }));
  }
  function paint(time) {
    ctx.clearRect(0, 0, metrics.width, metrics.height);
    const elapsed = (time - stageTime) / 1000;
    const gatherX = metrics.width * .29;
    const gatherY = metrics.height * .29;
    for (const particle of points) {
      if (particle.trail) continue;
      const progress = ease((elapsed - particle.delay) / 1.05);
      if (progress <= 0 || progress >= 1) continue;
      const x = particle.x + (gatherX - particle.x) * progress + particle.drift * 32 * Math.sin(progress * Math.PI);
      const y = particle.y + (gatherY - particle.y) * progress + particle.drift * 16 * Math.sin(progress * Math.PI);
      ctx.fillStyle = `rgba(250,233,196,${Math.min(1, progress * 5) * (1 - progress) * .8})`;
      ctx.fillRect(x, y, particle.size, particle.size);
    }
    if (flying) {
      const fraction = ease((time - flightStart) / 2100);
      const startX = gatherX;
      const startY = gatherY;
      const endX = metrics.width / 2;
      const endY = metrics.height / 2;
      const arcX = metrics.width * .71;
      const arcY = metrics.height * .07;
      const x = (1-fraction)*(1-fraction)*startX + 2*(1-fraction)*fraction*arcX + fraction*fraction*endX;
      const y = (1-fraction)*(1-fraction)*startY + 2*(1-fraction)*fraction*arcY + fraction*fraction*endY;
      plane.style.transform = `translate3d(${x - plane.offsetWidth / 2}px,${y - plane.offsetHeight / 2}px,0) rotate(${-20 + fraction * 35}deg)`;
      if (time - lastTrail > 38 && fraction < .9) {
        points.push({ trail: true, x, y, born: time, size: 1 + Math.random() * 1.4, drift: Math.random() - .5 });
        lastTrail = time;
      }
      if (fraction >= 1) {
        flying = false;
        plane.style.setProperty('--plane-end-x', `${x - plane.offsetWidth / 2}px`);
        plane.style.setProperty('--plane-end-y', `${y - plane.offsetHeight / 2}px`);
        plane.classList.add('plane-folding');
        wait(250, () => more.classList.add('is-visible'));
      }
    }
    for (const particle of points) {
      if (!particle.trail) continue;
      const age = (time - particle.born) / 720;
      if (age >= 1) continue;
      ctx.fillStyle = `rgba(249,232,196,${.55 * (1-age)})`;
      ctx.fillRect(particle.x + particle.drift * age * 35, particle.y + age * 18, particle.size, particle.size);
    }
    points = points.filter(point => !point.trail || time - point.born < 720);
    if (elapsed < 2.2 || flying || points.some(point => point.trail)) frame = requestAnimationFrame(paint);
    else ctx.clearRect(0, 0, metrics.width, metrics.height);
  }
  function begin() {
    if (started) return;
    started = true;
    wait(450, () => tea.classList.add('is-visible'));
    wait(1150, () => tea.classList.add('is-steaming'));
    wait(2150, () => tea.classList.add('is-written'));
    // The entrance remains legible before its particles begin to gather.
    wait(2950, () => {
      if (document.hidden) { more.classList.add('is-visible'); return; }
      sampleTitle();
      stageTime = performance.now();
      title.classList.add('home-title-dissolving');
      frame = requestAnimationFrame(paint);
      wait(1550, () => {
        plane.classList.add('plane-visible');
        flying = true;
        flightStart = performance.now();
        if (!frame) frame = requestAnimationFrame(paint);
      });
    });
  }
  addEventListener('teacafe-intro-finished', begin, { once: true });
  if (!document.querySelector('.site-intro') && document.body.classList.contains('site-nav-reveal')) begin();
  addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
})();
