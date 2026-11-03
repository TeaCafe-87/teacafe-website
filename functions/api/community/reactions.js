import { json, userOrError, sameOrigin, findPublishedPost } from '../../_lib/community.js';

const ALLOWED = new Set(['🍵', '❤️', '👏', '🔥', '😂']);

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  const postId = new URL(request.url).searchParams.get('post') || '';
  if (!await findPublishedPost(env, postId)) return json({ error: 'post_not_found' }, 404);
  const user = await userOrError(request, env);
  const [counts, mine] = await Promise.all([
    env.DB.prepare('SELECT emoji, COUNT(*) count FROM community_reactions WHERE post_id=? GROUP BY emoji').bind(postId).all(),
    user ? env.DB.prepare('SELECT emoji FROM community_reactions WHERE post_id=? AND author_id=?').bind(postId, String(user.id)).all() : Promise.resolve({ results: [] })
  ]);
  return json({ counts: Object.fromEntries((counts.results || []).map(row => [row.emoji, Number(row.count)])), mine: (mine.results || []).map(row => row.emoji) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const user = await userOrError(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const postId = String(data?.postId || '');
  const emoji = String(data?.emoji || '');
  if (!ALLOWED.has(emoji)) return json({ error: 'invalid_emoji' }, 400);
  if (!await findPublishedPost(env, postId)) return json({ error: 'post_not_found' }, 404);
  const actor = String(user.id);
  const existing = await env.DB.prepare('SELECT emoji FROM community_reactions WHERE post_id=? AND author_id=? AND emoji=?').bind(postId, actor, emoji).first();
  if (existing) await env.DB.prepare('DELETE FROM community_reactions WHERE post_id=? AND author_id=? AND emoji=?').bind(postId, actor, emoji).run();
  else await env.DB.prepare('INSERT INTO community_reactions (post_id,author_id,emoji,created_at) VALUES (?,?,?,?)').bind(postId, actor, emoji, new Date().toISOString()).run();
  const counts = await env.DB.prepare('SELECT emoji, COUNT(*) count FROM community_reactions WHERE post_id=? GROUP BY emoji').bind(postId).all();
  return json({ counts: Object.fromEntries((counts.results || []).map(row => [row.emoji, Number(row.count)])), selected: !existing });
}
