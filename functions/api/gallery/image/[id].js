export async function onRequestGet({ params, env }) {
  if (!env.DB || !env.GALLERY_MEDIA) return new Response("Not configured", { status: 503 });

  const id = String(params.id || "");
  const row = await env.DB.prepare(
    "SELECT image_key, image_type FROM gallery_posts WHERE id = ? AND status = 'published' LIMIT 1"
  ).bind(id).first();

  if (!row) return new Response("Not found", { status: 404 });
  const object = await env.GALLERY_MEDIA.get(row.image_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.image_type || headers.get("Content-Type") || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
}
