(() => {
  'use strict';
  const hero = document.querySelector('.home-video-hero');
  const transition = document.querySelector('.home-mask-transition');
  if (!hero || !transition) return;
  const title = hero.querySelector('.home-hero-content h1');
  const roll = hero.querySelector('[data-home-roll]');
  const book = hero.querySelector('[data-home-book]');
  const leaf = hero.querySelector('[data-home-leaf]');
  const ripples = hero.querySelector('[data-home-ripples]');
  const more = hero.querySelector('[data-home-more]');
  const tea = hero.querySelector('[data-home-tea]');
  const stage = transition.querySelector('[data-mask-stage]');
  const svg = transition.querySelector('[data-mask-svg]');
  const maskBase = svg.querySelector('[data-mask-base]');
  const maskCover = svg.querySelector('[data-mask-cover]');
  const maskText = svg.querySelector('[data-mask-text]');
  const background = document.querySelector('[data-scene-backdrop]');
  const edge = stage.querySelector('.home-mask-edge-wash');
  const solid = stage.querySelector('.home-mask-solid');
  const caption = stage.querySelector('.home-mask-caption');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const clamp = value => Math.max(0, Math.min(1, value));
  let state = 'INTRO', generation = 0, leafPlayed = false, frame = 0, autoFrame = 0, autoAbort, disposed = false;
  const setState = next => { state = next; window.teaHomeMotionState = next; };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const animate = async (element, frames, options) => {
    const animation = element.animate(frames, { fill: 'forwards', ...options });
    try { await animation.finished; } catch { /* navigation */ }
    return animation;
  };
  function revealMore() {
    more.classList.add('is-visible');
    more.removeAttribute('aria-hidden');
    more.tabIndex = 0;
    leafPlayed = true;
    setState('MORE_READY');
  }
  function showBook() {
    book.hidden = false;
    requestAnimationFrame(() => book.classList.add('is-visible'));
    book.disabled = false;
  }
  function reelMetrics() {
    const heading = title.getBoundingClientRect(), scene = hero.getBoundingClientRect();
    const width = roll.getBoundingClientRect().width;
    roll.style.height = `${Math.max(heading.height * 1.22, 100)}px`;
    roll.style.top = `${heading.top - scene.top + (heading.height - roll.offsetHeight) / 2}px`;
    return { start: heading.right - scene.left - width * .5, end: heading.left - scene.left - width * .5 };
  }
  async function rollTitle(token) {
    if (disposed || token !== generation) return;
    setState('SCROLL_ROLLING');
    const { start, end } = reelMetrics();
    roll.style.left = `${start}px`;
    roll.classList.add('is-rolling');
    const textAnimation = title.animate([
      { clipPath: 'inset(0 0% 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }
    ], { duration: 1750, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
    const reelAnimation = roll.animate([
      { transform: 'translateX(0) rotateY(0deg)' },
      { transform: `translateX(${end - start}px) rotateY(-540deg)` }
    ], { duration: 1750, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
    try { await Promise.all([textAnimation.finished, reelAnimation.finished]); } catch { return; }
    if (disposed || token !== generation) return;
    title.style.clipPath = 'inset(0 100% 0 0)';
    textAnimation.cancel();
    const bookRect = book.getBoundingClientRect(), scene = hero.getBoundingClientRect();
    const targetX = bookRect.left - scene.left - end + bookRect.width / 2 - roll.offsetWidth / 2;
    const targetY = bookRect.top - scene.top - parseFloat(roll.style.top) + bookRect.height / 2 - roll.offsetHeight / 2;
    const morph = await animate(roll, [
      { transform: `translateX(${end - start}px) rotateY(-540deg) scale(1)`, opacity: 1 },
      { transform: `translate(${end - start + targetX}px,${targetY}px) rotateY(-720deg) scale(.35,.55)`, opacity: 0 }
    ], { duration: 650, easing: 'cubic-bezier(.25,.75,.3,1)' });
    reelAnimation.cancel();
    morph.cancel();
    roll.classList.remove('is-rolling');
    showBook();
    setState('BOOK_VISIBLE');
    if (!leafPlayed) await dropLeaf(token);
    else setState('MORE_READY');
  }
  async function dropLeaf(token) {
    if (disposed || token !== generation) return;
    setState('LEAF_FALLING');
    const scene = hero.getBoundingClientRect(), target = more.getBoundingClientRect();
    const startX = scene.width * .76, startY = -leaf.offsetHeight;
    const endX = target.left - scene.left + target.width / 2 - leaf.offsetWidth / 2;
    const endY = target.top - scene.top + target.height / 2 - leaf.offsetHeight / 2;
    const started = performance.now();
    await new Promise(resolve => {
      function tick(now) {
        if (disposed || token !== generation) { resolve(); return; }
        const t = clamp((now - started) / 2200);
        const s = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const x = startX + (endX - startX) * s + Math.sin(t * Math.PI * 3) * (1 - t) * 30;
        const y = startY + (endY - startY) * s - Math.sin(Math.PI * t) * 38;
        leaf.style.opacity = String(Math.min(1, t * 9));
        leaf.style.transform = `translate3d(${x}px,${y}px,0) rotate(${24 + t * 155 + Math.sin(t * 17) * 12}deg)`;
        if (t < 1) requestAnimationFrame(tick); else resolve();
      }
      requestAnimationFrame(tick);
    });
    if (disposed || token !== generation) return;
    leaf.style.opacity = '0';
    setState('RIPPLE');
    ripples.classList.add('is-active');
    await delay(520);
    if (disposed || token !== generation) return;
    revealMore();
  }
  async function startCycle() {
    const token = ++generation;
    setState('TITLE_VISIBLE');
    tea.classList.add('is-visible', 'is-steaming');
    await delay(3000);
    if (token === generation) await rollTitle(token);
  }
  async function replay() {
    if (state !== 'BOOK_VISIBLE' && state !== 'MORE_READY') return;
    const token = ++generation;
    book.disabled = true;
    book.classList.remove('is-visible');
    setState('TITLE_EXPANDING');
    const animation = await animate(title, [
      { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }
    ], { duration: 1150, easing: 'cubic-bezier(.2,.75,.25,1)' });
    if (token !== generation || disposed) return;
    title.style.clipPath = 'inset(0 0 0 0)';
    animation.cancel();
    await startCycle();
  }
  book.addEventListener('click', () => { if (reduced()) { title.style.clipPath = 'none'; return; } replay(); });
  function finalHero() {
    tea.classList.add('is-visible', 'is-steaming');
    if (reduced()) title.style.clipPath = 'none';
    else { title.style.clipPath = 'inset(0 100% 0 0)'; showBook(); }
    revealMore();
  }
  async function begin(event) {
    if (state !== 'INTRO') return;
    if (reduced() || event?.detail?.played === false) { finalHero(); return; }
    const entrance = title.getAnimations().find(animation => animation.playState === 'running');
    if (entrance) try { await entrance.finished; } catch { /* navigation */ }
    title.classList.add('home-title-entered');
    if (!disposed) startCycle();
  }
  addEventListener('teacafe-intro-finished', begin, { once: true });
  if (window.teaIntroResult) begin({ detail: window.teaIntroResult });

  function sizeMask() {
    const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const element of [maskBase, maskCover]) { element.setAttribute('width', width); element.setAttribute('height', height); }
    maskText.setAttribute('x', width / 2);
    maskText.setAttribute('y', height / 2);
    maskText.setAttribute('font-size', Math.min(height * .35, width / 7.8));
    updateMask();
  }
  function updateMask() {
    frame = 0;
    const travel = Math.max(1, transition.offsetHeight - innerHeight);
    const p = clamp((scrollY - transition.offsetTop) / travel);
    if (reduced()) {
      edge.style.opacity = '1'; svg.style.opacity = '1'; solid.style.opacity = '0';
      caption.style.opacity = '1'; return;
    }
    edge.style.opacity = String(clamp(p * 5));
    svg.style.opacity = String(clamp((p - .03) * 5));
    const scale = 1 + p * .47;
    maskText.setAttribute('transform', `translate(${(-p * stage.clientWidth * .06).toFixed(1)} ${(-p * stage.clientHeight * .035).toFixed(1)}) translate(${stage.clientWidth / 2} ${stage.clientHeight / 2}) scale(${scale.toFixed(3)}) translate(${-stage.clientWidth / 2} ${-stage.clientHeight / 2})`);
    solid.style.opacity = String(clamp((p - .78) / .22));
    caption.style.opacity = String(clamp((p - .38) * 3) * (1 - clamp((p - .78) * 5)));
    caption.style.transform = `translate(-50%,${(1 - clamp((p - .38) * 3)) * 10}px)`;
    background.style.setProperty('--scene-shift', `${(p * -12).toFixed(1)}px`);
    background.style.setProperty('--scene-scale', (1 + p * .035).toFixed(3));
  }
  const queueMask = () => { if (!frame) frame = requestAnimationFrame(updateMask); };
  addEventListener('scroll', queueMask, { passive: true });
  addEventListener('resize', sizeMask, { passive: true });
  sizeMask();

  function cancelAutoScroll() {
    if (!autoFrame) return;
    cancelAnimationFrame(autoFrame);
    autoFrame = 0;
    autoAbort?.abort();
    autoAbort = null;
  }
  more.addEventListener('click', event => {
    event.preventDefault();
    if (!more.classList.contains('is-visible')) return;
    cancelAutoScroll();
    const travel = Math.max(1, transition.offsetHeight - innerHeight);
    const target = transition.offsetTop + travel * .55;
    if (reduced()) { scrollTo({ top: target, behavior: 'instant' }); return; }
    const start = scrollY, started = performance.now();
    autoAbort = new AbortController();
    const options = { once: true, passive: true, signal: autoAbort.signal };
    for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(name, cancelAutoScroll, options);
    function tick(now) {
      const t = clamp((now - started) / 1500);
      scrollTo({ top: start + (target - start) * (t * t * (3 - 2 * t)), behavior: 'instant' });
      if (t < 1) autoFrame = requestAnimationFrame(tick);
      else { autoFrame = 0; autoAbort?.abort(); autoAbort = null; }
    }
    autoFrame = requestAnimationFrame(tick);
  });
  addEventListener('pagehide', () => { disposed = true; generation++; cancelAutoScroll(); cancelAnimationFrame(frame); }, { once: true });
})();
