function cookie(name, value, maxAge = 600) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) return new Response("Discord OAuth is not configured.", { status: 500 });
  const stateBytes = new Uint8Array(24); crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, b => b.toString(16).padStart(2,"0")).join("");
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return") || "/";
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") && !/[\u0000-\u001f]/.test(returnTo) ? returnTo : "/";
  const auth = new URL("https://discord.com/oauth2/authorize");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  auth.searchParams.set("scope", "identify");
  auth.searchParams.set("state", state);
  auth.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
  const headers = new Headers({ Location: auth.toString() });
  headers.append("Set-Cookie", cookie("teacafe_oauth_state", state));
  headers.append("Set-Cookie", cookie("teacafe_return", encodeURIComponent(safeReturn)));
  return new Response(null, { status: 302, headers });
}
