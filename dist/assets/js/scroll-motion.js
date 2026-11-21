/* TeaCafe shared scroll motion: one visual language for titles and body copy on every page.
 *
 * Opt in per element with data-reveal="title" | "body", or per region with
 * data-reveal-scope (h2 -> title, h3/p/cards/faq -> body are tagged automatically).
 *
 * Each element gets --rv-in (0..1, entering from below) and, for titles, --rv-out
 * (0..1, leaving through the top). Values are a pure function of the element's
 * position, so scrolling up replays the animation backwards instead of re-triggering.
 * Only elements near the viewport are measured (IntersectionObserver), and work
 * happens in one rAF per scroll frame: all reads first, then all writes.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reducedQuery.matches || root.dataset.motion === 'reduced';
  const clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };

  // Where in the viewport (fraction of its height, from the top) motion starts/ends.
  // Titles begin at the very bottom and settle by 72%; body copy waits a beat (94% -> 70%)
  // and travels less, so text always lands after its heading.
  const RANGES = {
    title: { start: 1.0, end: 0.72, outStart: 0.18, outEnd: -0.05 },
    body: { start: 0.94, end: 0.70 }
  };
  const AUTO = { title: ':scope h2', body: ':scope :is(h3, p, .wiki-grid, .wiki-faq, .tip, .wiki-guide-links)' };

  const tracked = new Map();     // element -> { kind, last }
  const visible = new Set();
  let frame = 0;
  let enabled = false;
  let layoutDirty = true;

  // Page position from layout offsets, which ignore transforms. getBoundingClientRect()
  // would include the reveal's own translate/perspective and feed back into itself.
  function pageTop(el) {
    let y = 0;
    for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
    return y;
  }

  function update() {
    frame = 0;
    const vh = innerHeight, y = scrollY;
    if (layoutDirty) {                                   // re-measure only after resize / DOM changes
      layoutDirty = false;
      for (const [el, item] of tracked) item.top = pageTop(el);
    }
    for (const el of visible) {
      const item = tracked.get(el);
      const r = RANGES[item.kind];
      const top = item.top - y;
      const enter = smooth((r.start * vh - top) / ((r.start - r.end) * vh));
      const leave = r.outStart === undefined ? 0 : smooth((r.outStart * vh - top) / ((r.outStart - r.outEnd) * vh));
      const key = `${enter.toFixed(3)}|${leave.toFixed(3)}`;
      if (key === item.last) continue;
      item.last = key;
      el.style.setProperty('--rv-in', enter.toFixed(3));
      if (r.outStart !== undefined) el.style.setProperty('--rv-out', leave.toFixed(3));
    }
  }
  const queue = () => { if (!frame && enabled) frame = requestAnimationFrame(update); };
  const relayout = () => { layoutDirty = true; queue(); };
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(relayout) : null;

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target);
      else {
        visible.delete(e.target);
        // Park off-screen elements in their final state for their side of the viewport.
        const item = tracked.get(e.target);
        const below = e.boundingClientRect.top > 0;
        e.target.style.setProperty('--rv-in', below ? '0' : '1');
        if (RANGES[item.kind].outStart !== undefined) e.target.style.setProperty('--rv-out', below ? '0' : '1');
        item.last = '';
      }
    }
    queue();
  }, { rootMargin: '10% 0px 10% 0px' }) : null;

  function track(el, kind) {
    if (tracked.has(el) || !RANGES[kind] || el.closest('dialog,[hidden],[data-scroll-scene]')) return;
    if (!el.dataset.reveal) el.dataset.reveal = kind;
    tracked.set(el, { kind, last: '', top: 0 });
    layoutDirty = true;
    if (enabled) io.observe(el);
  }

  function scan(scope = document) {
    scope.querySelectorAll?.('[data-reveal="title"],[data-reveal="body"]').forEach(el => track(el, el.dataset.reveal));
    const scopes = scope.matches?.('[data-reveal-scope]') ? [scope] : [...(scope.querySelectorAll?.('[data-reveal-scope]') || [])];
    for (const s of scopes) {
      s.querySelectorAll(AUTO.title).forEach(el => track(el, 'title'));
      s.querySelectorAll(AUTO.body).forEach(el => {
        // Nested matches (a <p> inside .tip) animate with their container only.
        if (el.parentElement.closest('[data-reveal]')) return;
        track(el, 'body');
      });
    }
  }

  function enable() {
    if (enabled || !io) return;
    enabled = true;
    root.dataset.revealReady = '';
    for (const el of tracked.keys()) io.observe(el);
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', relayout, { passive: true });
    resizeObserver?.observe(document.body);              // late fonts, images, injected entries
    relayout();
  }
  function disable() {
    if (!enabled) return;
    enabled = false;
    delete root.dataset.revealReady;     // CSS shows everything at rest without this flag
    cancelAnimationFrame(frame);
    frame = 0;
    io.disconnect();
    visible.clear();
    removeEventListener('scroll', queue);
    removeEventListener('resize', relayout);
    resizeObserver?.disconnect();
  }
  const sync = () => (reduced() ? disable() : enable());

  scan();
  // Content injected later (live wiki entries, admin-edited sections) joins automatically.
  new MutationObserver(records => {
    const scopes = new Set();
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      scopes.add(n.closest('[data-reveal-scope]') || n);
    }
    scopes.forEach(scan);
    layoutDirty = true;
  }).observe(document.body, { childList: true, subtree: true });
  reducedQuery.addEventListener('change', sync);
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  sync();
  window.TeaScrollMotion = { scan, RANGES };

  // A search box inside a scene (<form data-scene-search="#wiki-search">) hands its query to the
  // page's own search field, which already filters the entries, and brings that field into view.
  document.addEventListener('submit', (e) => {
    const form = e.target.closest?.('[data-scene-search]');
    const target = form && document.querySelector(form.dataset.sceneSearch);
    if (!target) return;
    e.preventDefault();
    target.value = form.querySelector('input')?.value.trim() || '';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  });
})();
