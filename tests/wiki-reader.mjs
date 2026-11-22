// Contract checks for the Wiki explore/reader split. Behaviour (search, deep links, history, focus,
// scroll position) is exercised in a real browser by `MODE=reader node tools/cdp-scenes.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const html = read('wiki.html'), js = read('assets/js/wiki-reader.js'), css = read('assets/css/wiki-reader.css'), scene = read('assets/css/scroll-scene.css');
const copy = read('assets/js/site-copy-core.js');

// One copy of the Wiki: the reader is the page's own content layout, still readable without JS.
assert.equal((html.match(/<h3 id="teleport">/g) || []).length, 1, 'entries exist once');
assert.match(html, /<div class="content-layout" id="wiki-reader"/);
assert.match(html, /<article class="content-panel" id="wiki-reader-main">/);
assert.ok(!/content-panel" data-reveal-scope/.test(html), 'no window-scroll reveals inside the scrolling reader');
assert.match(css, /^\.wiki-dock \{ display: none; \}/m, 'without JS the dock is hidden');
assert.ok(/html\.wiki-reader-ready .wiki-page .content-layout \{/.test(css), 'reader styles only apply once JS is ready');
assert.match(js, /root\.classList\.add\('wiki-reader-ready'\)/);
// Search reuses the page's field (app.js keeps filtering live entries) and reads the live DOM.
assert.match(html, /id="wiki-search"/);
assert.match(js, /getElementById\('wiki-search'\)/);
assert.match(js, /dataset\.keywords/, 'overview-card keywords feed the search');
assert.match(js, /wiki-live-entry/, 'live /api/wiki entries are searchable');
// Reachable from the first second and from the scenes; shareable links; history and keyboard.
assert.match(html, /<nav class="wiki-dock"[\s\S]*data-wiki-open="search"[\s\S]*data-wiki-open="catalog"/);
assert.match(html, /class="scene-enter" href="#start" data-wiki-open="catalog"/, 'cave entrance opens the catalogue (no-JS: jumps to content)');
for (const id of ['start', 'travel', 'progress', 'economy', 'activities', 'extras']) assert.match(html, new RegExp(`class="scene-cat" href="#${id}"`), `chapter ${id} reachable from act 2`);
for (const hook of ["addEventListener('popstate'", "addEventListener('hashchange'", 'history.pushState', "e.key === '/'", "e.key === 'Escape'", 'aria-modal', '.inert']) assert.ok(js.includes(hook), `reader: ${hook}`);
// Explore mode: no boxed copy, no scene search, no index panel on the cave.
for (const gone of ['scene-note', 'scene-search', 'scene-index', 'scene-chips']) {
  assert.ok(!html.includes(gone), `wiki.html: ${gone} removed`);
  assert.ok(!scene.includes(gone), `scroll-scene.css: ${gone} removed`);
}
assert.ok(!/border-left/.test(scene), 'no decorative vertical rules in scene copy');
// The scenes pause under the reader; copy stays editable in the admin copy editor.
assert.match(read('assets/js/scene-live.js'), /data-wiki-reader/);
assert.match(read('assets/js/scroll-scene.js'), /data-wiki-reader/);
assert.match(copy, /\.scroll-scene-copy :is\(h2, p, \[data-copy\]\)/);
assert.ok(!/藏書閣|六個分類/.test(read('assets/js/scroll-scene.js')), 'no Wiki copy inside the engine');
console.log('Wiki reader: single source, entry points, history/keyboard hooks, unboxed scenes passed.');
