// The stock site's JSON is public. Proxy it through Pages so the merged page
// works on both the custom domain and pages.dev without depending on CORS.
export async function onRequestGet() {
  try {
    const upstream = await fetch('https://stock.teacafe.xyz/api/market', {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 3, cacheEverything: true }
    });
    if (!upstream.ok) return Response.json({ error: 'market_unavailable' }, { status: 503 });
    const payload = await upstream.text();
    if (payload.length > 250000) return Response.json({ error: 'market_unavailable' }, { status: 503 });
    return new Response(payload, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return Response.json({ error: 'market_unavailable' }, { status: 503 });
  }
}
