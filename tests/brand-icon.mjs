import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const files = ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon.ico', 'apple-touch-icon.png',
  'teacafe-icon-192.png', 'teacafe-icon-512.png', 'teacafe-icon-maskable-512.png', 'teacafe-og.jpg'];
for (const f of files) assert.ok(existsSync(`dist/image/brand/${f}`), `missing brand asset ${f}`);
assert.ok(existsSync('dist/favicon.ico'), 'root favicon.ico missing');

for (const page of readdirSync('dist').filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(`dist/${page}`, 'utf8');
  if (!/rel="icon"/.test(html)) continue;
  assert.ok(html.includes('/image/brand/favicon-32.png'), `${page}: favicon not updated`);
  assert.ok(html.includes('/image/brand/apple-touch-icon.png'), `${page}: apple-touch-icon not updated`);
  assert.ok(!html.includes('server_icon.png'), `${page}: still references server_icon.png`);
}
const manifest = JSON.parse(readFileSync('dist/site.webmanifest', 'utf8'));
for (const icon of manifest.icons) assert.ok(existsSync(`dist${icon.src}`), `manifest icon missing: ${icon.src}`);
assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'no maskable icon');
assert.ok(readFileSync('dist/assets/js/app.js', 'utf8').includes('/image/brand/teacafe-icon-192.png'), 'header brand icon not updated');
console.log('brand icon ok');
