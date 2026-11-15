/* Home page sections: scroll reveal + live gallery preview.
 * Announcements are rendered by app.js loadNews() into [data-news-list]; nothing here duplicates that. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'reduced';

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
