import { json } from '../_lib/community.js';

export async function onRequestGet({ env }) {
  if (env.DISCORD_BOT_TOKEN) {
    try {
      const channels = [['1515749237353086976','伺服器公告'],['1534847072639909888','更新公告']];
      const cacheKey = new Request('https://teacafe.xyz/discord-news-cache/two-channels-v1');
      const cache = globalThis.caches?.default;
      const cached = await cache?.match(cacheKey);
      if (cached) return cached;
      const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
      const groups = await Promise.all(channels.map(async ([id, label]) => {
        const response = await fetch(`https://discord.com/api/v10/channels/${id}/messages?limit=20`, { headers, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('discord_unavailable');
        const messages = await response.json();
        let guild = env.DISCORD_GUILD_ID;
        if (!guild) { const meta = await fetch(`https://discord.com/api/v10/channels/${id}`, { headers, signal: AbortSignal.timeout(5000) }); if (!meta.ok) throw new Error('channel_unavailable'); guild = (await meta.json()).guild_id; }
        return messages.filter(m => m.type === 0 || m.type === 19).map(m => ({ id: `discord-${m.id}`, title: `[${label}] ${(m.content?.split('\n')[0] || m.embeds?.[0]?.title || 'Discord 公告').slice(0,100)}`, body: m.content || m.embeds?.[0]?.description || '點選連結查看圖片或附件。', published_at: m.timestamp, discord_url: `https://discord.com/channels/${guild}/${id}/${m.id}` }));
      }));
      const items = groups.flat().sort((a,b) => b.published_at.localeCompare(a.published_at));
      const result = Response.json({ configured: true, source: 'discord', items }, { headers: { 'Cache-Control': 'public, max-age=60' } });
      await cache?.put(cacheKey, result.clone());
      return result;
    } catch { /* Keep D1 news available during Discord outages. */ }
  }
  if (!env.DB) return json({ configured: false, items: [] });
  const rows = await env.DB.prepare("SELECT id,title,body,discord_url,published_at FROM news_items WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
  return json({ configured: true, items: rows.results || [] });
}
