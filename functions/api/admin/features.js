import { json, userOrError, sameOrigin, isOfficialUser } from '../../_lib/community.js';
import { FEATURE_KEYS, readFeatures } from '../site-features.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  return json({ features: await readFeatures(env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'storage_not_configured' }, 503);
  if (!sameOrigin(request)) return json({ error: 'invalid_origin' }, 403);
  const user = await userOrError(request, env);
  if (!isOfficialUser(user, env)) return json({ error: 'official_only' }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const feature = String(input?.feature || '');
  if (!FEATURE_KEYS.includes(feature)) return json({ error: 'invalid_feature' }, 400);
  const enabled = input?.enabled ? 1 : 0;
  const note = String(input?.note || '').slice(0, 200);
  await env.DB.prepare(`INSERT INTO site_features (feature,enabled,note,updated_at,updated_by) VALUES (?,?,?,?,?)
    ON CONFLICT(feature) DO UPDATE SET enabled=excluded.enabled, note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
    .bind(feature, enabled, note, new Date().toISOString(), String(user.id)).run();
  return json({ ok: true, features: await readFeatures(env) });
}
