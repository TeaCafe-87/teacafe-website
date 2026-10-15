import { json } from '../../_lib/community.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ configured: false, entries: [] });
  const rows = await env.DB.prepare("SELECT slug,section,title,summary,body,source_note,updated_at FROM wiki_entries WHERE status='published' ORDER BY section,title LIMIT 200").all();
  return json({ configured: true, entries: rows.results || [] });
}
