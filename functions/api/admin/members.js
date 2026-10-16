import { json, userOrError, isOfficialUser } from '../../_lib/community.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const page = Math.min(1000, Math.max(0, Number.parseInt(url.searchParams.get('page') || '0', 10) || 0));
  const values = [];
  let where = '';
  if (query) {
    where = 'WHERE m.discord_id LIKE ? OR m.username LIKE ? OR m.global_name LIKE ? OR l.minecraft_name LIKE ?';
    values.push(...Array(4).fill(`%${query}%`));
  }
  const rows = (await env.DB.prepare(`SELECT m.discord_id,m.username,m.global_name,m.avatar_url,m.first_login_at,m.last_login_at,m.login_count,
    l.minecraft_name,l.verified_at,
    (SELECT COUNT(*) FROM community_posts p WHERE p.author_id=m.discord_id) post_count,
    (SELECT COUNT(*) FROM community_posts p WHERE p.author_id=m.discord_id AND p.status='pending') pending_count
    FROM site_members m LEFT JOIN player_links l ON l.discord_id=m.discord_id ${where}
    ORDER BY m.last_login_at DESC LIMIT 51 OFFSET ?`).bind(...values, page * 50).all()).results || [];
  return json({ members: rows.slice(0, 50), next_page: rows.length > 50 ? page + 1 : null });
}
