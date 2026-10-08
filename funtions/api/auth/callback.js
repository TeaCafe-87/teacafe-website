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
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const expected = getCookie(request,"teacafe_oauth_state");
  if (!code || !state || !expected || state !== expected) return new Response("Invalid OAuth state.", { status: 400 });
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI || !env.SESSION_SECRET) return new Response("Discord OAuth is not configured.", { status: 500 });
  const form = new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:env.DISCORD_REDIRECT_URI,client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET});
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  if(!tokenRes.ok) return new Response("Discord token exchange failed.",{status:502});
  const token = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/v10/users/@me", {headers:{Authorization:`Bearer ${token.access_token}`}});
  if(!userRes.ok) return new Response("Discord user lookup failed.",{status:502});
  const user = await userRes.json();
  const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
  const sessionData = {id:user.id,username:user.username,global_name:user.global_name||null,avatar_url:avatarUrl,exp:Math.floor(Date.now()/1000)+604800};
  const payload = b64url(enc.encode(JSON.stringify(sessionData))); const signature = await sign(payload, env.SESSION_SECRET);
  const retRaw = getCookie(request,"teacafe_return"); let returnTo="/"; try{returnTo=decodeURIComponent(retRaw||"/")}catch{}
  if(!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\") || /[\u0000-\u001f]/.test(returnTo)) returnTo="/";
  const headers = new Headers({Location:returnTo});
  headers.append("Set-Cookie", `teacafe_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
  headers.append("Set-Cookie", clear("teacafe_oauth_state")); headers.append("Set-Cookie", clear("teacafe_return"));
  return new Response(null,{status:302,headers});
}
