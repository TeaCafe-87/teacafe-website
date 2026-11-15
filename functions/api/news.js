import { json } from '../_lib/community.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ configured: false, items: [] });
  const rows = await env.DB.prepare("SELECT id,title,body,discord_url,published_at FROM news_items WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
  return json({ configured: true, items: rows.results || [] });
}
