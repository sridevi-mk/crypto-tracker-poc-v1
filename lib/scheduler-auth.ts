const encoder = new TextEncoder();
const seenNonces = new Map<string, number>();

const MAX_SKEW_SECONDS = 300;
const NONCE_TTL_SECONDS = 600;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, payload: string) {
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

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function cleanupNonces() {
  const t = nowSec();
  for (const [nonce, exp] of seenNonces.entries()) {
    if (exp <= t) seenNonces.delete(nonce);
  }
}

function registerNonce(nonce: string) {
  cleanupNonces();
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, nowSec() + NONCE_TTL_SECONDS);
  return true;
}

export async function verifySchedulerSignature(input: {
  secret: string;
  timestampHeader?: string | null;
  nonceHeader?: string | null;
  signatureHeader?: string | null;
  body: string;
}) {
  const tsRaw = input.timestampHeader?.trim() || "";
  const nonce = input.nonceHeader?.trim() || "";
  const signature = input.signatureHeader?.trim().toLowerCase() || "";

  if (!tsRaw || !nonce || !signature) {
    return { ok: false, reason: "missing_signature_headers" as const };
  }

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid_timestamp" as const };
  }

  const drift = Math.abs(nowSec() - ts);
  if (drift > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_window" as const };
  }

  if (!registerNonce(nonce)) {
    return { ok: false, reason: "replay_detected" as const };
  }

  const expected = await hmacSha256Hex(input.secret, `${tsRaw}.${nonce}.${input.body}`);
  if (expected !== signature) {
    return { ok: false, reason: "signature_mismatch" as const };
  }

  return { ok: true as const };
}
