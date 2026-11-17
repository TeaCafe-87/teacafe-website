// Contract checks for the v2 background journey (Art-Of-Ink painting):
// two films (desktop / portrait), their per-frame camera data, and the live
// overlay that keeps the waterfall, boat and birds moving forward in time.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const p = (f) => new URL(`../dist/${f}`, import.meta.url);
const read = (f) => readFileSync(p(f), 'utf8');

for (const name of ['desktop', 'portrait', 'night-desktop', 'night-portrait']) {
  const fmt = name;
  const film = statSync(p(`assets/video/journey-${fmt}.mp4`)).size;
  assert.ok(film > 500_000 && film < 8_000_000, `journey-${fmt}.mp4 is ${film} bytes`);
  const cam = JSON.parse(read(`assets/video/journey-${fmt}.camera.json`));
  assert.equal(cam.theme, name.startsWith('night') ? 'night' : 'day', `${fmt}: theme tag`);
  for (const grid of ['occ12', 'occAll']) assert.equal(cam[grid].length, cam.frames, `${fmt}: ${grid} per frame`);
  if (cam.theme === 'night') assert.equal(cam.moon.vis.length, cam.frames, `${fmt}: moon visibility per frame`);
  // acts 3 -> 4 fly through the arch: the camera passes the main peak's depth (4.6)
  assert.ok(cam.track[cam.frames - 1][2] > 4.6, `${fmt}: camera ends beyond the bridge`);
  assert.equal(cam.track.length, cam.frames, `${fmt}: one camera per frame`);
  assert.equal(cam.occ.length, cam.frames, `${fmt}: one occlusion row per frame`);
  assert.equal(cam.fallVis.length, cam.frames);
  assert.equal(cam.occ[0].length, cam.occGrid[0] * cam.occGrid[1]);
  for (const row of [cam.track[0], cam.track[cam.frames - 1]]) assert.equal(row.length, 4);
  // act 1 is the untouched painting: camera at rest, waterfall gated in later
  assert.deepEqual(cam.track[0].slice(2), [0, 1]);
  assert.ok(cam.fallGate[0] > 0.05);
  assert.ok(Array.isArray(cam.wash) && cam.wash.length === 3, `${fmt}: three half-blank acts`);
  statSync(p(`assets/video/journey-${fmt}-start.jpg`));
}

const live = JSON.parse(read('assets/video/journey-live.json'));
assert.ok(live.birds.length >= 10 && live.boat && live.waterfall && live.stream);
statSync(p('assets/video/journey-sprites.png'));
statSync(p('assets/video/journey-grain.png'));
statSync(p('assets/video/journey-sprites-night.png'));

const js = read('assets/js/journey-live.js');
assert.match(js, /requestVideoFrameCallback/, 'overlay follows the presented film frame');
assert.match(js, /prefers-reduced-motion/);
assert.ok(!/\.play\(\)/.test(js), 'the overlay never plays the film');
assert.match(js, /global\.TeaJourneyLive = \{ attach \}/);
for (const fn of ['drawStars', 'drawFireflies', 'drawMist', 'drawShimmer', 'drawUnderArch']) assert.ok(js.includes(fn), `overlay lost ${fn}`);

const html = read('journey-preview.html');
assert.match(html, /name="robots" content="noindex"/);
assert.ok(html.includes('/assets/js/journey-live.js') && html.includes('journey-night-') && html.includes('data-theme="night"'));

console.log('Journey v2 films, camera data, overlay and preview passed.');
