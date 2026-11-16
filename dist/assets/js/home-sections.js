/* Home page sections: hero handoff + background parallax, scroll reveal, live gallery preview.
 * Announcements are rendered by app.js loadNews() into [data-news-list]; nothing here duplicates that. */
(() => {
  'use strict';
  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';

  /* ---- Hero handoff + parallax wash, both tied to scroll position so they reverse exactly ----
   * The hero pins while the status section scrolls over it. The hero is clipped at that section's top
   * edge, where the oversized title rides; once pinned, the title shrinks into its heading slot, then
   * the figures enter. Native scrolling is untouched: sticky positioning plus one passive listener. */
  const scene = document.querySelector('[data-handoff]');
  const hero = scene && scene.querySelector('[data-ink-hero]');
  const strip = scene && scene.querySelector('#server-info');
  const stage = strip && strip.querySelector('.handoff-stage');
  const title = scene && scene.querySelector('[data-handoff-title]');
  const rest = scene && scene.querySelector('[data-handoff-rest]');
  const wash = document.querySelector('[data-home-wash]');
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let fit = null, ticking = false, motionOn = false;

  function measure() {
    fit = null;
    if (!motionOn || !hero || !stage || !title || !rest) return;
    const vh = innerHeight;
    // A hero taller than the screen cannot pin without hiding its lower part; fall back to plain flow.
    scene.classList.toggle('handoff-on', hero.offsetHeight <= vh + 1);
    if (!scene.classList.contains('handoff-on')) { title.style.transform = rest.style.cssText = hero.style.clipPath = hero.style.visibility = ''; return; }
    const w = title.offsetWidth, h = title.offsetHeight, vw = stage.clientWidth;
    const scale = Math.max(1, Math.min((vw * 0.96) / w, (vh * 0.42) / h));
    fit = {
      scale,
      x: (vw - w * scale) / 2 - title.offsetLeft, // centred across the full width…
      y: Math.max(8, vh * 0.02) - title.offsetTop, // …riding the section's top edge
    };
  }

  function update() {
    ticking = false;
    if (wash && motionOn) wash.style.setProperty('--wash', (scrollY * 0.5).toFixed(1));
    if (!fit) return;
    const top = strip.getBoundingClientRect().top;
    const heroBox = hero.getBoundingClientRect();
    const cut = Math.max(0, Math.min(heroBox.bottom - top, heroBox.height));
    hero.style.clipPath = cut > 0 ? `inset(0 0 ${cut.toFixed(1)}px 0)` : '';
    hero.style.visibility = cut >= heroBox.height ? 'hidden' : '';
    const pinned = clamp01(-top / Math.max(1, strip.offsetHeight - stage.offsetHeight));
    const t = ease(clamp01(pinned / 0.6));
    const s = fit.scale + (1 - fit.scale) * t;
    title.style.transform = `translate3d(${(fit.x * (1 - t)).toFixed(1)}px, ${(fit.y * (1 - t)).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    const r = clamp01((pinned - 0.55) / 0.35);
    rest.style.opacity = r.toFixed(3);
    rest.style.transform = r < 1 ? `translate3d(0, ${((1 - r) * 48).toFixed(1)}px, 0)` : '';
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  function syncMotion() {
    motionOn = !reduced();
    if (!motionOn) {
      scene && scene.classList.remove('handoff-on');
      if (title) title.style.transform = '';
      if (rest) rest.style.cssText = '';
      if (hero) hero.style.clipPath = hero.style.visibility = '';
      if (wash) wash.style.removeProperty('--wash');
    }
    measure();
    update();
  }
  if (scene || wash) {
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', () => { measure(); request(); }, { passive: true });
    motionQuery.addEventListener ? motionQuery.addEventListener('change', syncMotion) : motionQuery.addListener(syncMotion);
    new MutationObserver(syncMotion).observe(root, { attributes: true, attributeFilter: ['data-motion', 'data-text-size', 'data-font-style'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); request(); });
    syncMotion();
  }

  /* ---- Reveal on scroll ---- */
  const targets = [...document.querySelectorAll('[data-reveal]')];
  if (targets.length) {
    if (reduced() || typeof IntersectionObserver !== 'function') {
      document.body.classList.add('reveal-off');
    } else {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
      // Stagger siblings slightly so a grid flows in rather than snapping as one block.
      const seen = new Map();
      for (const el of targets) {
        const parent = el.parentElement;
        const index = seen.get(parent) || 0;
        seen.set(parent, index + 1);
        if (index) el.style.transitionDelay = `${Math.min(index, 5) * 70}ms`;
        observer.observe(el);
      }
      // A reduced-motion switch mid-visit should stop hiding anything.
      new MutationObserver(() => { if (reduced()) document.body.classList.add('reveal-off'); })
        .observe(root, { attributes: true, attributeFilter: ['data-motion'] });
    }
  }

  /* ---- Featured wall: admin-picked photos in a tilted 3-column waterfall ---- */
  (async () => {
    const section = document.querySelector('[data-featured-section]');
    const wall = document.querySelector('[data-featured-wall]');
    if (!section || !wall) return;
    let data = null;
    try {
      const response = await fetch('/api/featured', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      data = await response.json();
    } catch { return; }
    if (!data?.configured || data.enabled === false) return;
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter((item) => typeof item?.url === 'string' && item.url.startsWith(MEDIA_PREFIX));
    if (!items.length) return;

    const tileFor = (item, index) => {
      const link = document.createElement('a');
      link.className = 'feat-item';
      link.href = `/gallery.html?post=${encodeURIComponent(item.post_id)}`;
      link.style.setProperty('--feat-ratio', ['4 / 3', '1 / 1', '4 / 5'][index % 3]);
      link.tabIndex = -1;
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = item.label || '精選照片';
      image.loading = 'lazy';
      image.decoding = 'async';
      link.append(image);
      if (item.label) {
        const caption = document.createElement('figcaption');
        caption.textContent = item.label;
        link.append(caption);
      }
      return link;
    };

    const columns = [[], [], []];
    items.forEach((item, index) => columns[index % 3].push(item));
    const still = reduced() || items.length < 6;
    wall.classList.toggle('feat-static', still);
    // Differential speeds and a reversed middle column give the wall its parallax read.
    const durations = [26, 19, 30];
    wall.replaceChildren(...columns.map((columnItems, columnIndex) => {
      const column = document.createElement('div');
      column.className = 'feat-col' + (columnIndex === 1 && !still ? ' rev' : '');
      column.style.setProperty('--feat-dur', `${durations[columnIndex] + columnItems.length}s`);
      columnItems.forEach((item, index) => column.append(tileFor(item, columnIndex + index)));
      if (!still) {
        // Second, aria-hidden copy of the column makes the -50% translate loop seamless.
        const copy = document.createElement('div');
        copy.className = 'feat-copy';
        copy.setAttribute('aria-hidden', 'true');
        columnItems.forEach((item, index) => copy.append(tileFor(item, columnIndex + index)));
        column.append(copy);
      }
      return column;
    }));
    section.hidden = false;
  })();

  /* ---- Gallery preview (live, from the same API the gallery page uses) ---- */
  const host = document.querySelector('[data-home-gallery]');
  if (!host) return;
  const MEDIA_PREFIX = '/api/community/media/';
  const LIMIT = 6;

  const note = (text) => {
    const p = document.createElement('p');
    p.className = 'state-note';
    p.textContent = text;
    host.replaceChildren(p);
    host.setAttribute('aria-busy', 'false');
  };

  const firstImage = (post) => (Array.isArray(post.media) ? post.media : [])
    .find((m) => typeof m?.url === 'string' && m.url.startsWith(MEDIA_PREFIX) && String(m.type || '').startsWith('image/'));

  const tile = (post, media) => {
    const link = document.createElement('a');
    link.className = 'gal-tile';
    link.href = `/gallery.html?post=${encodeURIComponent(post.id)}`;
    const image = document.createElement('img');
    image.src = media.url;
    image.alt = post.title ? `相冊貼文：${post.title}` : '玩家相冊貼文';
    image.loading = 'lazy';
    image.decoding = 'async';
    const meta = document.createElement('span');
    meta.className = 'gal-meta';
    const title = document.createElement('b');
    title.textContent = post.title || '未命名貼文';
    const author = document.createElement('i');
    author.textContent = post.author_name || post.author_username || '居民';
    meta.append(title, author);
    link.append(image, meta);
    return link;
  };

  fetch('/api/community/posts?kind=gallery', { headers: { Accept: 'application/json' } })
    .then((response) => { if (!response.ok) throw new Error('gallery'); return response.json(); })
    .then((data) => {
      if (data && data.configured === false) {
        note('相冊尚未完成設定，暫時沒有內容可以顯示。');
        return;
      }
      const tiles = [];
      for (const post of Array.isArray(data?.posts) ? data.posts : []) {
        const media = firstImage(post);
        if (media) tiles.push(tile(post, media));
        if (tiles.length >= LIMIT) break;
      }
      if (!tiles.length) {
        note('還沒有相冊貼文。到相冊頁貼上你的第一張建築照吧。');
        return;
      }
      host.replaceChildren(...tiles);
      host.setAttribute('aria-busy', 'false');
    })
    .catch(() => note('暫時無法讀取相冊，請稍後重新整理。'));
})();
