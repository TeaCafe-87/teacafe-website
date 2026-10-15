import { json, userOrError, sameOrigin, findPublishedPost, authorFields } from '../../_lib/community.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ configured: false, comments: [] });
  const postId = new URL(request.url).searchParams.get('post') || '';
  if (!postId) return json({ error: 'post_required' }, 400);
  const post = await findPublishedPost(env, postId);
  if (!post) return json({ error: 'post_not_found' }, 404);
  const result = await env.DB.prepare('SELECT id,post_id,body,author_id,author_username,author_name,author_avatar_url,created_at FROM community_comments WHERE post_id=? ORDER BY created_at ASC LIMIT 200').bind(postId).all();
  return json({ configured: true, comments: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const user = await userOrError(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const postId = String(data.postId || '');
  const body = String(data.body || '').trim();
  if (!body || body.length > 1000) return json({ error: 'invalid_comment' }, 400);
  if (!await findPublishedPost(env, postId)) return json({ error: 'post_not_found' }, 404);
  const recent = await env.DB.prepare('SELECT id FROM community_comments WHERE author_id=? AND created_at > ? LIMIT 1').bind(String(user.id), new Date(Date.now() - 3000).toISOString()).first();
  if (recent) return json({ error: 'comment_rate_limited' }, 429);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO community_comments (id,post_id,body,author_id,author_username,author_name,author_avatar_url,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, postId, body, ...authorFields(user), now).run();
  return json({ ok: true, comment: { id, post_id: postId, body, author_id: String(user.id), author_username: user.username, author_name: user.global_name || user.username, author_avatar_url: user.avatar_url, created_at: now } }, 201);
}
