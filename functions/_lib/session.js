const enc = new TextEncoder();
const dec = new TextDecoder();

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const hit = raw
    .split(/;\s*/)
    .find((part) => part.startsWith(name + "="));

  return hit ? hit.slice(name.length + 1) : null;
}

function fromBase64Url(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const raw = atob(value);

  return Uint8Array.from(
    raw,
    (char) => char.charCodeAt(0)
  );
}

async function verify(payload, signature, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    enc.encode(payload)
  );
}

export async function getSessionUser(request, env) {
  if (!env.SESSION_SECRET) {
    return null;
  }

  const value = readCookie(
    request,
    "teacafe_session"
  );

  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  const valid = await verify(
    payload,
    signature,
    env.SESSION_SECRET
  );

  if (!valid) {
    return null;
  }

  try {
    const user = JSON.parse(
      dec.decode(fromBase64Url(payload))
    );

    if (
      !user.exp ||
      user.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}
