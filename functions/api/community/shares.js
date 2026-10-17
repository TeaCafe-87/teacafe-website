import { json, userOrError, sameOrigin, findPublishedPost } from '../../_lib/community.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const user = await userOrError(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const postId = String(data.postId || '');
  if (postId.length > 100) return json({ error: 'invalid_post' }, 400);
  if (!await findPublishedPost(env, postId)) return json({ error: 'post_not_found' }, 404);
  const actor = String(user.id);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const result = await env.DB.prepare(`INSERT INTO community_shares (id,post_id,actor_id,created_at)
    SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM community_shares WHERE post_id=? AND actor_id=? AND created_at>?)`)
    .bind(crypto.randomUUID(), postId, actor, now, postId, actor, cutoff).run();
  if (!result.meta?.changes) return json({ error: 'share_rate_limited' }, 429);
  return json({ ok: true });
}
