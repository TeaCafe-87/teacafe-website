export async function onRequestGet(context) {
  const { request } = context;
  const address = "teacafe.xyz";
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/server/status", request.url).toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let response;
  try {
    const upstream = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(address)}?query=false&timeout=4`, {
      headers: { "Accept": "application/json", "User-Agent": "TeaCafe-Website/1.0" }
    });
    if (!upstream.ok) throw new Error(`mcstatus ${upstream.status}`);
    const data = await upstream.json();
    const body = data.online ? {
      online: true,
      address,
      players: {
        online: data.players?.online ?? 0,
        max: data.players?.max ?? 0,
        list: Array.isArray(data.players?.list)
          ? data.players.list.map(player => ({ uuid: player.uuid })).filter(player => player.uuid)
          : []
      },
      version: data.version?.name_clean ?? null,
      motd: data.motd?.clean ?? null,
      retrieved_at: data.retrieved_at ?? Date.now()
    } : { online: false, address, players: { online: 0, max: 0, list: [] }, version: null };
    response = Response.json(body, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    response = Response.json({ online: null, address, players: { online: 0, max: 0, list: [] }, version: null, error: "upstream_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "public, max-age=15" }
    });
  }

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
