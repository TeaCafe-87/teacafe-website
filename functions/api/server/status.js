// Live server status for the home page (卷一 山門).
// mc.teacafe.xyz sits behind an anti-DDoS proxy that may drop status pings from data centres, so
// the probe can target a separate address (MINECRAFT_STATUS_ADDRESS, e.g. the origin "host:port"),
// and two public status services are tried in turn. The address shown to players stays
// MINECRAFT_SERVER_ADDRESS.
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{32,36}$/i.test(v);

async function fromMcstatus(probe) {
  const r = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(probe)}?query=true&timeout=4`, {
    headers: { Accept: 'application/json', 'User-Agent': 'TeaCafe-Website/1.0' },
  });
  if (!r.ok) throw new Error(`mcstatus ${r.status}`);
  const d = await r.json();
  if (!d.online) return null;
  return {
    online: d.players?.online ?? 0, max: d.players?.max ?? 0,
    list: (Array.isArray(d.players?.list) ? d.players.list : []).map((p) => ({ uuid: p.uuid, name: p.name_clean || p.name_raw || '' })),
    version: d.version?.name_clean ?? null, motd: d.motd?.clean ?? null,
  };
}

async function fromMcsrvstat(probe) {
  const r = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(probe)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'TeaCafe-Website/1.0' },
  });
  if (!r.ok) throw new Error(`mcsrvstat ${r.status}`);
  const d = await r.json();
  if (!d.online) return null;
  return {
    online: d.players?.online ?? 0, max: d.players?.max ?? 0,
    list: (Array.isArray(d.players?.list) ? d.players.list : []).map((p) => ({ uuid: p.uuid, name: p.name || '' })),
    version: typeof d.version === 'string' ? d.version : null,
    motd: Array.isArray(d.motd?.clean) ? d.motd.clean.join(' ') : null,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const address = String(env.MINECRAFT_SERVER_ADDRESS || 'mc.teacafe.xyz').trim();
  const probe = String(env.MINECRAFT_STATUS_ADDRESS || address).trim();
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/server/status', request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let live = null, reached = false;
  for (const provider of [fromMcstatus, fromMcsrvstat]) {
    try {
      live = await provider(probe);
      reached = true;
      if (live) break;
    } catch { /* try the next provider */ }
  }

  let response;
  if (live) {
    response = Response.json({
      online: true, address,
      players: {
        online: live.online, max: live.max,
        list: live.list.filter((p) => isUuid(p.uuid)).slice(0, 60).map((p) => ({ uuid: p.uuid, name: String(p.name).slice(0, 32) })),
      },
      version: live.version, motd: live.motd, retrieved_at: Date.now(),
    }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } else if (reached) {
    response = Response.json({ online: false, address, players: { online: 0, max: 0, list: [] }, version: null },
      { headers: { 'Cache-Control': 'public, max-age=30' } });
  } else {
    response = Response.json({ online: null, address, players: { online: 0, max: 0, list: [] }, version: null, error: 'upstream_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'public, max-age=15' } });
  }
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
