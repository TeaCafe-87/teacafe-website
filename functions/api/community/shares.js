import { json, userOrError, sameOrigin, findPublishedPost } from '../../_lib/community.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const postId = String(data.postId || '');
  if (!await findPublishedPost(env, postId)) return json({ error: 'post_not_found' }, 404);
  const user = await userOrError(request, env);
  await env.DB.prepare('INSERT INTO community_shares (id,post_id,actor_id,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(), postId, user ? String(user.id) : null, new Date().toISOString()).run();
  return json({ ok: true });
}
