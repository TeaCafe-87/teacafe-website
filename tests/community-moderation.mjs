import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as submit, onRequestGet as feed } from '../functions/api/community/posts.js';
import { onRequestPost as review, onRequestGet as queue } from '../functions/api/community/moderation.js';
import { onRequestGet as media } from '../functions/api/community/media/[id].js';
import { onRequestGet as members } from '../functions/api/admin/members.js';
import { onRequestGet as authorPosts } from '../functions/api/admin/posts.js';

const db = new DatabaseSync(':memory:');
for (const filename of ['0001_community.sql', '0002_content.sql', '0004_admin.sql']) {
  db.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
}
const DB = {
  prepare(sql) {
    const statement = db.prepare(sql);
    const bound = values => ({
      first: async () => statement.get(...values) || null,
      all: async () => ({ results: statement.all(...values) }),
      run: async () => ({ meta: { changes: statement.run(...values).changes } })
    });
    return { ...bound([]), bind: (...values) => bound(values) };
  },
  batch: async statements => Promise.all(statements.map(statement => statement.run()))
};
const objects = new Map();
const GALLERY_MEDIA = {
  async put(key, stream) { objects.set(key, await new Response(stream).arrayBuffer()); },
  async get(key) { const value = objects.get(key); return value ? { body: new Blob([value]).stream() } : null; },
  async delete(key) { objects.delete(key); }
};
const env = { DB, GALLERY_MEDIA, SESSION_SECRET: 'test-session-secret' };
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function cookie(id) {
  const payload = b64url(enc.encode(JSON.stringify({ id, username: `user-${id}`, global_name: 'Test User', exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `teacafe_session=${payload}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))))}`;
}
const origin = 'https://teacafe.xyz';
function request(path, cookieValue, method = 'GET', body) {
  return new Request(origin + path, { method, headers: { ...(cookieValue ? { Cookie: cookieValue } : {}), ...(method === 'POST' ? { Origin: origin } : {}) }, body });
}
function form(category = 'general', withImage = false) {
  const data = new FormData();
  data.set('kind', category === 'gallery' ? 'gallery' : 'forum');
  data.set('category', category);
  data.set('title', '測試貼文');
  data.set('body', '等待審核');
  if (withImage) data.append('media', new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], 'test.png', { type: 'image/png' }));
  return data;
}

const player = await cookie('123456789012345678');
const admin = await cookie('891516136464723998');
const createdResponse = await submit({ request: request('/api/community/posts', player, 'POST', form('gallery', true)), env });
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.equal(created.status, 'pending');
assert.equal((await (await feed({ request: request('/api/community/posts?kind=gallery'), env })).json()).posts.length, 0);
assert.equal((await media({ request: request('/api/community/media/' + created.post.media[0].id), params: { id: created.post.media[0].id }, env })).status, 404);
assert.equal((await media({ request: request('/api/community/media/' + created.post.media[0].id, player), params: { id: created.post.media[0].id }, env })).status, 200);
assert.equal((await (await queue({ request: request('/api/community/moderation', admin), env })).json()).posts.length, 1);
assert.equal((await queue({ request: request('/api/community/moderation', player), env })).status, 403);
const decision = await review({ request: request('/api/community/moderation', admin, 'POST', JSON.stringify({ postId: created.post.id, decision: 'approve' })), env });
assert.equal(decision.status, 200);
assert.equal((await (await feed({ request: request('/api/community/posts?kind=gallery'), env })).json()).posts.length, 1);
assert.equal((await media({ request: request('/api/community/media/' + created.post.media[0].id), params: { id: created.post.media[0].id }, env })).status, 200);

const forged = await submit({ request: request('/api/community/posts', player, 'POST', form('official')), env });
assert.equal(forged.status, 403);
const official = await submit({ request: request('/api/community/posts', admin, 'POST', form('official')), env });
assert.equal((await official.json()).status, 'published');
assert.equal((await (await feed({ request: request('/api/community/posts?kind=forum'), env })).json()).posts.length, 1);
assert.equal((await (await feed({ request: request('/api/community/posts?kind=forum&category=official'), env })).json()).posts.length, 1);
const anotherPlayer = await cookie('222222222222222222');
const pendingForum = await (await submit({ request: request('/api/community/posts', anotherPlayer, 'POST', form()), env })).json();
assert.equal(pendingForum.status, 'pending');
assert.equal((await review({ request: request('/api/community/moderation', anotherPlayer, 'POST', JSON.stringify({ postId: pendingForum.post.id, decision: 'approve' })), env })).status, 403);
assert.equal((await review({ request: request('/api/community/moderation', admin, 'POST', JSON.stringify({ postId: pendingForum.post.id, decision: 'reject' })), env })).status, 200);
assert.equal((await (await feed({ request: request('/api/community/posts?kind=forum'), env })).json()).posts.length, 1);
assert.equal((await members({ request: request('/api/admin/members', player), env })).status, 403);
db.prepare(`INSERT INTO site_members (discord_id,username,first_login_at,last_login_at,login_count) VALUES (?,?,?,?,?)`).run('123456789012345678', 'test-player', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z', 1);
assert.equal((await (await members({ request: request('/api/admin/members', admin), env })).json()).members[0].post_count, 1);
assert.equal((await (await authorPosts({ request: request('/api/admin/posts?author=123456789012345678', admin), env })).json()).posts[0].status, 'published');
console.log('Community moderation and official publishing checks passed.');
