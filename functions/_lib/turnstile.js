export async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) return true;
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  try {
    const body = new FormData();
    body.set('secret', env.TURNSTILE_SECRET_KEY);
    body.set('response', token);
    body.set('remoteip', request.headers.get('CF-Connecting-IP') || '');
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && (!result.hostname || result.hostname === new URL(request.url).hostname);
  } catch { return false; }
}
