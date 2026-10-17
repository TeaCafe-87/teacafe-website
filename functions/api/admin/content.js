import { isOfficialUser, json, sameOrigin, userOrError } from '../../_lib/community.js';

const kinds = new Set(['news', 'wiki', 'pass']);
const sections = new Set(['start', 'travel', 'progress', 'economy', 'activities', 'extras']);
const statuses = new Set(['draft', 'published', 'hidden']);
const clean = value => String(value ?? '').trim();

async function authorize(request, env) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  return null;
}

export async function onRequestGet({ request, env }) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  const type = new URL(request.url).searchParams.get('type');
  if (!kinds.has(type)) return json({ error: 'invalid_type' }, 400);
  const sql = {
    news: 'SELECT id,title,body,discord_url,published_at,status FROM news_items ORDER BY published_at DESC LIMIT 200',
    wiki: 'SELECT slug,section,title,summary,body,source_note,updated_at,status FROM wiki_entries ORDER BY section,title LIMIT 200',
    pass: 'SELECT id,title,starts_at,ends_at,xp_per_level,max_level,active,updated_at FROM pass_seasons ORDER BY updated_at DESC LIMIT 100'
  }[type];
  try {
    const result = await env.DB.prepare(sql).all();
    return json({ items: result.results || [] });
  } catch {
    return json({ error: 'storage_failed' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const raw = await request.text();
  if (raw.length > 60000) return json({ error: 'content_too_large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  const type = data?.type;
  const item = data?.item;
  if (!kinds.has(type) || !item || typeof item !== 'object') return json({ error: 'invalid_content' }, 400);
  const now = new Date().toISOString();
  try {
    if (type === 'news') {
      const id = clean(item.id || crypto.randomUUID());
      const title = clean(item.title);
      const body = clean(item.body);
      const discordUrl = clean(item.discord_url) || null;
      const publishedAt = clean(item.published_at) || now;
      const status = clean(item.status);
      if (!id || id.length > 100 || !title || title.length > 120 || !body || body.length > 10000 ||
        (discordUrl && discordUrl.length > 500) || publishedAt.length > 40 || !statuses.has(status) ||
        !Number.isFinite(Date.parse(publishedAt))) return json({ error: 'invalid_content' }, 400);
      if (discordUrl) {
        let url;
        try { url = new URL(discordUrl); } catch { return json({ error: 'invalid_url' }, 400); }
        if (url.protocol !== 'https:') return json({ error: 'invalid_url' }, 400);
      }
      await env.DB.prepare(`INSERT INTO news_items (id,title,body,discord_url,published_at,status) VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,discord_url=excluded.discord_url,published_at=excluded.published_at,status=excluded.status`)
        .bind(id, title, body, discordUrl, publishedAt, status).run();
      return json({ ok: true, id });
    }
    if (type === 'wiki') {
      const slug = clean(item.slug);
      const section = clean(item.section);
      const title = clean(item.title);
      const summary = clean(item.summary);
      const body = clean(item.body);
      const sourceNote = clean(item.source_note);
      const status = clean(item.status);
      if (!/^[a-z0-9-]{1,100}$/.test(slug) || !sections.has(section) || !title || title.length > 120 ||
        summary.length > 500 || !body || body.length > 20000 || sourceNote.length > 500 || !statuses.has(status)) return json({ error: 'invalid_content' }, 400);
      await env.DB.prepare(`INSERT INTO wiki_entries (slug,section,title,summary,body,source_note,updated_at,status) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(slug) DO UPDATE SET section=excluded.section,title=excluded.title,summary=excluded.summary,body=excluded.body,source_note=excluded.source_note,updated_at=excluded.updated_at,status=excluded.status`)
        .bind(slug, section, title, summary, body, sourceNote, now, status).run();
      return json({ ok: true, slug });
    }
    const id = clean(item.id || crypto.randomUUID());
    const title = clean(item.title);
    const startsAt = clean(item.starts_at) || null;
    const endsAt = clean(item.ends_at) || null;
    const xp = Number(item.xp_per_level);
    const level = Number(item.max_level);
    const active = item.active === true || item.active === 1 || item.active === '1' ? 1 : 0;
    if (!id || id.length > 100 || !title || title.length > 120 || (startsAt && startsAt.length > 40) || (endsAt && endsAt.length > 40) ||
      !Number.isInteger(xp) || xp < 1 || xp > 100000 || !Number.isInteger(level) || level < 1 || level > 1000 ||
      (startsAt && !Number.isFinite(Date.parse(startsAt))) || (endsAt && !Number.isFinite(Date.parse(endsAt))) ||
      (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt))) return json({ error: 'invalid_content' }, 400);
    const save = env.DB.prepare(`INSERT INTO pass_seasons (id,title,starts_at,ends_at,xp_per_level,max_level,active,updated_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,xp_per_level=excluded.xp_per_level,max_level=excluded.max_level,active=excluded.active,updated_at=excluded.updated_at`)
      .bind(id, title, startsAt, endsAt, xp, level, active, now);
    if (active) await env.DB.batch([env.DB.prepare('UPDATE pass_seasons SET active=0 WHERE id<>?').bind(id), save]);
    else await save.run();
    return json({ ok: true, id });
  } catch {
    return json({ error: 'storage_failed' }, 503);
  }
}
