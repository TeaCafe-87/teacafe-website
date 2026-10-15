import { json } from '../../_lib/community.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ configured: false, season: null });
  const season = await env.DB.prepare('SELECT id,title,starts_at,ends_at,xp_per_level,max_level,updated_at FROM pass_seasons WHERE active=1 ORDER BY updated_at DESC LIMIT 1').first();
  return json({ configured: true, season: season || null });
}
