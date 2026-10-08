import { getSessionUser } from "../../_lib/session.js";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ configured: false, posts: [] });

  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.title,
      p.body,
      p.author_id,
      p.author_username,
      p.author_name,
      p.author_avatar_url,
      p.created_at,
      (
        SELECT COUNT(*)
        FROM gallery_comments c
        WHERE c.post_id = p.id
      ) AS comment_count
    FROM gallery_posts p
    WHERE p.status = 'published'
    ORDER BY p.created_at DESC
    LIMIT 80
  `).all();

  const posts = (result.results || []).map((post) => ({
    ...post,
    image_url: `/api/gallery/image/${encodeURIComponent(post.id)}`,
    comment_count: Number(post.comment_count || 0)
  }));

  return json({ configured: true, posts });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.GALLERY_MEDIA) {
    return json({ error: "gallery_storage_not_configured" }, 503);
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "authentication_required" }, 401);

  const form = await request.formData();
  const file = form.get("image");
  const title = String(form.get("title") || "").trim().slice(0, 80);
  const body = String(form.get("body") || "").trim().slice(0, 500);

  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "image_required" }, 400);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return json({ error: "unsupported_image_type" }, 415);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: "image_too_large", max_bytes: MAX_IMAGE_BYTES }, 413);
  }
  if (!title) return json({ error: "title_required" }, 400);

  const id = crypto.randomUUID();
  const ext = ALLOWED_TYPES.get(file.type);
  const imageKey = `gallery/${id}.${ext}`;
  const createdAt = new Date().toISOString();

  await env.GALLERY_MEDIA.put(imageKey, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      postId: id,
      authorId: String(user.id)
    }
  });

  try {
    await env.DB.prepare(`
      INSERT INTO gallery_posts (
        id, title, body, image_key, image_type,
        author_id, author_username, author_name, author_avatar_url,
        created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `).bind(
      id,
      title,
      body,
      imageKey,
      file.type,
      String(user.id),
      String(user.username || "Discord User"),
      user.global_name ? String(user.global_name) : null,
      user.avatar_url ? String(user.avatar_url) : null,
      createdAt
    ).run();
  } catch (error) {
    await env.GALLERY_MEDIA.delete(imageKey);
    throw error;
  }

  return json({
    ok: true,
    post: {
      id,
      title,
      body,
      image_url: `/api/gallery/image/${id}`,
      author_id: String(user.id),
      author_username: String(user.username || "Discord User"),
      author_name: user.global_name || user.username || "Discord User",
      author_avatar_url: user.avatar_url || null,
      created_at: createdAt,
      comment_count: 0
    }
  }, 201);
}
