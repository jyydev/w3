const loginCookieName = "w3_login";
const loginMaxAge = 365 * 24 * 60 * 60;

function getLoginSecret() {
  return String(process.env.login || "");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa == "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value = "") {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary =
    typeof atob == "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlToText(value = "") {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function getLoginKey() {
  const secret = getLoginSecret();
  if (!secret) throw new Error("login env missing");

  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signLoginPayload(payload = "") {
  const key = await getLoginKey();
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

export function getLoginCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV == "production",
    path: "/",
    maxAge: loginMaxAge,
  };
}

export function isValidLoginPassword(pass = "") {
  return getLoginSecret()
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(String(pass));
}

export async function createLoginSession() {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ exp: Date.now() + loginMaxAge * 1000 }),
    ),
  );
  const signature = await signLoginPayload(payload);

  return `${payload}.${signature}`;
}

export async function verifyLoginSession(token = "") {
  try {
    const [payload = "", signature = ""] = String(token).split(".");
    if (!payload || !signature) return false;

    const body = JSON.parse(base64UrlToText(payload));
    if (!body?.exp || Date.now() > Number(body.exp)) return false;

    const key = await getLoginKey();
    return globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

export { loginCookieName, loginMaxAge };
