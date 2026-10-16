import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as callback } from '../functions/api/auth/callback.js';
import { onRequestGet as supporters } from '../functions/api/supporters.js';
import { onRequestGet as adminList, onRequestPost as addSupporter } from '../functions/api/admin/supporters.js';
import { onRequestGet as market } from '../functions/api/market.js';

const request = (url, cookie = '') => new Request(url, { headers: cookie ? { Cookie: cookie } : {} });
const stateCookie = 'teacafe_oauth_state=matching; teacafe_return=%2Fforum.html';
const env = { DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: 'https://teacafe.xyz/api/auth/callback', SESSION_SECRET: 'test-secret' };
const cancelled = await callback({ request: request('https://teacafe.xyz/api/auth/callback?error=access_denied&state=matching', stateCookie), env });
assert.equal(cancelled.status, 302);
assert.equal(cancelled.headers.get('Location'), 'https://teacafe.xyz/forum.html?auth=cancelled');
assert.ok(!cancelled.headers.get('Set-Cookie')?.includes('teacafe_session='));
const mismatch = await callback({ request: request('https://teacafe.xyz/api/auth/callback?code=abc&state=wrong', stateCookie), env });
assert.equal(mismatch.status, 302);
assert.equal(new URL(mismatch.headers.get('Location')).searchParams.get('auth'), 'expired');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{}', { status: 400 });
try {
  const failed = await callback({ request: request('https://teacafe.xyz/api/auth/callback?code=abc&state=matching', stateCookie), env });
  assert.equal(new URL(failed.headers.get('Location')).searchParams.get('auth'), 'failed');
} finally { globalThis.fetch = originalFetch; }

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0005_supporters.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { const statement = db.prepare(sql); return { bind: (...values) => ({ all: async () => ({ results: statement.all(...values) }), run: async () => statement.run(...values) }), all: async () => ({ results: statement.all() }) }; } };
const supporterEnv = { DB, SESSION_SECRET: env.SESSION_SECRET };
const bytes = new TextEncoder().encode(JSON.stringify({ id: '891516136464723998', username: 'admin', exp: Math.floor(Date.now() / 1000) + 1000 }));
const payload = btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const session = `teacafe_session=${payload}.${sig}`;
const add = await addSupporter({ request: new Request('https://teacafe.xyz/api/admin/supporters', { method: 'POST', headers: { Cookie: session, Origin: 'https://teacafe.xyz', 'Content-Type': 'application/json' }, body: JSON.stringify({ player_name: '測試玩家', note: '謝謝支持', supported_at: '2026-10-17' }) }), env: supporterEnv });
assert.equal(add.status, 201);
const publicRows = await (await supporters({ env: supporterEnv })).json();
assert.equal(publicRows.supporters[0].player_name, '測試玩家');
const denied = await adminList({ request: request('https://teacafe.xyz/api/admin/supporters'), env: supporterEnv });
assert.equal(denied.status, 403);
globalThis.fetch = async () => new Response('{"price":101.5}', { status: 200, headers: { 'Content-Type': 'application/json' } });
try {
  const live = await market();
  assert.equal(live.status, 200);
  assert.equal((await live.json()).price, 101.5);
} finally { globalThis.fetch = originalFetch; }
console.log('OAuth fallback and supporter access checks passed.');
