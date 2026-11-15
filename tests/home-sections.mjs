// Home page content sections: structure, live-data wiring and safe rendering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const html = read('index.html'), css = read('assets/css/home-sections.css');
const js = read('assets/js/home-sections.js'), app = read('assets/js/app.js');

// Every section the home page promises is present and anchored.
for (const id of ['home', 'server-info', 'about', 'features', 'join', 'play', 'news', 'gallery', 'faq', 'join-cta']) {
  assert.ok(html.includes(`id="${id}"`), `index.html is missing section #${id}`);
}

// Live data, not hard-coded content: the status hooks app.js fills, the news list it renders into,
// and the gallery host home-sections.js fills from the community API.
for (const hook of ['data-server-status', 'data-server-players', 'data-server-version', 'data-server-uptime', 'data-server-address', 'data-online-player-heads']) {
  assert.ok(html.includes(hook), `index.html lost the ${hook} hook`);
}
assert.match(html, /data-news-list[^>]*data-news-limit="3"/);
assert.match(html, /data-home-gallery/);
assert.ok(!/\d+\s*\/\s*60|線上人數[^<]*\d/.test(html.replace(/-- \/ --/g, '')), 'no invented player counts in the markup');

// app.js keeps one news path: the limit is optional, so the news page still renders every item.
assert.match(app, /dataset\.newsLimit/);
assert.match(app, /目前還沒有公告/);
const newsPage = read('news.html');
assert.ok(!newsPage.includes('data-news-limit'), 'the news page must not be capped');

// Gallery preview: same-origin media only, text set as text (never innerHTML), and a state for every outcome.
assert.match(js, /const MEDIA_PREFIX = '\/api\/community\/media\/'/);
assert.match(js, /startsWith\(MEDIA_PREFIX\)/);
assert.ok(!/innerHTML/.test(js), 'home-sections.js must not use innerHTML on API data');
for (const state of ['相冊尚未完成設定', '還沒有相冊貼文', '暫時無法讀取相冊']) assert.ok(js.includes(state), `missing gallery state: ${state}`);
assert.match(js, /configured === false/);

// Reveal animation is opt-out under reduced motion, and a span-2 card never splits the 1-column grid.
assert.match(js, /prefers-reduced-motion: reduce/);
assert.match(js, /reveal-off/);
assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.feature-lead \{ grid-column: auto/);
// styles.css makes .section-head a flex row; the home page must override it.
assert.match(css, /\.section-head \{ display: block/);
console.log('Home sections structure, live-data wiring and safe rendering passed.');
