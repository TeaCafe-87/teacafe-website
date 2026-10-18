(() => {
  'use strict';
  const selectors = {
    wiki: '.page-title-inner > h1, .page-title-inner > p, .content-panel h2, .content-panel h3, .content-panel p, .content-panel summary, .content-panel .wiki-card b, .content-panel .wiki-card small, .content-panel .tip',
    rules: '.page-title-inner > h1, .page-title-inner > p, .rule-section h2, .rule-section h3, .rule-section p, .rule-list b, .rule-list span, .avoid-grid li, .rule-alert b, .rule-alert span'
  };
  const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();
  function hash(value) {
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619) >>> 0;
    return result.toString(36);
  }
  function collect(doc, page) {
    if (!selectors[page]) return [];
    const repeats = new Map();
    let section = '頁首';
    return [...doc.querySelectorAll(selectors[page])].filter(element => {
      return !element.closest('.wiki-live-entry,[data-wiki-updates]') && normalized(element.textContent);
    }).map(element => {
      const base = normalized(element.textContent);
      if (element.tagName === 'H2') section = base;
      const signature = hash(`${element.tagName}:${base}`);
      const occurrence = (repeats.get(signature) || 0) + 1;
      repeats.set(signature, occurrence);
      return { key: `${page}:${signature}:${occurrence}`, page, element, base, section,
        label: base.length > 52 ? `${base.slice(0, 52)}…` : base,
        kind: /^H[1-6]$/.test(element.tagName) ? '標題' : element.tagName === 'SUMMARY' ? '問答' : '內文' };
    });
  }
  function renderText(element, value) {
    const text = String(value ?? '');
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)|`([^`]+)`/g;
    const children = [];
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) children.push(document.createTextNode(text.slice(cursor, match.index)));
      if (match[3]) {
        const code = document.createElement('code'); code.textContent = match[3]; children.push(code);
      } else {
        const link = document.createElement('a'); link.textContent = match[1]; link.href = match[2];
        if (/^https?:\/\//.test(match[2])) link.rel = 'noopener noreferrer';
        children.push(link);
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) children.push(document.createTextNode(text.slice(cursor)));
    element.replaceChildren(...children);
  }
  window.TeaCafeCopy = { collect, renderText };
})();
