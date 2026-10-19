import { json } from '../_lib/community.js';

const anchors = {
  wiki: new Set(['start', 'travel', 'progress', 'economy', 'activities', 'extras']),
  rules: new Set(['intro', 'features', 'basic', 'automation', 'new-residents'])
};

export async function onRequestGet({ request, env }) {
  const page = new URL(request.url).searchParams.get('page');
  if (!anchors[page]) return json({ error: 'invalid_page' }, 400);
  if (!env.DB) return json({ configured: false, items: [] });
  try {
    const rows = await env.DB.prepare(
      'SELECT id,page,anchor,title,body,sort_order,created_at,updated_at FROM site_copy_sections WHERE page=? AND deleted_at IS NULL ORDER BY anchor,sort_order,created_at,id LIMIT 300'
    ).bind(page).all();
    return json({ configured: true, items: rows.results || [] });
  } catch {
    return json({ configured: false, items: [] });
  }
}
