import { json, userOrError, sameOrigin, findPublishedPost } from '../../_lib/community.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const user = await userOrError(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const postId = String(data.postId || '');
  if (!await findPublishedPost(env, postId)) return json({ error: 'post_not_found' }, 404);
  if (data.liked === true) {
    await env.DB.prepare('INSERT OR IGNORE INTO community_likes (post_id,author_id,created_at) VALUES (?,?,?)').bind(postId, String(user.id), new Date().toISOString()).run();
  } else if (data.liked === false) {
    await env.DB.prepare('DELETE FROM community_likes WHERE post_id=? AND author_id=?').bind(postId, String(user.id)).run();
  } else return json({ error: 'invalid_like' }, 400);
  const row = await env.DB.prepare('SELECT COUNT(*) count FROM community_likes WHERE post_id=?').bind(postId).first();
  return json({ ok: true, liked: data.liked, like_count: Number(row?.count || 0) });
}
