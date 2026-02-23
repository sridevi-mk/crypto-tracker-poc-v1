const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function randomSaltHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function deriveHash(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(saltHex),
      iterations: 120_000,
      hash: "SHA-256",
    },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string) {
  const salt = randomSaltHex();
  const hash = await deriveHash(password, salt);
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const hash = await deriveHash(password, salt);
  if (hash.length !== expectedHash.length) return false;
  return hash === expectedHash;
}
