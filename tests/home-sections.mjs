// Home page sections: structure, live-data wiring, scene stepping, titles and the seal pass.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const html = read('index.html'), css = read('assets/css/home-sections.css');
const js = read('assets/js/home-sections.js'), app = read('assets/js/app.js');
const journey = read('assets/js/home-journey.js'), hero = read('assets/css/home-ink.css'), ui = read('assets/css/site-ui.css');

// The home page is the journey: hero plus six scenes. News, gallery and FAQ live on their own pages.
for (const id of ['home', 'server-info', 'about', 'features', 'play', 'join', 'join-cta']) {
  assert.ok(html.includes(`id="${id}"`), `index.html is missing section #${id}`);
}
for (const id of ['news', 'gallery', 'faq']) assert.ok(!html.includes(`id="${id}"`), `#${id} no longer belongs on the home page`);
assert.ok(!html.includes('data-news-list') && !html.includes('data-home-gallery'));

// Live server status hooks app.js fills.
for (const hook of ['data-server-status', 'data-server-players', 'data-server-version', 'data-server-uptime', 'data-server-address', 'data-online-player-heads']) {
  assert.ok(html.includes(hook), `index.html lost the ${hook} hook`);
}
assert.ok(!/\d+\s*\/\s*60|線上人數[^<]*\d/.test(html.replace(/-- \/ --/g, '')), 'no invented player counts in the markup');

// app.js keeps one news path for the news page, uncapped.
assert.match(app, /dataset\.newsLimit/);
assert.ok(!read('news.html').includes('data-news-limit'), 'the news page must not be capped');

// Hero: title only, trimmed tagline, no scroll cue, no kicker; the copy action is the seal pass.
assert.match(html, /<h1 class="ink-title">茶咖暖居<\/h1>/);
assert.match(html, /<p class="ink-sub">一個以休閒、生存、寵物、農作、釣魚與社交為主的原味生存伺服器<\/p>/);
assert.ok(!html.includes('ink-scroll-cue') && !html.includes('ink-kicker') && !html.includes('複製 IP'));
assert.equal((html.match(/class="ink-pass" type="button" data-copy="SERVER_IP" data-stamp/g) || []).length, 2);
assert.match(js, /\[data-stamp\]/);
assert.match(hero, /\.ink-title \{[^}]*white-space: nowrap/);

// Featured wall: same-origin media only, text set as text (never innerHTML).
assert.match(js, /const MEDIA_PREFIX = '\/api\/community\/media\/'/);
assert.ok(js.indexOf('const MEDIA_PREFIX') < js.indexOf('startsWith(MEDIA_PREFIX)'), 'declare the media prefix before the featured wall uses it');
assert.ok(!/innerHTML/.test(js), 'home-sections.js must not use innerHTML on API data');

// One scroll gesture = the next scene; text fields and dialogs keep their own scrolling.
// The gestures live in journey-nav.js, shared with the scroll-scene pages (scene-journey.js).
const nav = read('assets/js/journey-nav.js');
assert.match(nav, /addEventListener\('wheel'[\s\S]*?preventDefault[\s\S]*?\{ passive: false \}/);
assert.match(nav, /addEventListener\('keydown'/);
assert.match(nav, /dialog\[open\]/);
assert.match(journey, /window\.TeaJourneyNav\(\{/, 'home steps through journey-nav.js');
assert.match(journey, /if \(!filmSet \|\| !window\.TeaJourneyNav\) return;/, 'stepping is home-only');
assert.ok(read('index.html').indexOf('journey-nav.js') < read('index.html').indexOf('home-journey.js'), 'journey-nav.js loads before home-journey.js');

// Titles: brush calligraphy font, shipped renamed under the OFL, and not selectable by accident.
assert.match(ui, /@font-face \{ font-family: "TeaCafe Shufa"; src: url\(\/assets\/fonts\/teacafe-shufa\.woff2\)/);
assert.ok(statSync(new URL('../dist/assets/fonts/teacafe-shufa.woff2', import.meta.url)).size < 200_000);
assert.match(read('assets/fonts/LICENSE-teacafe-shufa.txt'), /Reserved Font Name Bakudai/);
assert.match(ui, /user-select: none/);
assert.match(ui, /word-break: keep-all/);

// The topbar has no hamburger button: phones get a swipeable link row instead.
assert.ok(!app.includes('data-mobile') && !app.includes('mobile-menu'));
assert.match(read('assets/css/site-refresh.css'), /\.topbar \.topnav\{display:flex;order:3/);

// Reveal animation is opt-out under reduced motion.
assert.match(js, /prefers-reduced-motion: reduce/);
assert.match(js, /reveal-off/);
assert.match(css, /\.section-head \{ display: block/);
console.log('Home sections, scene stepping, titles, seal pass and wiring passed.');
