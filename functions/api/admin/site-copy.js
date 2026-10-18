import { isOfficialUser, json, sameOrigin, userOrError } from '../../_lib/community.js';

const pages = new Set(['wiki', 'rules']);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const raw = await request.text();
  if (raw.length > 12000) return json({ error: 'content_too_large' }, 413);
  let item;
  try { item = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  const page = item?.page;
  const key = item?.key;
  const reset = item?.reset === true;
  const value = typeof item?.value === 'string' ? item.value.trim() : '';
  if (!pages.has(page) || typeof key !== 'string' || !/^[a-z0-9:-]{1,100}$/.test(key) ||
      (!reset && (!value || value.length > 6000))) return json({ error: 'invalid_content' }, 400);
  try {
    if (reset) {
      await env.DB.prepare('DELETE FROM site_copy_overrides WHERE page=? AND block_key=?').bind(page, key).run();
      return json({ ok: true, reset: true });
    }
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO site_copy_overrides (page,block_key,value,updated_at,updated_by)
      VALUES (?,?,?,?,?) ON CONFLICT(page,block_key) DO UPDATE SET
      value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
      .bind(page, key, value, updatedAt, String(user.id || user.discord_id || 'official')).run();
    return json({ ok: true, updated_at: updatedAt });
  } catch {
    return json({ error: 'storage_failed' }, 503);
  }
}
