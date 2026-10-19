import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet } from '../functions/api/site-sections.js';
import { onRequestPost } from '../functions/api/admin/site-sections.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0007_site_sections.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...values) { return {
      first: async () => statement.get(...values) || null,
      all: async () => ({ results: statement.all(...values) }),
      run: async () => ({ meta: { changes: statement.run(...values).changes } })
    }; } };
  },
  batch: async statements => Promise.all(statements.map(statement => statement.run()))
};
const env = { DB, SESSION_SECRET: 'section-test-secret' };
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function session(id) {
  const payload = b64(encoder.encode(JSON.stringify({ id, username: id, exp: Math.floor(Date.now()/1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
  return `teacafe_session=${payload}.${signature}`;
}
const origin = 'https://teacafe.xyz';
function post(cookie, data) {
  return onRequestPost({ env, request: new Request(origin + '/api/admin/site-sections', {
    method: 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data)
  }) });
}
async function list(page = 'wiki') {
  const response = await onRequestGet({ env, request: new Request(origin + '/api/site-sections?page=' + page) });
  return response.json();
}
const player = await session('123456789012345678');
const official = await session('891516136464723998');
const base = { page: 'wiki', anchor: 'start', title: '新手補充', body: '第一段內容' };
assert.equal((await post(null, base)).status, 403);
assert.equal((await post(player, base)).status, 403);
assert.equal((await post(official, { ...base, anchor: 'unknown' })).status, 400);
const first = await (await post(official, base)).json();
const second = await (await post(official, { ...base, title: '另一段' })).json();
assert.equal((await list()).items.length, 2);
assert.deepEqual((await list()).items.map(item => item.id), [first.id, second.id]);
assert.equal((await post(player, { ...base, id: first.id, title: '竄改' })).status, 403);
assert.equal((await post(official, { page: 'wiki', anchor: 'start', action: 'reorder', ids: [second.id, first.id] })).status, 200);
assert.deepEqual((await list()).items.map(item => item.id), [second.id, first.id]);
assert.equal((await post(official, { ...base, id: first.id, body: '更新後內容' })).status, 200);
assert.equal((await list()).items.find(item => item.id === first.id).body, '更新後內容');
assert.equal((await post(official, { page: 'wiki', anchor: 'start', action: 'delete', id: first.id })).status, 200);
assert.equal((await list()).items.length, 1);
assert.equal((await post(official, { page: 'wiki', anchor: 'start', action: 'reorder', ids: [first.id, second.id] })).status, 409);
console.log('Section authorization, creation, update, order and deletion checks passed.');
