import { json } from '../../_lib/community.js';

export function onRequestGet({ env }) {
  return json({ sitekey: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? String(env.TURNSTILE_SITE_KEY) : null });
}
