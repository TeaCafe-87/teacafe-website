// Contract checks for the v2 background journey (Art-Of-Ink painting):
// two films (desktop / portrait), their per-frame camera data, and the live
// overlay that keeps the waterfall, boat and birds moving forward in time.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const p = (f) => new URL(`../dist/${f}`, import.meta.url);
const read = (f) => readFileSync(p(f), 'utf8');

for (const fmt of ['desktop', 'portrait']) {
  const film = statSync(p(`assets/video/journey-${fmt}.mp4`)).size;
  assert.ok(film > 500_000 && film < 8_000_000, `journey-${fmt}.mp4 is ${film} bytes`);
  const cam = JSON.parse(read(`assets/video/journey-${fmt}.camera.json`));
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

const js = read('assets/js/journey-live.js');
assert.match(js, /requestVideoFrameCallback/, 'overlay follows the presented film frame');
assert.match(js, /prefers-reduced-motion/);
assert.ok(!/\.play\(\)/.test(js), 'the overlay never plays the film');
assert.match(js, /global\.TeaJourneyLive = \{ attach \}/);

const html = read('journey-preview.html');
assert.match(html, /name="robots" content="noindex"/);
assert.ok(html.includes('/assets/js/journey-live.js') && html.includes('journey-portrait'));

console.log('Journey v2 films, camera data, overlay and preview passed.');
