import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { verifyTurnstile } from '../functions/_lib/turnstile.js';
import { onRequestDelete as deleteComment } from '../functions/api/community/comments.js';
import { onRequestGet as getReactions, onRequestPost as react } from '../functions/api/community/reactions.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_community.sql', import.meta.url), 'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0008_community_reactions.sql', import.meta.url), 'utf8'));
sqlite.prepare("INSERT INTO community_posts (id,kind,category,title,body,author_id,author_username,status,created_at,updated_at) VALUES ('post','forum','general','Test','','author','author','published','2026','2026')").run();
sqlite.prepare("INSERT INTO community_comments (id,post_id,author_id,author_username,body,created_at) VALUES ('comment','post','author','author','Test','2026')").run();
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    const bound = values => ({
      first: async () => statement.get(...values) || null,
      all: async () => ({ results: statement.all(...values) }),
      run: async () => statement.run(...values)
    });
    return { ...bound([]), bind: (...values) => bound(values) };
  }
};
const env = { DB, SESSION_SECRET: 'test-secret' };
const bytes = new TextEncoder();
const b64 = input => btoa(String.fromCharCode(...input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function cookie(id) {
  const payload = b64(bytes.encode(JSON.stringify({ id, username: id, exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', bytes.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `teacafe_session=${payload}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.encode(payload))))}`;
}
async function request(method, path, id, body) {
  return new Request('https://teacafe.xyz' + path, {
    method,
    headers: { ...(id ? { Cookie: await cookie(id) } : {}), ...(method !== 'GET' ? { Origin: 'https://teacafe.xyz', 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
assert.equal((await deleteComment({ request: await request('DELETE', '/api/community/comments', 'stranger', { id: 'comment' }), env })).status, 403);
assert.equal((await deleteComment({ request: await request('DELETE', '/api/community/comments', 'author', { id: 'comment' }), env })).status, 200);
assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM community_comments').get().count, 0);
assert.equal((await react({ request: await request('POST', '/api/community/reactions', 'author', { postId: 'post', emoji: 'invalid' }), env })).status, 400);
assert.equal((await react({ request: await request('POST', '/api/community/reactions', 'author', { postId: 'post', emoji: '🍵' }), env })).status, 200);
assert.deepEqual((await (await getReactions({ request: await request('GET', '/api/community/reactions?post=post', 'author'), env })).json()).counts, { '🍵': 1 });
await react({ request: await request('POST', '/api/community/reactions', 'author', { postId: 'post', emoji: '🍵' }), env });
assert.deepEqual((await (await getReactions({ request: await request('GET', '/api/community/reactions?post=post', 'author'), env })).json()).counts, {});
assert.equal(await verifyTurnstile(new Request('https://teacafe.xyz/'), {}, ''), true);
assert.equal(await verifyTurnstile(new Request('https://teacafe.xyz/'), { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }, ''), false);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  assert.equal(options.body.get('secret'), 'secret');
  assert.equal(options.body.get('response'), 'valid-token');
  return Response.json({ success: true, hostname: 'teacafe.xyz' });
};
assert.equal(await verifyTurnstile(new Request('https://teacafe.xyz/'), { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }, 'valid-token'), true);
globalThis.fetch = async () => Response.json({ success: true, hostname: 'other.example' });
assert.equal(await verifyTurnstile(new Request('https://teacafe.xyz/'), { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }, 'valid-token'), false);
globalThis.fetch = originalFetch;
console.log('Comment ownership, reaction toggles and verification gate passed.');
