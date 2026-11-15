import { json, userOrError, sameOrigin, isOfficialUser, publicPost } from '../../_lib/community.js';

async function officialOrError(request, env) {
  const user = await userOrError(request, env);
  return isOfficialUser(user, env) ? user : null;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  const official = await officialOrError(request, env);
  if (!official) return json({ error: 'official_only' }, 403);
  const view = new URL(request.url).searchParams.get('view');
  const rows = view === 'decided'
    ? (await env.DB.prepare("SELECT * FROM community_posts WHERE status IN ('published','hidden') AND author_id <> 'teacafe-system' ORDER BY updated_at DESC LIMIT 50").all()).results || []
    : (await env.DB.prepare("SELECT * FROM community_posts WHERE status='pending' ORDER BY created_at ASC LIMIT 100").all()).results || [];
  const ids = rows.map(row => row.id);
  let media = [];
  if (ids.length) {
    media = (await env.DB.prepare(`SELECT id,post_id,mime_type,byte_size,position FROM community_media WHERE post_id IN (${ids.map(() => '?').join(',')}) ORDER BY position`).bind(...ids).all()).results || [];
  }
  const byPost = new Map();
  for (const item of media) {
    const group = byPost.get(item.post_id) || [];
    group.push({ id: item.id, type: item.mime_type, size: item.byte_size, url: `/api/community/media/${encodeURIComponent(item.id)}` });
    byPost.set(item.post_id, group);
  }
  return json({ posts: rows.map(row => publicPost(row, byPost.get(row.id) || [])), has_more: rows.length === 100 });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const official = await officialOrError(request, env);
  if (!official) return json({ error: 'official_only' }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const id = String(input?.postId || '');
  const decision = input?.decision;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['approve', 'reject'].includes(decision)) return json({ error: 'invalid_decision' }, 400);
  const status = decision === 'approve' ? 'published' : 'hidden';
  // revise=true lets an official change their mind about an already-decided post.
  const guard = input?.revise === true ? "status IN ('pending','published','hidden')" : "status='pending'";
  const result = await env.DB.prepare(`UPDATE community_posts SET status=?,updated_at=? WHERE id=? AND ${guard} AND author_id <> 'teacafe-system'`).bind(status, new Date().toISOString(), id).run();
  if (!result.meta?.changes) return json({ error: 'post_not_pending' }, 409);
  return json({ ok: true, status });
}
