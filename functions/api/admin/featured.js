import { json, userOrError, sameOrigin, isOfficialUser } from '../../_lib/community.js';

async function officialOrError(request, env) {
  const user = await userOrError(request, env);
  return isOfficialUser(user, env) ? user : null;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  const official = await officialOrError(request, env);
  if (!official) return json({ error: 'official_only' }, 403);
  const rows = (await env.DB.prepare(`SELECT f.media_id, f.post_id, f.label, f.position, p.title, p.status,
      (SELECT COUNT(*) FROM community_media m WHERE m.id = f.media_id AND m.post_id = f.post_id AND m.mime_type LIKE 'image/%') media_ok
    FROM featured_photos f LEFT JOIN community_posts p ON p.id = f.post_id
    ORDER BY f.position, f.created_at`).all()).results || [];
  return json({ items: rows.map(row => ({
    media_id: row.media_id, post_id: row.post_id, label: row.label || '', position: row.position,
    post_title: row.title || '', post_status: row.status || 'missing',
    broken: !row.media_ok || row.status !== 'published',
    url: `/api/community/media/${encodeURIComponent(row.media_id)}`
  })) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const official = await officialOrError(request, env);
  if (!official) return json({ error: 'official_only' }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const action = input?.action;
  const mediaId = String(input?.media_id || '');
  if (!/^[0-9a-f-]{8,64}$/i.test(mediaId)) return json({ error: 'invalid_media' }, 400);
  const now = new Date().toISOString();

  if (action === 'add') {
    const media = await env.DB.prepare(`SELECT m.id, m.post_id FROM community_media m
      JOIN community_posts p ON p.id = m.post_id AND p.status = 'published' AND p.kind = 'gallery'
      WHERE m.id = ? AND m.mime_type LIKE 'image/%'`).bind(mediaId).first();
    if (!media) return json({ error: 'media_not_found' }, 404);
    const count = await env.DB.prepare('SELECT COUNT(*) n FROM featured_photos').first();
    if (Number(count?.n || 0) >= 60) return json({ error: 'featured_full' }, 409);
    const top = await env.DB.prepare('SELECT COALESCE(MAX(position),-1) p FROM featured_photos').first();
    const label = String(input?.label || '').slice(0, 80);
    await env.DB.prepare('INSERT OR REPLACE INTO featured_photos (media_id,post_id,label,position,created_at,created_by) VALUES (?,?,?,?,?,?)')
      .bind(media.id, media.post_id, label, Number(top?.p ?? -1) + 1, now, String(official.id)).run();
    return json({ ok: true }, 201);
  }
  if (action === 'remove') {
    const result = await env.DB.prepare('DELETE FROM featured_photos WHERE media_id = ?').bind(mediaId).run();
    if (!result.meta?.changes) return json({ error: 'not_featured' }, 404);
    return json({ ok: true });
  }
  if (action === 'move') {
    const direction = input?.direction === 'up' ? -1 : input?.direction === 'down' ? 1 : 0;
    if (!direction) return json({ error: 'invalid_direction' }, 400);
    const rows = (await env.DB.prepare('SELECT media_id FROM featured_photos ORDER BY position, created_at').all()).results || [];
    const index = rows.findIndex(row => row.media_id === mediaId);
    if (index < 0) return json({ error: 'not_featured' }, 404);
    const swap = index + direction;
    if (swap < 0 || swap >= rows.length) return json({ ok: true });
    [rows[index], rows[swap]] = [rows[swap], rows[index]];
    await env.DB.batch(rows.map((row, position) => env.DB.prepare('UPDATE featured_photos SET position = ? WHERE media_id = ?').bind(position, row.media_id)));
    return json({ ok: true });
  }
  if (action === 'label') {
    const label = String(input?.label || '').slice(0, 80);
    const result = await env.DB.prepare('UPDATE featured_photos SET label = ? WHERE media_id = ?').bind(label, mediaId).run();
    if (!result.meta?.changes) return json({ error: 'not_featured' }, 404);
    return json({ ok: true });
  }
  return json({ error: 'invalid_action' }, 400);
}
