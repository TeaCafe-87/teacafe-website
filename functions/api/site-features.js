import { json } from '../_lib/community.js';

export const FEATURE_KEYS = ['forum', 'gallery', 'wiki', 'market', 'featured'];

export async function readFeatures(env) {
  const features = Object.fromEntries(FEATURE_KEYS.map(key => [key, { enabled: true, note: '' }]));
  if (!env.DB) return features;
  try {
    const rows = (await env.DB.prepare('SELECT feature, enabled, note FROM site_features').all()).results || [];
    for (const row of rows) {
      if (features[row.feature]) features[row.feature] = { enabled: Boolean(Number(row.enabled)), note: row.note || '' };
    }
  } catch { /* table missing: every feature stays enabled */ }
  return features;
}

export async function featureEnabled(env, key) {
  const features = await readFeatures(env);
  return features[key] ? features[key].enabled : true;
}

export async function onRequestGet({ env }) {
  return json({ configured: Boolean(env.DB), features: await readFeatures(env) }, 200);
}
