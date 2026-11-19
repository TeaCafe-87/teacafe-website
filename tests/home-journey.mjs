// Contract checks for the home scroll-journey: a fixed background video whose
// playback position follows scroll progress, with poster/reduced-motion
// fallbacks.  Frame-level behaviour is verified in a real browser; this guards
// the wiring against regressions.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const html = read('index.html'), js = read('assets/js/home-journey.js'), css = read('assets/css/home-journey.css');

// Markup: journey block wraps the scenes, the backdrop is decorative, the
// video is muted/playsinline with a real poster image.
assert.match(html, /class="journey" data-journey/);
assert.match(html, /<video[^>]*data-journey-video[^>]*muted[^>]*playsinline/);
// The home poster has no default src: the theme is known first, so night never flashes day.
assert.match(html, /<img alt="" class="journey-poster" decoding="async"\/>/);
// Opening gate: decided before first paint, home holds a loader until the film is ready.
const gate = read('assets/js/intro-gate.js');
assert.ok(html.indexOf('intro-gate.js') < html.indexOf('class="site-intro"'), 'the gate runs before the intro paints');
assert.match(gate, /intro-wait/);
assert.match(gate, /theme-night/);
assert.match(js, /teaIntro\.go\(\)/);
assert.match(read('assets/css/teacafe-cinematic.css'), /body:not\(\.intro-play\) \.site-intro, body:not\(\.intro-play\) \.site-intro \* \{ animation: none !important; \}/);
assert.match(read('assets/css/teacafe-cinematic.css'), /tea-intro-ring-erase 1\.5s linear \.30s/, 'the ring erases over the side lines\' exact window');
for (const page of ['rules', 'news', 'wiki', 'forum', 'gallery', 'supporters', 'careers', 'market', 'index']) {
  assert.ok(read(`${page}.html`).includes('/assets/js/intro-gate.js'), `${page}: intro gate`);
}
// Player scroll, live status fallbacks, footer seal back to top.
assert.match(html, /data-player-scroll data-state="loading"/);
assert.match(read('assets/js/app.js'), /data-to-top/);
const status = readFileSync(new URL('../functions/api/server/status.js', import.meta.url), 'utf8');
assert.match(status, /MINECRAFT_STATUS_ADDRESS/);
assert.match(status, /fromMcstatus, fromMcsrvstat/);
// Home picks the v2 four-act film (day/night, desktop/portrait) and drives the live overlay + ink fluid.
assert.match(html, /data-journey data-film-set/);
assert.match(html, /<canvas class="journey-overlay" data-journey-live>/);
assert.match(html, /<canvas class="ink-fluid" data-ink-fluid>/);
for (const act of ['data-p="0.31,0.41"', 'data-p="0.58,0.67"', 'data-p="0.9,1"']) assert.ok(html.includes(act), `act anchor ${act} missing`);
assert.match(js, /journey-night-/);
assert.match(js, /Asia\/Taipei/);
assert.match(js, /teacafe-theme/);
// Content pages ride the v1 film as a fixed, scroll-scrubbed background, until a page gets its own
// scene (scroll-scene.js): the Wiki has its Blender flight, the others still share the film.
for (const page of ['rules', 'news', 'forum', 'gallery', 'supporters', 'careers', 'market']) {
  const doc = read(`${page}.html`);
  assert.match(doc, /<main class="page[^"]*" data-journey><div class="page-backdrop" aria-hidden="true">/, `${page}: backdrop`);
  assert.ok(doc.includes('src="/assets/video/journey.mp4"') && doc.includes('/assets/js/home-journey.js'), `${page}: film + driver`);
}
{
  const wiki = read('wiki.html');
  assert.match(wiki, /<section class="scroll-scene" data-scroll-scene="\/data\/scenes\/wiki-01\.json"/, 'wiki: own scene');
  for (const js of ['ink-fluid.js', 'scene-live.js', 'scroll-scene.js', 'scroll-motion.js', 'intro-gate.js']) assert.ok(wiki.includes(`/assets/js/${js}`), `wiki: ${js}`);
  assert.ok(!wiki.includes('/assets/js/home-journey.js') && !wiki.includes('journey.mp4'), 'wiki: no shared film under its scene');
  assert.match(wiki, /data-scene-world/);
  assert.match(wiki, /data-scene-fluid/);
}
assert.match(html, /class="journey-backdrop" aria-hidden="true"/);
assert.ok(html.includes('/assets/js/home-journey.js') && html.includes('/assets/css/home-journey.css'));
// Every journey scene stays inside the journey block so scroll progress maps to film time.
const journeyPart = html.slice(html.indexOf('data-journey'), html.indexOf('data-featured-section'));
for (const id of ['home', 'server-info', 'about', 'features', 'play', 'join', 'join-cta']) {
  assert.ok(journeyPart.includes(`id="${id}"`), `scene #${id} left the journey block`);
}

// The film is scrubbed, never played: playback position follows scroll in both
// directions and holds when scrolling stops.
assert.match(js, /video\.pause\(\)/);
assert.ok(!/video\.play\(\)/.test(js), 'the journey video must never autoplay');
assert.match(js, /currentTime/);
assert.match(js, /getBoundingClientRect/);
// Reduced motion / load errors fall back to the still painting.
assert.match(js, /prefers-reduced-motion:\s*reduce/);
assert.match(js, /dataset\.motion === 'reduced'/);
assert.match(js, /addEventListener\('error'/);
assert.match(css, /\.journey-still \.journey-video, [^{]*\{\s*display:\s*none/);

// Backdrop: fixed full-viewport cover behind the content, hidden once the
// archive has scrolled over it.
assert.match(css, /\.journey-backdrop\s*\{[^}]*position:\s*fixed/);
assert.match(css, /\.journey-poster, \.journey-video, \.journey-overlay, \.ink-fluid\s*\{[^}]*object-fit:\s*cover/);
assert.match(css, /\.journey-done \.journey-backdrop\s*\{[^}]*visibility:\s*hidden/);

// The film itself ships with the page and stays light enough for a background.
const film = statSync(new URL('../dist/assets/video/journey.mp4', import.meta.url));
assert.ok(film.size > 500_000, 'journey.mp4 looks truncated');
assert.ok(film.size < 9_000_000, `journey.mp4 is ${film.size} bytes; keep the background film under ~9 MB`);

console.log('Home journey wiring, scrub contract, fallbacks and film size passed.');
