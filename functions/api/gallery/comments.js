import { getSessionUser } from "../../_lib/session.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ configured: false, comments: [] });

  const url = new URL(request.url);
  const postId = String(url.searchParams.get("post") || "");
  if (!postId) return json({ error: "post_required" }, 400);

  const result = await env.DB.prepare(`
    SELECT id, post_id, body, author_id, author_username,
           author_name, author_avatar_url, created_at
    FROM gallery_comments
    WHERE post_id = ?
    ORDER BY created_at ASC
    LIMIT 200
  `).bind(postId).all();

  return json({ configured: true, comments: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "gallery_database_not_configured" }, 503);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "authentication_required" }, 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const postId = String(payload.postId || "").trim();
  const body = String(payload.body || "").trim().slice(0, 500);
  if (!postId || !body) return json({ error: "post_and_body_required" }, 400);

  const exists = await env.DB.prepare(
    "SELECT id FROM gallery_posts WHERE id = ? AND status = 'published' LIMIT 1"
  ).bind(postId).first();
  if (!exists) return json({ error: "post_not_found" }, 404);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO gallery_comments (
      id, post_id, body, author_id, author_username,
      author_name, author_avatar_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    postId,
    body,
    String(user.id),
    String(user.username || "Discord User"),
    user.global_name ? String(user.global_name) : null,
    user.avatar_url ? String(user.avatar_url) : null,
    createdAt
  ).run();

  return json({
    ok: true,
    comment: {
      id,
      post_id: postId,
      body,
      author_id: String(user.id),
      author_username: String(user.username || "Discord User"),
      author_name: user.global_name || user.username || "Discord User",
      author_avatar_url: user.avatar_url || null,
      created_at: createdAt
    }
  }, 201);
}
