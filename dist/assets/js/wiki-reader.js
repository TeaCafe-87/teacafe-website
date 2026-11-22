/* Wiki reader (藏書閣): browse by category, read one entry at a time, search.
 *
 * No second copy of the Wiki: the reader IS the page's own .content-layout (sidebar + content
 * panel), which no-JS visitors and search engines read inline. With JS it becomes an overlay
 * over the scenes. Search reads the live DOM at query time, so admin copy overrides
 * (site-copy-public.js) and live entries (/api/wiki, app.js) are always included, and the page's
 * own #wiki-search field is reused (app.js keeps filtering its live entries).
 *
 * Views (one at a time, never the whole Wiki as one long page):
 *   chapter  a category's overview: its entry list (the .wiki-grid cards) + chapter notes
 *   entry    one entry (its h3 and what follows up to the next heading), with previous / next
 *   search   results for the query, narrowed by 篩選結果 (only shown while there are results)
 * Browsing categories lives in the side list; filtering lives with the results. They never share
 * a control.
 *
 * Entering: the dock (搜尋 / 目錄), the cave's 進入藏書閣 and the act-2 category links fly the
 * camera into the library first (scene-journey.js), then open; reduced motion opens at once.
 * Closing returns to the exact scroll position the visitor left, through Back / Forward / reload.
 *   /  or  Ctrl/⌘ K   search;  Esc closes the image, clears the field, then closes the reader
 * URLs: #<chapter id> or #<entry id> open the reader there directly (shareable).
 *
 * Images: <figure class="wiki-figure"><img src alt width height><figcaption>…</figcaption></figure>
 * anywhere inside an entry, or several in <div class="wiki-gallery">. Lazy-loaded, never stretched,
 * click to enlarge (data-full for a larger file), alt text shown if the file fails to load.
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
  const btn = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || root.dataset.motion === 'reduced';

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
  const byChapter = (id) => chapters.find((c) => chapterId(c) === id) || chapters[0];
  const used = new Set([...document.querySelectorAll('[id]')].map((n) => n.id));
  // Chapter-level blocks end an entry: FAQ, notes, live entries and admin-added sections.
  const CHAPTER_BLOCK = '.wiki-grid, .wiki-faq, .tip, .wiki-live-entry, .site-custom-section, [data-wiki-updates]';
  // Wrap each entry (an h3 and its content) so it can be shown on its own; ids stay on the h3.
  for (const c of chapters) {
    for (const h of [...c.children].filter((n) => n.matches('h3') && !n.closest('.wiki-live-entry, [data-wiki-updates]'))) {
      if (!h.id) {
        let id = `wiki-${norm(h.textContent).replace(/[\s/?#]+/g, '-')}`, k = 2;
        while (used.has(id)) id = `${id}-${k++}`;
        used.add(id); h.id = id;
      }
      const wrap = el('section', 'wiki-entry');
      wrap.dataset.entry = h.id;
      h.before(wrap);
      for (let n = h; n && !(n !== h && (/^H[23]$/.test(n.tagName) || n.matches(CHAPTER_BLOCK)));) { const next = n.nextElementSibling; wrap.append(n); n = next; }
    }
  }
  const entriesOf = (c) => [...c.querySelectorAll(':scope > .wiki-entry')];
  const entryTitle = (w) => norm(w.querySelector('h3').textContent);
  const entryById = (id) => panel.querySelector(`.wiki-entry[data-entry="${CSS.escape(id)}"]`);
  const chapterOf = (n) => chapters.find((c) => c.contains(n));
  // A chapter without an overview grid gets a plain entry list.
  for (const c of chapters) {
    if (c.querySelector('.wiki-grid')) continue;
    const ol = el('ol', 'wiki-entry-list');
    for (const w of entriesOf(c)) { const a = el('a', '', entryTitle(w)); a.href = `#${w.dataset.entry}`; const li = el('li'); li.append(a); ol.append(li); }
    c.querySelector('h2').after(ol);
  }

  // ---- images: lazy, never stretched, enlarge on click, alt text if the file fails
  panel.querySelectorAll('.wiki-figure img, .wiki-gallery img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.loading = 'lazy';
    img.decoding = 'async';
    img.closest('figure')?.setAttribute('data-alt', img.alt || '圖片');
  });
  panel.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.closest('figure')?.classList.add('is-broken');
  }, true);
  const box = el('dialog', 'wiki-lightbox'); box.setAttribute('aria-label', '圖片檢視');
  const boxImg = el('img'); boxImg.alt = '';
  const boxCap = el('p', 'wiki-lightbox-cap');
  const boxClose = btn('wiki-lightbox-close', '關閉'), boxPrev = btn('wiki-lightbox-prev', '‹'), boxNext = btn('wiki-lightbox-next', '›');
  boxPrev.setAttribute('aria-label', '上一張'); boxNext.setAttribute('aria-label', '下一張');
  box.append(boxImg, boxCap, boxPrev, boxNext, boxClose);
  document.body.append(box);
  let boxSet = [], boxAt = 0;
  function showImage(i) {
    boxAt = (i + boxSet.length) % boxSet.length;
    const img = boxSet[boxAt];
    boxImg.src = img.dataset.full || img.currentSrc || img.src;
    boxImg.alt = img.alt;
    boxCap.textContent = norm(img.closest('figure')?.querySelector('figcaption')?.textContent) || img.alt;
    boxPrev.hidden = boxNext.hidden = boxSet.length < 2;
  }
  panel.addEventListener('click', (e) => {
    const img = e.target.closest('.wiki-figure img, .wiki-gallery img');
    if (!img || img.closest('.is-broken')) return;
    const group = img.closest('.wiki-gallery');
    boxSet = group ? [...group.querySelectorAll('img')].filter((n) => !n.closest('.is-broken')) : [img];
    showImage(boxSet.indexOf(img));
    box.showModal();
  });
  panel.querySelectorAll('.wiki-figure img, .wiki-gallery img').forEach((img) => { img.tabIndex = 0; img.setAttribute('role', 'button'); });
  panel.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.wiki-figure img, .wiki-gallery img')) { e.preventDefault(); e.target.click(); } });
  boxClose.addEventListener('click', () => box.close());
  boxPrev.addEventListener('click', () => showImage(boxAt - 1));
  boxNext.addEventListener('click', () => showImage(boxAt + 1));
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') showImage(boxAt - 1); if (e.key === 'ArrowRight') showImage(boxAt + 1); });

  // ---- reader chrome (labels are UI, not Wiki copy)
  const head = el('header', 'wiki-reader-head');
  const back = btn('wiki-reader-back', '‹ 返回'); back.hidden = true;
  const title = el('p', 'wiki-reader-title', '藏書閣');
  const crumb = el('nav', 'wiki-crumb'); crumb.setAttribute('aria-label', '目前位置');
  const close = btn('wiki-reader-close');
  close.append(el('span', '', '探索山水'), el('span', 'wiki-reader-x', '×'));
  close.lastChild.setAttribute('aria-hidden', 'true');
  const form = input.closest('form') || input.closest('.search-bar');
  const go = form.querySelector('.wiki-search-go');
  const clear = btn('wiki-search-clear', '清除'); clear.hidden = true;
  (go || input).before(clear);
  input.setAttribute('aria-controls', 'wiki-results');
  const bar = el('div', 'wiki-reader-bar'); bar.append(back, title, crumb);
  const find = el('div', 'wiki-reader-find'); find.append(form);
  head.append(bar, find, close);
  layout.prepend(head);
  // Results: summary, 篩選結果 (by category, with counts), reset/clear, list.
  const results = el('section', 'wiki-results'); results.id = 'wiki-results'; results.hidden = true; results.tabIndex = -1;
  results.setAttribute('aria-label', '搜尋結果');
  const summary = el('p', 'wiki-results-count'); summary.setAttribute('aria-live', 'polite');
  const refine = el('div', 'wiki-refine');
  const refineLabel = el('span', 'wiki-refine-label', '篩選結果');
  const facets = el('div', 'wiki-facets'); facets.setAttribute('role', 'group'); facets.setAttribute('aria-label', '依分類篩選搜尋結果');
  const resetBtn = btn('wiki-inline-btn', '重設篩選'), clearBtn = btn('wiki-inline-btn', '清除搜尋');
  refine.append(refineLabel, facets, resetBtn, clearBtn);
  const list = el('ol', 'wiki-results-list');
  results.append(summary, refine, list);
  panel.prepend(results);
  const progress = el('div', 'wiki-progress'); progress.setAttribute('aria-hidden', 'true'); layout.append(progress);
  // Side list: 百科分類 (browse) + the open category's entries.
  const entryHead = el('h3', 'wiki-entries-head', '本分類條目');
  const entryNav = el('ol', 'wiki-entries'); entryNav.setAttribute('aria-label', '本分類條目');
  sidebar.querySelector('.sidebar-links').after(entryHead, entryNav);
  sidebar.querySelector('.sidebar-links').setAttribute('aria-label', '百科分類');
  const chapterLinks = [...sidebar.querySelectorAll('.sidebar-links a[href^="#"]')];
  const pager = el('nav', 'wiki-pager'); pager.setAttribute('aria-label', '條目導覽');
  const intro = [...panel.children].filter((n) => n !== results && n !== form && !n.matches('.chapter-screen'));   // guide links above the chapters
  layout.setAttribute('role', 'dialog');
  layout.setAttribute('aria-modal', 'true');
  layout.inert = true;
  root.classList.add('wiki-reader-ready');

  // ---- search
  function items() {
    const out = [];
    for (const c of chapters) {
      for (const w of entriesOf(c)) {
        const id = w.dataset.entry;
        const card = c.querySelector(`.wiki-card[href="#${CSS.escape(id)}"]`);   // its overview card carries search keywords
        const t = entryTitle(w);
        out.push({ id, chapter: chapterId(c), chapterName: chapterName(c), title: t, text: norm(w.textContent).slice(t.length).trim(),
          keys: card ? `${card.dataset.keywords || ''} ${card.textContent}`.toLowerCase() : '' });
      }
      c.querySelectorAll('.wiki-live-entry:not([hidden]), .site-custom-section').forEach((n, i) => {
        if (!n.id) n.id = `wiki-live-${chapterId(c)}-${i + 1}`;
        const t = n.querySelector('h2, h3, b');
        out.push({ id: n.id, chapter: chapterId(c), chapterName: chapterName(c), title: norm(t ? t.textContent : n.textContent).slice(0, 40), text: norm(n.textContent) });
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
  function search(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items().map((it) => {
      const t = it.title.toLowerCase(), all = `${t} ${it.text.toLowerCase()} ${it.keys || ''}`;
      return terms.every((w) => all.includes(w)) ? { ...it, rank: terms.every((w) => t.includes(w)) ? 0 : 1 } : null;
    }).filter(Boolean).sort((a, b) => a.rank - b.rank);
  }
  function renderResults() {
    const q = state.q || '', terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    list.replaceChildren(); facets.replaceChildren();
    if (!q) {
      summary.textContent = '輸入玩法、指令或物品名稱，按 Enter 或放大鏡搜尋。';
      refine.hidden = true;
      return;
    }
    const all = search(q);
    const counts = new Map();
    all.forEach((it) => counts.set(it.chapter, (counts.get(it.chapter) || 0) + 1));
    const scope = counts.has(state.scope) ? state.scope : '';
    const shown = scope ? all.filter((it) => it.chapter === scope) : all;
    if (!all.length) {
      summary.replaceChildren(`找不到「${q}」相關的條目。試試較短的關鍵字或換一個說法。`);
      refine.hidden = false; refineLabel.hidden = facets.hidden = resetBtn.hidden = true; clearBtn.hidden = false;
      return;
    }
    const where = scope ? `，篩選：${chapterName(byChapter(scope))}` : '';
    summary.textContent = `「${q}」共 ${all.length} 個結果${scope ? `，顯示 ${shown.length} 個` : ''}${where}`;
    // Filtering only makes sense when the results span more than one category.
    refine.hidden = false;
    refineLabel.hidden = facets.hidden = counts.size < 2;
    resetBtn.hidden = !scope; clearBtn.hidden = false;
    if (counts.size >= 2) {
      for (const [id, name] of [['', '全部'], ...chapters.filter((c) => counts.has(chapterId(c))).map((c) => [chapterId(c), chapterName(c)])]) {
        const b = btn('wiki-facet'); b.dataset.scope = id; b.setAttribute('aria-pressed', String(id === scope));
        b.append(name, el('span', 'wiki-facet-n', String(id ? counts.get(id) : all.length)));
        facets.append(b);
      }
    }
    for (const it of shown) {
      const a = el('a', 'wiki-result'); a.href = `#${it.id}`;
      const low = it.text.toLowerCase();
      const i0 = Math.max(0, low.indexOf(terms.find((w) => low.includes(w)) || '') - 30);
      const snip = (i0 ? '…' : '') + it.text.slice(i0, i0 + 96) + (it.text.length > i0 + 96 ? '…' : '');
      const b = el('b'); b.append(marked(it.title, terms));
      const s = el('span', 'wiki-result-snippet'); s.append(marked(snip, terms));
      a.append(el('span', 'wiki-result-cat', it.chapterName), b, s);
      const li = el('li'); li.append(a); list.append(li);
    }
  }

  // ---- views
  let state = { view: 'chapter', chapter: chapterId(chapters[0]), entry: null, q: '', scope: '' };
  let stack = [], open = false, pushed = false, opener = null, flash = 0, busy = false;
  let returnY = null;                                     // where exploring resumes on close
  function target(hash) {
    const id = decodeURIComponent((hash || '').replace(/^#/, ''));
    const n = id && document.getElementById(id);
    const c = n && chapterOf(n);
    if (!c) return null;
    if (n.matches('h2')) return { view: 'chapter', chapter: chapterId(c) };
    const w = n.closest('.wiki-entry');
    if (w) return { view: 'entry', chapter: chapterId(c), entry: w.dataset.entry, focus: id };
    return { view: 'chapter', chapter: chapterId(c), focus: id };   // a live entry or chapter note
  }
  function render() {
    const view = state.view, c = byChapter(state.chapter);
    const entry = view === 'entry' ? entryById(state.entry) : null;
    if (view === 'entry' && !entry) { state.view = 'chapter'; return render(); }
    chapters.forEach((x) => {
      x.classList.toggle('is-off', view === 'search' || x !== c);
      x.dataset.view = view;
      entriesOf(x).forEach((w) => w.classList.toggle('is-off', w !== entry));
    });
    intro.forEach((x) => x.classList.toggle('is-off', view !== 'chapter'));
    results.hidden = view !== 'search';
    clear.hidden = !input.value;
    chapterLinks.forEach((a) => (a.getAttribute('href') === `#${chapterId(c)}` && view !== 'search' ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    entryNav.replaceChildren(...entriesOf(c).map((w) => {
      const li = el('li'), a = el('a', '', entryTitle(w)); a.href = `#${w.dataset.entry}`;
      if (w === entry) a.setAttribute('aria-current', 'page');
      li.append(a); return li;
    }));
    entryNav.hidden = entryHead.hidden = view === 'search';
    crumb.replaceChildren(el('span', '', view === 'search' ? '搜尋結果' : chapterName(c)));
    if (entry) crumb.append(el('span', '', entryTitle(entry).slice(0, 24)));
    back.hidden = !stack.length;
    pager.remove();
    if (entry) {
      const all = entriesOf(c), i = all.indexOf(entry);
      pager.replaceChildren();
      const link = (w, cls, label) => { const a = el('a', cls); a.href = `#${w.dataset.entry}`; a.append(el('small', '', label), el('span', '', entryTitle(w))); return a; };
      if (all[i - 1]) pager.append(link(all[i - 1], 'wiki-pager-prev', '上一條'));
      const up = el('a', 'wiki-pager-up'); up.href = `#${chapterId(c)}`; up.append(el('small', '', '回到分類'), el('span', '', chapterName(c)));
      pager.append(up);
      if (all[i + 1]) pager.append(link(all[i + 1], 'wiki-pager-next', '下一條'));
      entry.after(pager);
    }
    if (view === 'search') renderResults();
    const focusEl = state.focus && document.getElementById(state.focus);
    if (focusEl && view === 'chapter') {
      panel.scrollTop += focusEl.getBoundingClientRect().top - panel.getBoundingClientRect().top - 28;
      clearTimeout(flash); panel.querySelectorAll('.is-target').forEach((n) => n.classList.remove('is-target'));
      focusEl.classList.add('is-target'); flash = setTimeout(() => focusEl.classList.remove('is-target'), 2200);
    } else panel.scrollTop = 0;
    onRead();
  }
  const same = (a, b) => a.view === b.view && a.chapter === b.chapter && a.entry === b.entry && (a.view !== 'search' || (a.q === b.q && a.scope === b.scope));
  const hashOf = (s) => (s.view === 'entry' ? `#${s.entry}` : s.view === 'chapter' ? `#${s.chapter}` : location.hash);
  function show(next, record = true) {
    if (record && open && !same(state, { ...state, ...next })) stack.push(state);
    state = { ...state, focus: null, ...next };
    if (state.view !== 'entry') state.entry = next.entry ?? null;
    render();
    if (open) history.replaceState(history.state, '', hashOf(state));
  }
  const outside = () => [...document.querySelectorAll('main > .scroll-scene, .wiki-dock, [data-footer], .site-footer')];
  function focusView() {
    if (state.view === 'search') { input.focus({ preventScroll: true }); input.select(); return; }
    const t = state.view === 'entry' ? document.getElementById(state.entry) : (state.focus && document.getElementById(state.focus)) || byChapter(state.chapter).querySelector('h2');
    (t || head).focus({ preventScroll: true });
  }
  function openReader(next, { fromHash = false, back: resumeY = scrollY } = {}) {
    if (!open) {
      open = true;
      opener = document.activeElement;
      returnY = resumeY;
      root.setAttribute('data-wiki-reader', '');
      root.setAttribute('data-journey-paused', '');
      layout.inert = false;
      outside().forEach((n) => (n.inert = true));
      if (!fromHash) { history.pushState({ wikiReader: 1, pushed: 1, returnY }, '', location.href.split('#')[0]); pushed = true; }
      else history.replaceState({ ...(history.state || {}), wikiReader: 1, returnY }, '');
      stack = [];
      window.TeaSceneJourney?.nav.updateTopbar();
    }
    if (next.view === 'search') { state = { ...state, view: 'search', q: input.value.trim() }; render(); }
    else show(next, false);
    focusView();
  }
  // Fly into the library (scene-journey.js), then open. From act 2 at 0.7 to the last frame of act 3,
  // where the 藏書閣 beat ends (data/scenes/wiki-03.json "library": to 1).
  async function enter(next) {
    if (busy) return;
    if (open) { show(next); focusView(); return; }
    const J = window.TeaSceneJourney, from = scrollY;
    busy = true;
    try {
      const flew = J && !reduced() ? await J.fly({ from: { scene: 1, p: 0.7 }, to: { scene: 2, p: 1 }, duration: 4600, minSpan: 1700, veilAtEnd: true }) : false;
      openReader(next, { back: from });
      if (flew) setTimeout(() => J.unveil(), 380);
    } finally { busy = false; }
  }
  function closeReader(fromPop = false) {
    if (!open) return;
    open = false;
    const y = returnY;
    returnY = null;
    // Back to where exploring stopped: the scenes redraw under the closing reader (and a veil, for a far jump).
    if (y != null && Math.abs(y - scrollY) > 2) (window.TeaSceneJourney ? window.TeaSceneJourney.jump(y) : scrollTo({ top: y, behavior: 'instant' }));
    root.removeAttribute('data-wiki-reader');
    root.removeAttribute('data-journey-paused');
    layout.inert = true;
    outside().forEach((n) => (n.inert = false));
    if (!fromPop) {
      if (pushed) history.back();
      else history.replaceState(null, '', location.href.split('#')[0]);
    }
    pushed = false;
    window.TeaSceneJourney?.nav.updateTopbar();
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  }
  head.tabIndex = -1;
  panel.querySelectorAll('h2[id], h3[id], .wiki-live-entry').forEach((n) => (n.tabIndex = -1));

  // ---- reading position: progress bar + current entry
  let readRaf = 0;
  function onRead() {
    readRaf = 0;
    const max = panel.scrollHeight - panel.clientHeight;
    progress.style.setProperty('--read', max > 0 ? (panel.scrollTop / max).toFixed(3) : '0');
  }
  panel.addEventListener('scroll', () => { if (!readRaf) readRaf = requestAnimationFrame(onRead); }, { passive: true });

  // The dock steps aside once the footer is in view (its links sit where the dock floats).
  const foot = document.querySelector('[data-footer]');
  if (foot && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => root.toggleAttribute('data-footer-near', e.isIntersecting)).observe(foot);

  // ---- events
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-wiki-open]');
    if (openBtn) {
      e.preventDefault();
      enter(openBtn.dataset.wikiOpen === 'search' ? { view: 'search' } : { view: 'chapter', chapter: state.chapter });
      return;
    }
    const facet = e.target.closest('.wiki-facet');
    if (facet) { show({ view: 'search', q: state.q, scope: facet.dataset.scope }); return; }
    const a = e.target.closest('a[href^="#"]');
    const t = a && target(a.hash);
    if (!t || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    if (open) { show(t); focusView(); }
    else enter(t);
  });
  back.addEventListener('click', () => {
    const prev = stack.pop();
    if (!prev) return;
    if (prev.view === 'search') { input.value = prev.q || ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    state = prev; render();
    history.replaceState(history.state, '', hashOf(prev));
    focusView();
  });
  close.addEventListener('click', () => closeReader());
  clear.addEventListener('click', clearSearch);
  clearBtn.addEventListener('click', clearSearch);
  resetBtn.addEventListener('click', () => show({ view: 'search', q: state.q, scope: '' }));
  function clearSearch() {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }
  // Typing searches as you go; Enter and the magnifier run the same search (the form's submit).
  function runQuery(record) {
    const q = input.value.trim();
    clear.hidden = !input.value;
    if (!open) return;
    if (q || state.view === 'search') {
      if (state.view === 'search' && !record) { state.q = q; state.scope = ''; render(); }
      else show({ view: 'search', q, scope: '' });
    }
  }
  input.addEventListener('input', () => {
    if (!input.value.trim() && state.view === 'search') {     // emptied: back to where browsing was
      const prev = [...stack].reverse().find((s) => s.view !== 'search');
      state.q = ''; show(prev || { view: 'chapter', chapter: state.chapter }, false);
      clear.hidden = true;
      return;
    }
    runQuery(false);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!open) { enter({ view: 'search' }); return; }
    if (!input.value.trim()) { show({ view: 'search', q: '' }); input.focus(); return; }   // empty: a hint, never an error
    runQuery(state.view !== 'search');
    input.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { const a = list.querySelector('a'); if (a) { e.preventDefault(); a.focus(); } }
  });
  list.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')], i = links.indexOf(document.activeElement);
    if (i < 0 || !/^Arrow(Up|Down)$/.test(e.key)) return;
    e.preventDefault();
    (e.key === 'ArrowDown' ? links[i + 1] || links[i] : links[i - 1] || input).focus();
  });
  document.addEventListener('keydown', (e) => {
    if (box.open) return;                                  // the image viewer handles its own keys (Esc closes it)
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      enter({ view: 'search' });
    } else if (e.key === 'Escape' && open) {
      if (e.target === input && input.value) clearSearch();
      else closeReader();
    }
  });
  addEventListener('popstate', () => {
    const st = history.state;
    if (open && !(st && st.wikiReader)) {
      // A typed #id is a fragment navigation (popstate, then hashchange): stay open and go there.
      const t = target(location.hash);
      if (t) { history.replaceState({ wikiReader: 1, returnY }, ''); pushed = false; show(t, false); return; }   // closing then replaces, never steps back into the reader
      closeReader(true);
    }
    else if (!open && st && st.wikiReader) {                // Forward into the reader again
      const t = target(location.hash) || (state.view === 'search' ? { view: 'search' } : { view: 'chapter', chapter: state.chapter });
      openReader(t, { fromHash: true, back: st.returnY ?? scrollY }); pushed = true;
    }
  });
  // A typed or pasted #id (no reload) lands in the reader too.
  addEventListener('hashchange', () => {
    const t = target(location.hash);
    if (!t) return;
    if (open) show(t); else openReader(t, { fromHash: true });
  });
  // Shared link or reload with the reader open: open it there; a reload keeps where exploring stopped.
  const initial = target(location.hash);
  if (initial) {
    const st = history.state;
    openReader(initial, { fromHash: true, back: st && st.wikiReader && st.returnY != null ? st.returnY : scrollY });
    if (st && st.wikiReader) pushed = !!st.pushed;
  }
  window.TeaWikiReader = { open: (next) => openReader(next), enter, close: closeReader, state: () => ({ ...state, open, busy, stack: stack.length, returnY }) };
})();
