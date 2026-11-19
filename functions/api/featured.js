import { json } from '../_lib/community.js';

// Public: admin-curated photos for the home wall. Only images from published gallery posts survive the join.
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ configured: false, items: [] });
  let rows = [];
  try {
    const flag = await env.DB.prepare("SELECT enabled FROM site_features WHERE feature='featured'").first();
    if (flag && !Number(flag.enabled)) return json({ configured: true, enabled: false, items: [] });
    rows = (await env.DB.prepare(`SELECT f.media_id, f.post_id, f.label, p.title
      FROM featured_photos f
      JOIN community_posts p ON p.id = f.post_id AND p.status = 'published'
      JOIN community_media m ON m.id = f.media_id AND m.post_id = f.post_id AND m.mime_type LIKE 'image/%'
      ORDER BY f.position, f.created_at LIMIT 60`).all()).results || [];
  } catch {
    // Migration 0009 not applied yet: behave like an empty wall instead of a 500.
    return json({ configured: false, items: [] });
  }
  return json({
    configured: true, enabled: true,
    items: rows.map(row => ({
      media_id: row.media_id, post_id: row.post_id,
      label: row.label || row.title || '',
      url: `/api/community/media/${encodeURIComponent(row.media_id)}`
    }))
  }, 200);
}
