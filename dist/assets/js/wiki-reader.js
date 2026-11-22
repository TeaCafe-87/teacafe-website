/* Wiki reader (藏書閣): search, chapters and entries, available from the first second.
 *
 * No second copy of the Wiki: the reader IS the page's own .content-layout (sidebar + content
 * panel), which no-JS visitors and search engines read inline. With JS it becomes an overlay
 * over the scenes; the scroll position underneath is untouched, so closing it returns to the
 * same frame. Search reads the live DOM at query time, so admin copy overrides
 * (site-copy-public.js) and live entries (/api/wiki, app.js) are always included, and the page's
 * own #wiki-search input is reused (app.js keeps filtering its live entries).
 *
 *   [data-wiki-open="catalog|search"]   open the reader (dock, cave entrance)
 *   <a href="#chapter-or-entry-id">    any in-page link to Wiki content opens it there
 *   /  or  Ctrl/⌘ K                     search;  Esc clears, then closes
 * URLs: #<chapter id> or #<entry id> open the reader directly (shareable).
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const layout = document.getElementById('wiki-reader');
  const panel = document.getElementById('wiki-reader-main');
  const sidebar = layout && layout.querySelector('.sidebar');
  const input = document.getElementById('wiki-search');
  if (!layout || !panel || !sidebar || !input) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  // ---- chapters + entries (app.js wraps h2 groups only when its page name is "wiki.html")
  if (!panel.querySelector('.chapter-screen')) {
    let chapter = null;
    [...panel.childNodes].forEach((node) => {
      if (node.nodeType === 1 && node.matches('h2')) { chapter = el('section', 'chapter-screen'); panel.append(chapter); }
      if (chapter) chapter.append(node);
    });
  }
  const chapters = [...panel.querySelectorAll('.chapter-screen')].filter((c) => c.querySelector('h2[id]'));
  if (!chapters.length) return;
  const chapterId = (c) => c.querySelector('h2[id]').id;
  const chapterName = (c) => norm(c.querySelector('h2[id]').textContent);
  const used = new Set([...document.querySelectorAll('[id]')].map((n) => n.id));
  const isEntry = (h) => !h.closest('.wiki-live-entry, [data-wiki-updates]');
  for (const h of panel.querySelectorAll('.chapter-screen h3:not([id])')) {   // shareable ids for untitled-id entries
    if (!isEntry(h)) continue;
    let id = `wiki-${norm(h.textContent).replace(/[\s/?#]+/g, '-')}`, k = 2;
    while (used.has(id)) id = `${id}-${k++}`;
    used.add(id); h.id = id;
  }
  const entriesOf = (c) => [...c.querySelectorAll('h3[id]')].filter(isEntry);
  // An entry is its h3 plus the following siblings up to the next heading.
  function entryText(h) {
    let t = '';
    for (let n = h.nextElementSibling; n && !/^H[23]$/.test(n.tagName); n = n.nextElementSibling) t += ` ${n.textContent}`;
    return norm(t);
  }
  const chapterOf = (n) => chapters.find((c) => c.contains(n));

  // ---- reader chrome (built once; labels are UI, not Wiki copy)
  const head = el('header', 'wiki-reader-head');
  const back = el('button', 'wiki-reader-back', '‹ 返回'); back.type = 'button'; back.hidden = true;
  const title = el('p', 'wiki-reader-title', '藏書閣');
  const crumb = el('nav', 'wiki-crumb'); crumb.setAttribute('aria-label', '目前位置');
  const close = el('button', 'wiki-reader-close'); close.type = 'button';
  close.append(el('span', '', '探索山水'), el('span', 'wiki-reader-x', '×'));
  close.lastChild.setAttribute('aria-hidden', 'true');
  const searchBar = input.closest('.search-bar');
  const clear = el('button', 'wiki-search-clear', '清除'); clear.type = 'button'; clear.hidden = true;
  searchBar.append(clear);
  input.setAttribute('aria-controls', 'wiki-results');
  const filter = el('div', 'wiki-filter'); filter.setAttribute('role', 'group'); filter.setAttribute('aria-label', '搜尋範圍');
  const filters = [['', '全部'], ...chapters.map((c) => [chapterId(c), chapterName(c)])].map(([id, name]) => {
    const b = el('button', '', name); b.type = 'button'; b.dataset.filter = id; b.setAttribute('aria-pressed', String(!id)); filter.append(b); return b;
  });
  const bar = el('div', 'wiki-reader-bar'); bar.append(back, title, crumb);
  const find = el('div', 'wiki-reader-find'); find.append(searchBar, filter);
  head.append(bar, find, close);
  layout.prepend(head);
  const results = el('section', 'wiki-results'); results.id = 'wiki-results'; results.hidden = true; results.setAttribute('aria-live', 'polite');
  const count = el('p', 'wiki-results-count'); const list = el('ol', 'wiki-results-list'); results.append(count, list);
  panel.prepend(results);
  const progress = el('div', 'wiki-progress'); progress.setAttribute('aria-hidden', 'true'); layout.append(progress);
  const entryNav = el('ol', 'wiki-entries'); entryNav.setAttribute('aria-label', '本分類條目');
  sidebar.querySelector('.sidebar-links').after(entryNav);
  const chapterLinks = [...sidebar.querySelectorAll('.sidebar-links a[href^="#"]')];
  const intro = [...panel.children].filter((n) => n !== results && !n.matches('.chapter-screen'));   // guide links above the chapters
  layout.setAttribute('role', 'dialog');
  layout.setAttribute('aria-modal', 'true');
  layout.inert = true;
  root.classList.add('wiki-reader-ready');

  // ---- search
  let scope = '';
  function items() {
    const out = [];
    for (const c of chapters) {
      if (scope && chapterId(c) !== scope) continue;
      for (const h of entriesOf(c)) {
        const card = c.querySelector(`.wiki-card[href="#${CSS.escape(h.id)}"]`);   // its overview card carries search keywords
        out.push({ id: h.id, chapter: chapterName(c), title: norm(h.textContent), text: entryText(h), keys: card ? `${card.dataset.keywords || ''} ${card.textContent}`.toLowerCase() : '' });
      }
      c.querySelectorAll('.wiki-live-entry:not([hidden]), .site-custom-section').forEach((n, i) => {
        if (!n.id) n.id = `wiki-live-${i + 1}`;
        const t = n.querySelector('h2, h3, b');
        out.push({ id: n.id, chapter: chapterName(c), title: norm(t ? t.textContent : n.textContent).slice(0, 40), text: norm(n.textContent) });
      });
    }
    return out;
  }
  function marked(text, terms) {
    const frag = document.createDocumentFragment();
    const low = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      let hit = -1, len = 0;
      for (const t of terms) { const j = low.indexOf(t, i); if (j >= 0 && (hit < 0 || j < hit)) { hit = j; len = t.length; } }
      if (hit < 0) { frag.append(text.slice(i)); break; }
      frag.append(text.slice(i, hit), el('mark', '', text.slice(hit, hit + len)));
      i = hit + len;
    }
    return frag;
  }
  function runSearch(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const found = items().map((it) => {
      const t = it.title.toLowerCase(), all = `${t} ${it.text.toLowerCase()} ${it.keys || ''}`;
      return terms.every((w) => all.includes(w)) ? { ...it, rank: terms.every((w) => t.includes(w)) ? 0 : 1 } : null;
    }).filter(Boolean).sort((a, b) => a.rank - b.rank);
    list.replaceChildren();
    const where = scope ? `（${filters.find((b) => b.dataset.filter === scope).textContent}）` : '';
    if (!found.length) {
      count.replaceChildren(`找不到「${q}」${where}相關的條目。試試較短的關鍵字、換一個說法，或 `);
      const reset = el('button', 'wiki-inline-btn', scope ? '搜尋全部分類' : '清除搜尋'); reset.type = 'button';
      reset.addEventListener('click', () => (scope ? setScope('') : clearSearch()));
      count.append(reset, '。');
      return;
    }
    count.textContent = `「${q}」${where}共 ${found.length} 個條目`;
    for (const it of found) {
      const a = el('a', 'wiki-result'); a.href = `#${it.id}`;
      const i0 = Math.max(0, it.text.toLowerCase().indexOf(terms.find((w) => it.text.toLowerCase().includes(w)) || '') - 30);
      const snip = (i0 ? '…' : '') + it.text.slice(i0, i0 + 96) + (it.text.length > i0 + 96 ? '…' : '');
      const b = el('b'); b.append(marked(it.title, terms));
      const s = el('span', 'wiki-result-snippet'); s.append(marked(snip, terms));
      a.append(el('span', 'wiki-result-cat', it.chapter), b, s);
      const li = el('li'); li.append(a); list.append(li);
    }
  }
  function setScope(id) {
    scope = id;
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === id)));
    if (input.value.trim()) runSearch(input.value.trim());
  }
  function clearSearch() {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  // ---- views
  let state = { view: 'chapter', chapter: chapterId(chapters[0]), entry: null }, stack = [], open = false, pushed = false, opener = null, flash = 0;
  function target(hash) {
    const id = decodeURIComponent((hash || '').replace(/^#/, ''));
    const n = id && document.getElementById(id);
    const c = n && chapterOf(n);
    if (!c) return null;
    return { view: 'chapter', chapter: chapterId(c), entry: n.matches('h2') ? null : id };
  }
  function render() {
    const search = state.view === 'search';
    const c = chapters.find((x) => chapterId(x) === state.chapter) || chapters[0];
    chapters.forEach((x) => x.classList.toggle('is-off', search || x !== c));
    intro.forEach((x) => x.classList.toggle('is-off', search));
    results.hidden = !search;
    clear.hidden = !input.value;
    chapterLinks.forEach((a) => (a.getAttribute('href') === `#${chapterId(c)}` && !search ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    entryNav.replaceChildren(...entriesOf(c).map((h) => {
      const li = el('li'), a = el('a', '', norm(h.textContent)); a.href = `#${h.id}`; li.append(a); return li;
    }));
    entryNav.hidden = search;
    const entry = state.entry && document.getElementById(state.entry);
    crumb.replaceChildren(el('span', '', 'Wiki'), el('span', '', search ? `搜尋「${state.q || ''}」` : chapterName(c)));
    if (entry && !search) crumb.append(el('span', '', norm(entry.textContent).slice(0, 24)));
    back.hidden = !stack.length;
    if (search) { runSearch(state.q || ''); panel.scrollTop = 0; return; }
    if (entry) {
      panel.scrollTop += entry.getBoundingClientRect().top - panel.getBoundingClientRect().top - 28;
      clearTimeout(flash); panel.querySelectorAll('.is-target').forEach((n) => n.classList.remove('is-target'));
      entry.classList.add('is-target'); flash = setTimeout(() => entry.classList.remove('is-target'), 2200);
    } else panel.scrollTop = 0;
    onRead();
  }
  const same = (a, b) => a.view === b.view && a.chapter === b.chapter && a.entry === b.entry && a.q === b.q;
  function show(next, record = true) {
    if (record && open && !same(state, next)) stack.push(state);
    state = { ...state, ...next, entry: next.entry ?? null };
    render();
    if (open && state.view === 'chapter') history.replaceState(history.state, '', `#${state.entry || state.chapter}`);
  }
  const outside = () => [...document.querySelectorAll('main > .scroll-scene, .wiki-dock, [data-footer], .site-footer')];
  function openReader(next, fromHash = false) {
    if (!open) {
      open = true;
      opener = document.activeElement;
      root.setAttribute('data-wiki-reader', '');
      layout.inert = false;
      outside().forEach((n) => (n.inert = true));
      if (!fromHash) { history.pushState({ wikiReader: 1 }, '', location.href.split('#')[0]); pushed = true; }
      stack = [];
    }
    if (next.view === 'search') {
      state = { ...state, view: 'search', q: input.value.trim() };
      render();
      input.focus({ preventScroll: true });
      input.select();
    } else {
      show(next, false);
      (next.entry ? document.getElementById(next.entry) : head).focus({ preventScroll: true });
    }
  }
  function closeReader(fromPop = false) {
    if (!open) return;
    open = false;
    root.removeAttribute('data-wiki-reader');
    layout.inert = true;
    outside().forEach((n) => (n.inert = false));
    if (!fromPop) {
      if (pushed) history.back();
      else history.replaceState(null, '', location.href.split('#')[0]);
    }
    pushed = false;
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  }
  head.tabIndex = -1;
  panel.querySelectorAll('h3[id], .wiki-live-entry').forEach((n) => (n.tabIndex = -1));

  // ---- reading position: progress bar + current entry in the side list
  let readRaf = 0;
  function onRead() {
    readRaf = 0;
    const max = panel.scrollHeight - panel.clientHeight;
    progress.style.setProperty('--read', max > 0 ? (panel.scrollTop / max).toFixed(3) : '0');
    if (state.view !== 'chapter') return;
    const line = panel.getBoundingClientRect().top + panel.clientHeight * 0.3;
    let cur = null;
    for (const a of entryNav.querySelectorAll('a')) {
      const h = document.getElementById(a.hash.slice(1));
      if (h && h.getBoundingClientRect().top <= line) cur = a;
    }
    entryNav.querySelectorAll('a').forEach((a) => (a === cur ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
  }
  panel.addEventListener('scroll', () => { if (!readRaf) readRaf = requestAnimationFrame(onRead); }, { passive: true });

  // ---- events
  document.addEventListener('click', (e) => {
    const opener_ = e.target.closest('[data-wiki-open]');
    if (opener_) {
      e.preventDefault();
      openReader(opener_.dataset.wikiOpen === 'search' ? { view: 'search' } : { view: 'chapter', chapter: state.chapter });
      return;
    }
    const a = e.target.closest('a[href^="#"]');
    const t = a && target(a.hash);
    if (!t || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (open) { show(t); if (t.entry) document.getElementById(t.entry).focus({ preventScroll: true }); }
    else openReader(t);
  });
  back.addEventListener('click', () => {
    const prev = stack.pop();
    if (!prev) return;
    if (prev.view === 'search') { input.value = prev.q || ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    state = prev; render();
    if (prev.view === 'chapter') history.replaceState(history.state, '', `#${prev.entry || prev.chapter}`);
  });
  close.addEventListener('click', () => closeReader());
  clear.addEventListener('click', clearSearch);
  filters.forEach((b) => b.addEventListener('click', () => setScope(b.dataset.filter)));
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!open) return;
    if (q) {
      if (state.view === 'search') { state.q = q; render(); }
      else show({ view: 'search', q });
    } else if (state.view === 'search') {
      const prev = [...stack].reverse().find((s) => s.view === 'chapter');
      show(prev || { view: 'chapter', chapter: state.chapter }, false);
    }
    clear.hidden = !input.value;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); list.querySelector('a')?.click(); }
    if (e.key === 'ArrowDown') { const a = list.querySelector('a'); if (a) { e.preventDefault(); a.focus(); } }
  });
  list.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')], i = links.indexOf(document.activeElement);
    if (i < 0 || !/^Arrow(Up|Down)$/.test(e.key)) return;
    e.preventDefault();
    (e.key === 'ArrowDown' ? links[i + 1] : links[i - 1] || input).focus();
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openReader({ view: 'search' });
    } else if (e.key === 'Escape' && open) {
      if (e.target === input && input.value) clearSearch();
      else closeReader();
    }
  });
  addEventListener('popstate', () => {
    if (open && !(history.state && history.state.wikiReader)) closeReader(true);
    else if (!open && history.state && history.state.wikiReader) { const t = target(location.hash); if (t) { openReader(t, true); pushed = true; } }
  });

  // A typed or pasted #id (no reload) lands in the reader too.
  addEventListener('hashchange', () => {
    const t = target(location.hash);
    if (!t) return;
    if (open) show(t); else openReader(t, true);
  });
  // Shared link straight to a chapter or entry: open the reader there.
  const initial = target(location.hash);
  if (initial) openReader(initial, true);
  window.TeaWikiReader = { open: openReader, close: closeReader, state: () => ({ ...state, open, stack: stack.length }) };
})();
