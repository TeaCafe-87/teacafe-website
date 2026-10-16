import { json } from '../_lib/community.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ configured: false, supporters: [] });
  try {
    const rows = await env.DB.prepare('SELECT id, player_name, note, supported_at FROM supporters ORDER BY supported_at DESC, created_at DESC LIMIT 500').all();
    return json({ configured: true, supporters: rows.results || [] });
  } catch { return json({ configured: false, supporters: [] }); }
}
