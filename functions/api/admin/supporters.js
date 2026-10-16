import { json, userOrError, isOfficialUser, sameOrigin } from '../../_lib/community.js';

async function allowed(request, env) {
  return isOfficialUser(await userOrError(request, env), env);
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  if (!await allowed(request, env)) return json({ error: 'official_only' }, 403);
  try {
    const rows = await env.DB.prepare('SELECT id,player_name,note,supported_at FROM supporters ORDER BY supported_at DESC,created_at DESC LIMIT 500').all();
    return json({ supporters: rows.results || [] });
  } catch { return json({ error: 'migration_required' }, 503); }
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  if (!await allowed(request, env)) return json({ error: 'official_only' }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const name = String(input.player_name || '').trim();
  const note = String(input.note || '').trim();
  const date = String(input.supported_at || '').trim();
  if (!name || name.length > 32 || note.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return json({ error: 'invalid_supporter' }, 400);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO supporters(id,player_name,note,supported_at,created_at) VALUES(?,?,?,?,?)').bind(id,name,note,date,new Date().toISOString()).run();
    return json({ id }, 201);
  } catch { return json({ error: 'migration_required' }, 503); }
}
export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  if (!await allowed(request, env)) return json({ error: 'official_only' }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const id = String(input.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'invalid_id' }, 400);
  await env.DB.prepare('DELETE FROM supporters WHERE id=?').bind(id).run();
  return json({ deleted: true });
}
