const enc = new TextEncoder();
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const hit = raw.split(/;\s*/).find(x => x.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : null;
}
function b64url(bytes) {
  let s=""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
}
function clear(name){return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
function returnPath(request) {
  const raw = getCookie(request, "teacafe_return");
  let path = "/";
  try { path = decodeURIComponent(raw || "/"); } catch {}
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !/[\u0000-\u001f]/.test(path) ? path : "/";
}
function finish(request, status, session) {
  const target = new URL(returnPath(request), new URL(request.url).origin);
  if (status) target.searchParams.set("auth", status);
  const headers = new Headers({ Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (session) headers.append("Set-Cookie", session);
  headers.append("Set-Cookie", clear("teacafe_oauth_state"));
  headers.append("Set-Cookie", clear("teacafe_return"));
  return new Response(null, { status: 302, headers });
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const expected = getCookie(request,"teacafe_oauth_state");
  if (url.searchParams.get("error") === "access_denied") return finish(request, "cancelled");
  if (!state || !expected || state !== expected) return finish(request, "expired");
  if (url.searchParams.has("error") || !code) return finish(request, "failed");
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI || !env.SESSION_SECRET) return new Response("Discord OAuth is not configured.", { status: 500 });
  const form = new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:env.DISCORD_REDIRECT_URI,client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET});
  let tokenRes;
  try { tokenRes = await fetch("https://discord.com/api/oauth2/token", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form}); }
  catch { return finish(request, "failed"); }
  if(!tokenRes.ok) return finish(request, "failed");
  let token;
  try { token = await tokenRes.json(); } catch { return finish(request, "failed"); }
  if (!token?.access_token) return finish(request, "failed");
  let userRes;
  try { userRes = await fetch("https://discord.com/api/v10/users/@me", {headers:{Authorization:`Bearer ${token.access_token}`}}); }
  catch { return finish(request, "failed"); }
  if(!userRes.ok) return finish(request, "failed");
  let user;
  try { user = await userRes.json(); } catch { return finish(request, "failed"); }
  if (!user?.id || !user?.username) return finish(request, "failed");
  const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
  if (env.DB) {
    const now = new Date().toISOString();
    try {
      await env.DB.prepare(`INSERT INTO site_members (discord_id,username,global_name,avatar_url,first_login_at,last_login_at,login_count)
        VALUES (?,?,?,?,?,?,1)
        ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,global_name=excluded.global_name,
          avatar_url=excluded.avatar_url,last_login_at=excluded.last_login_at,login_count=site_members.login_count+1`)
        .bind(String(user.id),String(user.username),user.global_name||null,avatarUrl,now,now).run();
    } catch (error) { console.error('Could not record site member login', error); }
  }
  const sessionData = {id:user.id,username:user.username,global_name:user.global_name||null,avatar_url:avatarUrl,exp:Math.floor(Date.now()/1000)+604800};
  const payload = b64url(enc.encode(JSON.stringify(sessionData))); const signature = await sign(payload, env.SESSION_SECRET);
  return finish(request, null, `teacafe_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
}
