import { json } from '../_lib/community.js';

const pages = new Set(['wiki', 'rules']);

export async function onRequestGet({ request, env }) {
  const page = new URL(request.url).searchParams.get('page');
  if (!pages.has(page)) return json({ error: 'invalid_page' }, 400);
  if (!env.DB) return json({ configured: false, items: [] });
  try {
    const result = await env.DB.prepare(
      'SELECT block_key,value,updated_at FROM site_copy_overrides WHERE page=? ORDER BY block_key LIMIT 300'
    ).bind(page).all();
    return json({ configured: true, items: result.results || [] });
  } catch {
    return json({ configured: false, items: [] });
  }
}
