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
})();
