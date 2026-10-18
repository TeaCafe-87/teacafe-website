import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as authMe } from '../functions/api/auth/me.js';
import { onRequestPost as share } from '../functions/api/community/shares.js';
import { onRequestGet as posts, onRequestPost as createPost } from '../functions/api/community/posts.js';
import { onRequestGet as contentList, onRequestPost as contentSave } from '../functions/api/admin/content.js';
import { onRequestGet as publicNews } from '../functions/api/news.js';
import { onRequestGet as publicWiki } from '../functions/api/wiki/entries.js';
import { onRequestGet as publicPass } from '../functions/api/pass/summary.js';
import { onRequestGet as serverStatus } from '../functions/api/server/status.js';

const db = new DatabaseSync(':memory:');
for (const filename of ['0001_community.sql', '0002_content.sql', '0004_admin.sql', '0005_supporters.sql']) {
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
const objects = new Map();
const env = {
  DB,
  SESSION_SECRET: 'test-session-secret',
  GALLERY_MEDIA: {
    async put(key, stream) { objects.set(key, await new Response(stream).arrayBuffer()); },
    async delete(key) { objects.delete(key); }
  }
};
const origin = 'https://teacafe.xyz';
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function cookie(id) {
  const payload = b64url(enc.encode(JSON.stringify({ id, username: `user-${id}`, exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `teacafe_session=${payload}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))))}`;
}
function request(path, session = '', method = 'GET', body) {
  return new Request(origin + path, { method, headers: { ...(session ? { Cookie: session } : {}), ...(method === 'POST' ? { Origin: origin } : {}) }, body });
}
const admin = await cookie('891516136464723998');
const player = await cookie('123456789012345678');

// A malformed signature must never turn /api/auth/me into a server error.
const malformed = await authMe({ request: request('/api/auth/me', 'teacafe_session=abc.!!!'), env });
assert.equal(malformed.status, 200);
assert.equal((await malformed.json()).authenticated, false);

// Shares are counted once per signed-in user and post in 24 hours.
db.prepare(`INSERT INTO community_posts(id,kind,category,title,body,author_id,author_username,status,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`).run('published-1', 'forum', 'general', '分享測試', '內容', 'author', 'author', 'published', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z');
const shareBody = () => JSON.stringify({ postId: 'published-1' });
assert.equal((await share({ request: request('/api/community/shares', '', 'POST', shareBody()), env })).status, 401);
assert.equal((await share({ request: request('/api/community/shares', player, 'POST', shareBody()), env })).status, 200);
assert.equal((await share({ request: request('/api/community/shares', player, 'POST', shareBody()), env })).status, 429);
assert.equal(db.prepare('SELECT COUNT(*) AS total FROM community_shares').get().total, 1);

// A large count of tiny files is rejected before any R2 write.
const upload = new FormData();
upload.set('kind', 'gallery'); upload.set('title', '許多附件'); upload.set('body', '測試');
for (let index = 0; index < 31; index++) {
  upload.append('media', new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], `${index}.png`, { type: 'image/png' }));
}
const tooMany = await createPost({ request: request('/api/community/posts', player, 'POST', upload), env });
assert.equal(tooMany.status, 413);
assert.equal((await tooMany.json()).error, 'too_many_files');
assert.equal(objects.size, 0);

// Search reaches older posts, and cursor paging does not skip equal timestamps.
const insert = db.prepare(`INSERT INTO community_posts(id,kind,category,title,body,author_id,author_username,status,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`);
for (let index = 0; index < 25; index++) insert.run(`search-${String(index).padStart(2, '0')}`, 'forum', 'general', `Needle ${index}`, 'Find me', 'author', 'author', 'published', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z');
const first = await (await posts({ request: request('/api/community/posts?kind=forum&q=needle'), env })).json();
assert.equal(first.posts.length, 20);
assert.ok(first.next_cursor);
const second = await (await posts({ request: request(`/api/community/posts?kind=forum&q=needle&cursor=${encodeURIComponent(first.next_cursor)}`), env })).json();
assert.equal(second.posts.length, 5);
assert.equal(new Set([...first.posts, ...second.posts].map(post => post.id)).size, 25);

// Only official accounts can edit D1 content; published records appear publicly.
const save = (type, item, session = admin) => contentSave({ request: request('/api/admin/content', session, 'POST', JSON.stringify({ type, item })), env });
assert.equal((await save('news', { title: '禁止', body: '不應發布', status: 'published' }, player)).status, 403);
assert.equal((await save('news', { title: '維護公告', body: '今晚維護', status: 'published', published_at: '2026-10-18T10:00:00Z' })).status, 200);
assert.equal((await (await publicNews({ env })).json()).items[0].title, '維護公告');
assert.equal((await save('wiki', { slug: 'new-guide', section: 'start', title: '新手提示', body: '完整說明', summary: '摘要', status: 'published' })).status, 200);
assert.equal((await (await publicWiki({ env })).json()).entries[0].body, '完整說明');
assert.equal((await save('pass', { title: '第一季', xp_per_level: 1000, max_level: 30, active: '1' })).status, 200);
assert.equal((await (await publicPass({ env })).json()).season.title, '第一季');
assert.equal((await (await contentList({ request: request('/api/admin/content?type=news', player), env })).status), 403);

// The server lookup uses the Minecraft address displayed on the homepage.
const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
let statusLookup = '';
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
globalThis.fetch = async url => { statusLookup = String(url); return Response.json({ online: false }); };
try {
  await serverStatus({ request: request('/api/server/status'), env, waitUntil() {} });
  assert.ok(statusLookup.includes('mc.teacafe.xyz'));
} finally {
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
}

const redirects = readFileSync(new URL('../dist/_redirects', import.meta.url), 'utf8');
for (const route of ['admin', 'supporters', 'careers', 'market']) assert.ok(!redirects.includes(`/${route} /${route}.html 200`));
const musicScript = readFileSync(new URL('../dist/assets/js/app.js', import.meta.url), 'utf8');
const musicFiles = [...musicScript.matchAll(/\{ file: "([^"/]+\.mp3)", name: /g)].map(match => match[1]);
assert.equal(musicFiles.length, 7);
for (const name of musicFiles) assert.ok(statSync(new URL(`../dist/audio/${name}`, import.meta.url)).size > 100000);
console.log('Page routing, sharing, uploads, search, content management, and session checks passed.');
