import { isOfficialUser, json, sameOrigin, userOrError } from '../../_lib/community.js';

const anchors = {
  wiki: new Set(['start', 'travel', 'progress', 'economy', 'activities', 'extras']),
  rules: new Set(['intro', 'features', 'basic', 'automation', 'new-residents'])
};
const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const raw = await request.text();
  if (raw.length > 24000) return json({ error: 'content_too_large' }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  const { page, anchor, action = 'save' } = input || {};
  if (!anchors[page]?.has(anchor)) return json({ error: 'invalid_location' }, 400);
  const now = new Date().toISOString();
  const editor = String(user.id);
  try {
    if (action === 'save') {
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const body = typeof input.body === 'string' ? input.body.trim() : '';
      if (!title || title.length > 120 || !body || body.length > 10000) return json({ error: 'invalid_content' }, 400);
      if (input.id) {
        if (!validId(input.id)) return json({ error: 'invalid_id' }, 400);
        const current = await env.DB.prepare(
          'SELECT anchor,sort_order FROM site_copy_sections WHERE id=? AND page=? AND deleted_at IS NULL'
        ).bind(input.id, page).first();
        if (!current) return json({ error: 'not_found' }, 404);
        let order = current.sort_order;
        if (current.anchor !== anchor) {
          const last = await env.DB.prepare(
            'SELECT COALESCE(MAX(sort_order),0) AS position FROM site_copy_sections WHERE page=? AND anchor=? AND deleted_at IS NULL'
          ).bind(page, anchor).first();
          order = Number(last?.position || 0) + 1;
        }
        const result = await env.DB.prepare(
          'UPDATE site_copy_sections SET anchor=?,title=?,body=?,sort_order=?,updated_at=?,updated_by=? WHERE id=? AND page=? AND deleted_at IS NULL'
        ).bind(anchor, title, body, order, now, editor, input.id, page).run();
        if (!result.meta?.changes) return json({ error: 'not_found' }, 404);
        return json({ ok: true, id: input.id, updated_at: now });
      }
      const last = await env.DB.prepare(
        'SELECT COALESCE(MAX(sort_order),0) AS position FROM site_copy_sections WHERE page=? AND anchor=? AND deleted_at IS NULL'
      ).bind(page, anchor).first();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO site_copy_sections (id,page,anchor,title,body,sort_order,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(id, page, anchor, title, body, Number(last?.position || 0) + 1, now, now, editor).run();
      return json({ ok: true, id, updated_at: now }, 201);
    }
    if (action === 'delete') {
      if (!validId(input.id)) return json({ error: 'invalid_id' }, 400);
      const result = await env.DB.prepare(
        'UPDATE site_copy_sections SET deleted_at=?,updated_at=?,updated_by=? WHERE id=? AND page=? AND anchor=? AND deleted_at IS NULL'
      ).bind(now, now, editor, input.id, page, anchor).run();
      if (!result.meta?.changes) return json({ error: 'not_found' }, 404);
      return json({ ok: true });
    }
    if (action === 'reorder') {
      const ids = input.ids;
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length)
        return json({ error: 'invalid_order' }, 400);
      const rows = await env.DB.prepare(
        'SELECT id FROM site_copy_sections WHERE page=? AND anchor=? AND deleted_at IS NULL'
      ).bind(page, anchor).all();
      const existing = (rows.results || []).map(row => row.id);
      if (existing.length !== ids.length || existing.some(id => !ids.includes(id)))
        return json({ error: 'stale_order' }, 409);
      await env.DB.batch(ids.map((id, index) =>
        env.DB.prepare('UPDATE site_copy_sections SET sort_order=?,updated_at=?,updated_by=? WHERE id=? AND page=? AND anchor=? AND deleted_at IS NULL')
          .bind(index + 1, now, editor, id, page, anchor)
      ));
      return json({ ok: true });
    }
    return json({ error: 'invalid_action' }, 400);
  } catch {
    return json({ error: 'storage_failed' }, 503);
  }
}
