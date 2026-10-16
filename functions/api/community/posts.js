import { MAX_TOTAL_BYTES, MEDIA_TYPES, hasValidSignature, json, userOrError, sameOrigin, publicPost, authorFields, isOfficialUser } from '../../_lib/community.js';

const select = `SELECT p.*, (SELECT COUNT(*) FROM community_likes l WHERE l.post_id=p.id) like_count,
  (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id) comment_count,
  (SELECT COUNT(*) FROM community_shares s WHERE s.post_id=p.id) share_count,
  EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id=p.id AND l.author_id=?) liked
  FROM community_posts p WHERE p.kind=? AND p.status='published'`;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ configured: false, posts: [], next_cursor: null });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  if (!['gallery', 'forum'].includes(kind)) return json({ error: 'invalid_kind' }, 400);
  const cursor = url.searchParams.get('cursor');
  const category = url.searchParams.get('category');
  const user = await userOrError(request, env);
  const clauses = [];
  const values = [user ? String(user.id) : '', kind];
  if (cursor) { clauses.push('p.created_at < ?'); values.push(cursor); }
  if (kind === 'forum' && category && category !== 'all') { clauses.push('p.category = ?'); values.push(category); }
  const sql = `${select} ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''} ORDER BY p.created_at DESC LIMIT 21`;
  const result = await env.DB.prepare(sql).bind(...values).all();
  const rows = result.results || [];
  const more = rows.length > 20;
  const visible = rows.slice(0, 20);
  const ids = visible.map(row => row.id);
  let media = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    media = (await env.DB.prepare(`SELECT id, post_id, mime_type, byte_size, position FROM community_media WHERE post_id IN (${placeholders}) ORDER BY position`).bind(...ids).all()).results || [];
  }
  const byPost = new Map();
  for (const item of media) {
    const group = byPost.get(item.post_id) || [];
    group.push({ id: item.id, type: item.mime_type, size: item.byte_size, url: `/api/community/media/${encodeURIComponent(item.id)}` });
    byPost.set(item.post_id, group);
  }
  return json({ configured: true, posts: visible.map(row => publicPost(row, byPost.get(row.id) || [])), next_cursor: more ? visible.at(-1).created_at : null });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.GALLERY_MEDIA) return json({ error: 'storage_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const user = await userOrError(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_TOTAL_BYTES + 100000) return json({ error: 'files_too_large', max_bytes: MAX_TOTAL_BYTES }, 413);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'invalid_form' }, 400); }
  const kind = String(form.get('kind') || '');
  if (!['gallery', 'forum'].includes(kind)) return json({ error: 'invalid_kind' }, 400);
  const title = String(form.get('title') || '').trim();
  const body = String(form.get('body') || '').trim();
  const category = kind === 'forum' ? String(form.get('category') || 'general').trim() : 'gallery';
  const official = isOfficialUser(user, env);
  if (category === 'official' && (!official || kind !== 'forum')) return json({ error: 'official_only' }, 403);
  if (!title || title.length > 100 || body.length > 5000 || category.length > 40 || !/^[a-z0-9-]+$/.test(category)) return json({ error: 'invalid_post' }, 400);
  const files = form.getAll('media').filter(value => value instanceof File && value.size > 0);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) return json({ error: 'files_too_large', max_bytes: MAX_TOTAL_BYTES }, 413);
  if (files.some(file => !MEDIA_TYPES.has(file.type))) return json({ error: 'unsupported_media_type' }, 415);
  if (!(await Promise.all(files.map(hasValidSignature))).every(Boolean)) return json({ error: 'invalid_media_content' }, 415);
  if (kind === 'gallery' && !files.length) return json({ error: 'media_required' }, 400);
  const recent = await env.DB.prepare("SELECT created_at FROM community_posts WHERE author_id=? AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(String(user.id), new Date(Date.now() - 30000).toISOString()).first();
  if (recent) return json({ error: 'post_rate_limited' }, 429);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const postStatus = official && category === 'official' ? 'published' : 'pending';
  const stored = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mediaId = crypto.randomUUID();
      const key = `community/${id}/${mediaId}.${MEDIA_TYPES.get(file.type)}`;
      await env.GALLERY_MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { postId: id } });
      stored.push({ id: mediaId, key, type: file.type, size: file.size, position: i });
    }
    const author = authorFields(user);
    const statements = [env.DB.prepare(`INSERT INTO community_posts (id,kind,category,title,body,author_id,author_username,author_name,author_avatar_url,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, kind, category, title, body, ...author, postStatus, now, now)];
    for (const item of stored) {
      statements.push(env.DB.prepare('INSERT INTO community_media (id,post_id,object_key,mime_type,byte_size,position,created_at) VALUES (?,?,?,?,?,?,?)').bind(item.id, id, item.key, item.type, item.size, item.position, now));
    }
    await env.DB.batch(statements);
  } catch (error) {
    await Promise.all(stored.map(item => env.GALLERY_MEDIA.delete(item.key).catch(() => {})));
    return json({ error: 'storage_failed' }, 500);
  }
  return json({ ok: true, status: postStatus, post: publicPost({ id, kind, category, title, body, author_id: String(user.id), author_username: user.username, author_name: user.global_name, author_avatar_url: user.avatar_url, created_at: now }, stored.map(item => ({ id: item.id, type: item.type, size: item.size, url: `/api/community/media/${item.id}` }))) }, 201);
}
