// Contract checks for the home hero ink effect (structure, layering, reduced motion, anchoring).
// Pixel-level behaviour is verified in a real browser; this guards the wiring against regressions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const html = read('index.html'), js = read('assets/js/hero-ink.js'), css = read('assets/css/home-ink.css'), app = read('assets/js/app.js');

// Markup: real DOM headline (accessible, selectable) + decorative, non-interactive canvas.
assert.match(html, /<h1[^>]*data-ink-title[^>]*>茶咖暖居<\/h1>/);
assert.match(html, /<canvas[^>]*data-ink-canvas[^>]*aria-hidden="true"/);
assert.match(html, /data-copy="SERVER_IP"/);
assert.ok(html.includes('/assets/js/hero-ink.js') && html.includes('/assets/css/home-ink.css'));
for (const gone of ['site-intro', 'home-scene-video', 'home-scene.js', 'home-motion.css']) assert.ok(!html.includes(gone), `index.html must not reference ${gone}`);
assert.ok(!app.includes('home-motion.css'), 'app.js must not reference the removed video-scene stylesheet');

// Layering: black headline (1) < canvas (2) < other UI (3); canvas never intercepts input.
const z = (sel) => Number(new RegExp(`${sel}[^}]*z-index:\\s*(\\d+)`).exec(css)?.[1]);
assert.ok(z('\\.ink-title') < z('\\.ink-canvas') && z('\\.ink-canvas') < z('\\.ink-kicker, \\.ink-sub, \\.ink-actions'));
assert.match(css, /\.ink-canvas\s*\{[^}]*pointer-events:\s*none/);
// The hero floats over the journey painting: its own background must stay transparent.
assert.match(css, /\.ink-hero\s*\{[^}]*background:\s*transparent/);
assert.match(css, /\.ink-title\s*\{[\s\S]*?font:\s*900[\s\S]*?color:\s*#000/);

// Colour field is page-anchored: gradient is built from hero size only, never from pointer/head state.
const gradientLine = /createLinearGradient\([^)]*\)/.exec(js)?.[0] || '';
assert.ok(gradientLine && !/ptr|head|clientX|clientY/.test(gradientLine), 'gradient must not depend on the cursor');
for (const stop of ['#22303f', '#3c566d', '#546274', '#6e5a3c']) assert.ok(js.includes(stop), `ink palette lost stop ${stop}`);
// The cursor ink blends out as the journey begins, separately from the video.
assert.match(js, /applyScrollFade/);
assert.match(css, /\.ink-canvas\s*\{[^}]*transition:\s*opacity/);
// Compositing: ink mask -> colour only inside it -> white glyphs only inside it.
const order = ['source-in', 'source-atop'].map((m) => js.indexOf(`'${m}'`));
assert.ok(order[0] > 0 && order[1] > order[0]);

// Reduced motion and lifecycle.
assert.match(js, /prefers-reduced-motion:\s*reduce/);
assert.match(js, /dataset\.motion === 'reduced'/);
assert.match(js, /function disable\(\)[\s\S]*?cancelAnimationFrame[\s\S]*?clearRect/);
assert.match(js, /IntersectionObserver/);
assert.match(js, /document\.hidden/);
console.log('Hero ink structure, layering, anchoring and reduced-motion contract passed.');
