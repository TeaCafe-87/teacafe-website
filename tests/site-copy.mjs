import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet } from '../functions/api/site-copy.js';
import { onRequestPost } from '../functions/api/admin/site-copy.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0006_site_copy.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...values) { return {
      all: async () => ({ results: statement.all(...values) }),
      run: async () => ({ meta: { changes: statement.run(...values).changes } })
    }; } };
  }
};
const env = { DB, SESSION_SECRET: 'copy-test-secret' };
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
  return onRequestPost({ env, request: new Request(origin + '/api/admin/site-copy', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie },
    body: JSON.stringify(data)
  }) });
}
function get(page) {
  return onRequestGet({ env, request: new Request(origin + '/api/site-copy?page=' + page) });
}
const player = await session('123456789012345678');
const official = await session('891516136464723998');
const item = { page: 'rules', key: 'rules:abc123:1', value: '管理員更新的規則' };
assert.equal((await post(player, item)).status, 403);
assert.equal((await get('rules')).status, 200);
assert.deepEqual((await (await get('rules')).json()).items, []);
assert.equal((await post(official, item)).status, 200);
assert.equal((await (await get('rules')).json()).items[0].value, item.value);
assert.equal((await post(official, { ...item, value: '' })).status, 400);
assert.equal((await post(official, { ...item, reset: true })).status, 200);
assert.deepEqual((await (await get('rules')).json()).items, []);
console.log('Site copy access, publishing and reset checks passed.');
