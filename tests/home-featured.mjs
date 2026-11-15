// Featured wall, feature switches and moderation revisions: API behaviour against a real SQLite schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as publicFeatured } from '../functions/api/featured.js';
import { onRequestGet as publicFeatures } from '../functions/api/site-features.js';
import { onRequestGet as adminFeaturedList, onRequestPost as adminFeatured } from '../functions/api/admin/featured.js';
import { onRequestPost as adminFeatures } from '../functions/api/admin/features.js';
import { onRequestPost as createPost } from '../functions/api/community/posts.js';
import { onRequestPost as comment } from '../functions/api/community/comments.js';
import { onRequestGet as moderationList, onRequestPost as moderate } from '../functions/api/community/moderation.js';

const db = new DatabaseSync(':memory:');
for (const filename of ['0001_community.sql', '0002_content.sql', '0004_admin.sql', '0005_supporters.sql', '0009_featured_and_flags.sql']) {
  db.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
}
const DB = {
  prepare(sql) {
    const statement = db.prepare(sql);
    const bind = values => ({
      first: async () => statement.get(...values) || null,
      all: async () => ({ results: statement.all(...values) }),
      run: async () => ({ meta: { changes: statement.run(...values).changes } })
    });
    return { ...bind([]), bind: (...values) => bind(values) };
  },
  batch: async statements => { for (const statement of statements) await statement.run(); }
};
const env = { DB, SESSION_SECRET: 'test-session-secret', GALLERY_MEDIA: { async put() {}, async delete() {} } };
const origin = 'https://teacafe.xyz';
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function cookie(id) {
  const payload = b64url(enc.encode(JSON.stringify({ id, username: `user-${id}`, exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `teacafe_session=${payload}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))))}`;
}
const request = (path, session = '', method = 'GET', body) => new Request(origin + path, {
  method,
  headers: { ...(session ? { Cookie: session } : {}), ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined
});
const admin = await cookie('891516136464723998');
const player = await cookie('123456789012345678');
const postId = crypto.randomUUID();
const hiddenPostId = crypto.randomUUID();

// Seed: one published gallery post with two images, one hidden post with one image.
db.prepare(`INSERT INTO community_posts(id,kind,category,title,body,author_id,author_username,status,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`).run(postId, 'gallery', 'build', '主城夜景', '內容', 'p1', 'p1', 'published', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
db.prepare(`INSERT INTO community_posts(id,kind,category,title,body,author_id,author_username,status,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`).run(hiddenPostId, 'gallery', 'build', '隱藏貼文', '內容', 'p1', 'p1', 'hidden', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
const insertMedia = (id, post, mime) => db.prepare(
  'INSERT INTO community_media(id,post_id,object_key,mime_type,byte_size,position,created_at) VALUES(?,?,?,?,?,?,?)'
).run(id, post, `media/${id}`, mime, 1000, 0, '2026-11-01T00:00:00Z');
insertMedia('aaaaaaaa-0000-0000-0000-000000000001', postId, 'image/webp');
insertMedia('aaaaaaaa-0000-0000-0000-000000000002', postId, 'video/mp4');
insertMedia('aaaaaaaa-0000-0000-0000-000000000003', hiddenPostId, 'image/webp');

// Public featured: empty but configured by default.
let res = await publicFeatured({ env });
assert.deepEqual((await res.json()).items, []);
res = await publicFeatured({ env: {} });
assert.equal((await res.json()).configured, false);

// Players cannot manage the wall; admins can add only images from published gallery posts.
res = await adminFeatured({ request: request('/api/admin/featured', player, 'POST', { action: 'add', media_id: 'aaaaaaaa-0000-0000-0000-000000000001' }), env });
assert.equal(res.status, 403);
res = await adminFeatured({ request: request('/api/admin/featured', admin, 'POST', { action: 'add', media_id: 'aaaaaaaa-0000-0000-0000-000000000002' }), env });
assert.equal(res.status, 404, 'videos are not featurable');
res = await adminFeatured({ request: request('/api/admin/featured', admin, 'POST', { action: 'add', media_id: 'aaaaaaaa-0000-0000-0000-000000000003' }), env });
assert.equal(res.status, 404, 'hidden posts are not featurable');
res = await adminFeatured({ request: request('/api/admin/featured', admin, 'POST', { action: 'add', media_id: 'aaaaaaaa-0000-0000-0000-000000000001', label: '夜景' }), env });
assert.equal(res.status, 201);
res = await publicFeatured({ env });
let payload = await res.json();
assert.equal(payload.items.length, 1);
assert.equal(payload.items[0].label, '夜景');
assert.ok(payload.items[0].url.startsWith('/api/community/media/'));

// Hiding the source post pulls the photo off the wall without touching featured_photos.
db.prepare("UPDATE community_posts SET status='hidden' WHERE id=?").run(postId);
assert.equal((await (await publicFeatured({ env })).json()).items.length, 0);
db.prepare("UPDATE community_posts SET status='published' WHERE id=?").run(postId);

// Admin list flags broken entries; move and label and remove work.
res = await adminFeaturedList({ request: request('/api/admin/featured', admin), env });
assert.equal((await res.json()).items[0].broken, false);
res = await adminFeatured({ request: request('/api/admin/featured', admin, 'POST', { action: 'label', media_id: 'aaaaaaaa-0000-0000-0000-000000000001', label: '新標籤' }), env });
assert.equal(res.status, 200);
res = await adminFeatured({ request: request('/api/admin/featured', admin, 'POST', { action: 'remove', media_id: 'aaaaaaaa-0000-0000-0000-000000000001' }), env });
assert.equal(res.status, 200);
assert.equal((await (await publicFeatured({ env })).json()).items.length, 0);

// Feature switches: default enabled, admin can pause, players are then refused server-side.
payload = await (await publicFeatures({ env })).json();
assert.equal(payload.features.forum.enabled, true);
res = await adminFeatures({ request: request('/api/admin/features', player, 'POST', { feature: 'forum', enabled: false }), env });
assert.equal(res.status, 403);
res = await adminFeatures({ request: request('/api/admin/features', admin, 'POST', { feature: 'forum', enabled: false, note: '整理中' }), env });
assert.equal(res.status, 200);
payload = await (await publicFeatures({ env })).json();
assert.equal(payload.features.forum.enabled, false);
assert.equal(payload.features.forum.note, '整理中');

const form = new FormData();
form.set('kind', 'forum'); form.set('category', 'general'); form.set('title', '測試'); form.set('body', '內容');
res = await createPost({ request: new Request(origin + '/api/community/posts', { method: 'POST', headers: { Cookie: player, Origin: origin }, body: form }), env });
assert.equal(res.status, 503, 'paused forum refuses player posts');
assert.equal((await res.json()).error, 'feature_paused');
res = await comment({ request: request('/api/community/comments', player, 'POST', { postId, body: '留言' }), env });
assert.notEqual(res.status, 503, 'gallery still enabled: comments are not pause-refused');
res = await adminFeatures({ request: request('/api/admin/features', admin, 'POST', { feature: 'gallery', enabled: false }), env });
assert.equal(res.status, 200);
res = await comment({ request: request('/api/community/comments', player, 'POST', { postId, body: '第二則留言' }), env });
assert.equal(res.status, 503, 'paused gallery refuses comments');
res = await adminFeatures({ request: request('/api/admin/features', admin, 'POST', { feature: 'gallery', enabled: true }), env });
res = await adminFeatures({ request: request('/api/admin/features', admin, 'POST', { feature: 'forum', enabled: true }), env });

// Paused featured flag empties the public wall.
await adminFeatures({ request: request('/api/admin/features', admin, 'POST', { feature: 'featured', enabled: false }), env });
payload = await (await publicFeatured({ env })).json();
assert.equal(payload.enabled, false);
await adminFeatures({ request: request('/api/admin/features', admin, 'POST', { feature: 'featured', enabled: true }), env });

// Moderation: decided view lists past decisions and revise flips them.
res = await moderationList({ request: request('/api/community/moderation?view=decided', admin), env });
payload = await res.json();
assert.ok(payload.posts.some(post => post.id === postId));
res = await moderate({ request: request('/api/community/moderation', admin, 'POST', { postId, decision: 'reject' }), env });
assert.equal(res.status, 409, 'without revise, decided posts stay decided');
res = await moderate({ request: request('/api/community/moderation', admin, 'POST', { postId, decision: 'reject', revise: true }), env });
assert.equal(res.status, 200);
assert.equal(db.prepare('SELECT status FROM community_posts WHERE id=?').get(postId).status, 'hidden');
res = await moderate({ request: request('/api/community/moderation', admin, 'POST', { postId, decision: 'approve', revise: true }), env });
assert.equal(res.status, 200);
assert.equal(db.prepare('SELECT status FROM community_posts WHERE id=?').get(postId).status, 'published');

// Home markup carries the wall section and app.js carries the new controls.
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
assert.match(html, /data-featured-section[\s\S]*data-featured-wall/);
const app = readFileSync(new URL('../dist/assets/js/app.js', import.meta.url), 'utf8');
for (const token of ['TeaVolumeBars', 'data-volume-bars', 'prm-switch', 'vol-reel', 'beginUptime']) assert.ok(app.includes(token), `app.js missing ${token}`);
assert.ok(!app.includes('mc-menu-screen'), 'legacy Minecraft settings menu must be gone');
const gatePages = ['forum', 'gallery', 'wiki', 'market'];
for (const page of gatePages) {
  const source = readFileSync(new URL(`../dist/${page}.html`, import.meta.url), 'utf8');
  assert.ok(source.includes(`data-feature-gate="${page}"`) && source.includes('feature-gate.js'), `${page}.html is not gated`);
}
console.log('Featured wall, feature switches, pause gates and moderation revisions passed.');
