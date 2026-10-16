import { json, userOrError, isOfficialUser } from '../../_lib/community.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  const url = new URL(request.url);
  const author = (url.searchParams.get('author') || '').trim();
  if (!/^\d{16,22}$/.test(author)) return json({ error: 'invalid_author' }, 400);
  const page = Math.min(1000, Math.max(0, Number.parseInt(url.searchParams.get('page') || '0', 10) || 0));
  const rows = (await env.DB.prepare(`SELECT id,kind,category,title,body,status,created_at,updated_at,
    (SELECT COUNT(*) FROM community_media m WHERE m.post_id=p.id) media_count
    FROM community_posts p WHERE author_id=? ORDER BY created_at DESC LIMIT 51 OFFSET ?`).bind(author, page * 50).all()).results || [];
  return json({ posts: rows.slice(0, 50), next_page: rows.length > 50 ? page + 1 : null });
}
