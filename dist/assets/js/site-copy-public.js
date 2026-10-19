(() => {
  'use strict';
  const page = document.body.classList.contains('wiki-page') ? 'wiki' : document.body.classList.contains('rules-page') ? 'rules' : null;
  if (!page || !window.TeaCafeCopy) return;
  const blocks = new Map(window.TeaCafeCopy.collect(document, page).map(block => [block.key, block]));
  fetch(`/api/site-copy?page=${page}`, { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
    if (!Array.isArray(data?.items)) return;
    for (const item of data.items) {
      const block = blocks.get(item.block_key);
      if (!block || typeof item.value !== 'string') continue;
      window.TeaCafeCopy.renderText(block.element, item.value);
      block.element.dataset.copyEdited = '';
    }
  }).catch(() => {});
  async function loadSections() {
    try {
      const response = await fetch(`/api/site-sections?page=${page}`, { cache: 'no-store' });
      const data = response.ok ? await response.json() : null;
      if (!Array.isArray(data?.items)) return;
      document.querySelectorAll('[data-site-section]').forEach(section => section.remove());
      for (const item of data.items) {
        const target = document.getElementById(item.anchor);
        const parent = page === 'wiki' ? target?.closest('.chapter-screen') : target?.closest('.rule-section');
        if (!parent || !item.id || !item.title || !item.body) continue;
        const section = document.createElement('article');
        section.className = 'site-custom-section';
        section.dataset.siteSection = item.id;
        section.dataset.keywords = `${item.title} ${item.body}`.toLowerCase();
        section.id = `section-${item.id}`;
        const title = document.createElement('h3');
        title.textContent = item.title;
        const body = document.createElement('p');
        window.TeaCafeCopy.renderText(body, item.body);
        section.append(title, body);
        parent.append(section);
      }
    } catch {}
  }
  loadSections();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadSections();
  });
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('teacafe-site-copy');
    channel.addEventListener('message', event => { if (event.data?.page === page) loadSections(); });
  }
})();
