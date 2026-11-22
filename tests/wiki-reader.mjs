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

// ---- round 3: navigation, copy, search UX, images, transitions
const nav = read('assets/js/journey-nav.js'), journey = read('assets/js/scene-journey.js'), engine = read('assets/js/scroll-scene.js');
// Opening: pure-Chinese brush title, no visual breadcrumb, no player-visible placeholder copy.
assert.match(html, /<h1 [^>]*data-beat="title"[^>]*>玩法百科<\/h1>/);
assert.ok(!/class="crumb"/.test(html) && !/scene-latin/.test(html), 'no visual breadcrumb or Latin title in the opening');
assert.ok(!/暫定文案|待補充|Lorem ipsum|data-placeholder/i.test(html), 'no placeholder copy shipped');
assert.ok(!/>[^<]*(吊橋入洞|吊橋的另一頭)/.test(html), 'redundant shot captions removed');
assert.ok(['wiki-02', 'wiki-03'].every((id) => !JSON.parse(read(`data/scenes/${id}.json`)).beats.some((b) => /threshold|bridge/.test(b.id))), 'their beats are gone too (the 3D shots stay)');
// Stops: declared per scene as progress, turned into the shared glide (journey-nav.js) by scene-journey.js.
for (const [id, stops] of [['wiki-01', '0.4,0.73'], ['wiki-02', '0.53,0.96'], ['wiki-03', '0.7']]) assert.match(html, new RegExp(`/data/scenes/${id}\\.json" [^>]*data-scene-stops="${stops.replace(/\./g, '\\.')}"`));
assert.match(html, /wiki-03\.json"[^>]*--scene-length:380svh/, 'act 3 is shorter');
const lib = JSON.parse(read('data/scenes/wiki-03.json')).beats.find((b) => b.id === 'library');
assert.ok(lib && lib.to === 1 && lib.from < 0.7, 'the library beat holds from the stop to the last frame (the flight target)');
const order = ['scroll-scene.js', 'journey-nav.js', 'scene-journey.js', 'wiki-reader.js'].map((f) => html.indexOf(f));
assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'script order: engine, nav, journey, reader');
assert.match(journey, /window\.TeaJourneyNav\(\{/);
assert.match(journey, /data-journey-paused/, 'an open reader pauses the stepping');
assert.match(journey, /history\.scrollRestoration = 'manual'/);
assert.match(nav, /topbar-hidden/); assert.match(nav, /pointermove/); assert.match(nav, /focusin/);
assert.match(engine, /readyAt\(p\)/); assert.match(engine, /keepFull\(on\)/);
assert.match(engine, /Never step against the motion/, 'frames never step back during fast moves');
assert.match(read('assets/js/ink-fluid.js'), /reset\(\)/); assert.match(engine, /this\.fluid\?\.reset\?\.\(\)/);
// Search: a real form whose magnifier is the submit button; filtering only with the results.
assert.match(html, /<form class="search-bar" role="search"[^>]*>[\s\S]*?<button class="wiki-search-go" type="submit" aria-label="搜尋">/);
assert.match(js, /form\.addEventListener\('submit'/);
assert.ok(!/wiki-filter/.test(js + css), 'the ambiguous top filter row is gone');
assert.match(js, /'篩選結果'/); assert.match(js, /'重設篩選'/); assert.match(js, /'清除搜尋'/);
// One entry at a time, with previous/next; images with lazy loading, a viewer and an alt-text fallback.
assert.match(js, /'wiki-entry'/); assert.match(js, /wiki-pager/);
assert.match(js, /\.wiki-figure img, \.wiki-gallery img/); assert.match(js, /img\.loading = 'lazy'/); assert.match(js, /showModal\(\)/); assert.match(js, /is-broken/);
assert.match(css, /\.wiki-figure img, \.wiki-gallery img \{[^}]*height: auto/, 'images keep their proportions');
// Entering flies through the scenes; Esc belongs to the open reader, not the site settings dialog.
assert.match(js, /fly\(\{ from: \{ scene: 1, p: 0\.7 \}, to: \{ scene: 2, p: 1 \}/);
assert.match(read('assets/js/app.js'), /\[aria-modal="true"\]:not\(dialog\):not\(\[inert\]\)/);
console.log('Wiki reader: single source, entry points, history/keyboard hooks, unboxed scenes, stops, search form, entries, images, journeys passed.');
