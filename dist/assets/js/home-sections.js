/* Home page sections: scroll reveal, featured wall, seal pass.
 * Announcements are rendered by app.js loadNews() into [data-news-list]; nothing here duplicates that. */
(() => {
  'use strict';
  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';
  const MEDIA_PREFIX = '/api/community/media/';

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

  /* ---- Seal pass: copying the address "rubs" a seal (app.js does the copy + toast) ---- */
  for (const pass of document.querySelectorAll('[data-stamp]')) {
    const label = pass.querySelector('[data-stamp-label]');
    const idle = label ? label.textContent : '';
    let timer = 0;
    pass.addEventListener('click', () => {
      pass.classList.remove('is-stamped');
      void pass.offsetWidth; // restart the stamp animation on repeat clicks
      pass.classList.add('is-stamped');
      if (label) label.textContent = '已拓印・到「多人遊戲」貼上';
      clearTimeout(timer);
      timer = setTimeout(() => { pass.classList.remove('is-stamped'); if (label) label.textContent = idle; }, 2600);
    });
  }

  /* ---- Player scroll (卷一): unrolls sideways once the status is in and the scene is on screen;
     rolls back up when the scene leaves, so it unrolls again on every return ---- */
  const playerScroll = document.querySelector('[data-player-scroll]');
  if (playerScroll) {
    let onScreen = false;
    const sync = () => playerScroll.classList.toggle('is-open', onScreen && playerScroll.dataset.state !== 'loading');
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }, { threshold: 0.6 }).observe(playerScroll);
    } else onScreen = true;
    addEventListener('teacafe-players', sync);
    sync();
  }
})();
