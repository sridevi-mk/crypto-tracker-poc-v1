const AUTH_COOKIE_NAME = "ct_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function getSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getAuthCookieName() {
  return AUTH_COOKIE_NAME;
}

export function isAuthConfigured() {
  return Boolean(getSecret());
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(sig));
}

export async function createSessionToken(username: string) {
  const secret = getSecret();
  if (!secret) return null;

  const exp = Math.floor(Date.now() / 1000) + DEFAULT_SESSION_TTL_SECONDS;
  const payload = `${username}.${exp}`;
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length < 3) return false;

  const signature = parts.pop();
  const payload = parts.join(".");
  if (!signature) return false;

  const expectedSignature = await signPayload(payload, secret);
  if (signature.length !== expectedSignature.length) return false;
  if (signature !== expectedSignature) return false;

  const payloadParts = payload.split(".");
  const exp = Number(payloadParts[payloadParts.length - 1]);
  if (!Number.isFinite(exp)) return false;

  const now = Math.floor(Date.now() / 1000);
  return now < exp;
}

function parseUsernameFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 3) return null;

  const payloadParts = parts.slice(0, -1);
  if (payloadParts.length < 2) return null;

  const username = payloadParts.slice(0, -1).join(".");
  if (!username) return null;
  return username;
}

export async function getAuthenticatedUsername(token: string | undefined | null) {
  const valid = await verifySessionToken(token);
  if (!valid) return null;
  return parseUsernameFromToken(token);
}
