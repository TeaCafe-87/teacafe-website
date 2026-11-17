// Contract checks for the home ink-fluid cursor effect (Art-Of-Ink project_5 port).
// Pixel behaviour is verified in a browser; this guards the wiring and the safety fallbacks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const js = read('assets/js/ink-fluid.js'), html = read('index.html'), css = read('assets/css/home-journey.css');
// Stable-fluids pipeline: advection, vorticity confinement, pressure projection, ink re-injection.
for (const pass of ['advect', 'splat', 'curl', 'vorticity', 'divergence', 'pressure', 'gradient', 'ink', 'show']) assert.match(js, new RegExp(`${pass}: \``), `missing ${pass} pass`);
assert.match(js, /mix\(1\., \.012, stir\)/, 'calm areas snap back to the live picture, stirred ones re-inject slowly like project_5');
// The ink source is the film plus the live overlay, so the waterfall and birds smear too.
assert.match(js, /uOverlay/);
assert.match(js, /UNPACK_PREMULTIPLY_ALPHA_WEBGL, true/);
// Never blocks scrolling or input; degrades to nothing without WebGL2 / float targets / with reduced motion.
assert.ok(!/preventDefault/.test(js), 'the fluid must not hijack native scrolling');
assert.match(js, /\{ passive: true \}/);
assert.match(js, /getContext\('webgl2'/);
assert.match(js, /EXT_color_buffer_float/);
assert.match(js, /prefers-reduced-motion: reduce/);
// Idle hand-off: the canvas only shows while stirred.
assert.match(js, /is-stirred/);
assert.match(css, /\.ink-fluid\s*\{\s*opacity:\s*0/);
assert.match(css, /\.ink-fluid\.is-stirred\s*\{\s*opacity:\s*1/);
// Load order: overlay and fluid before the driver that attaches them.
const order = ['journey-live.js', 'ink-fluid.js', 'home-journey.js'].map((f) => html.indexOf(f));
assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2]);
assert.ok(!html.includes('hero-ink'), 'the old hero-ink effect is replaced by the fluid');
console.log('Ink fluid pipeline, sources, fallbacks and load order passed.');
