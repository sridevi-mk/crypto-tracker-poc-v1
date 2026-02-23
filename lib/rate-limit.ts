type BucketEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, BucketEntry>();

function now() {
  return Date.now();
}

function cleanupExpired() {
  const t = now();
  for (const [k, v] of buckets.entries()) {
    if (t >= v.resetAt) buckets.delete(k);
  }
}

export function getRequestClientKey(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function checkRateLimit(params: {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
}) {
  cleanupExpired();

  const { bucket, key, limit, windowMs } = params;
  const fullKey = `${bucket}:${key}`;
  const t = now();
  const existing = buckets.get(fullKey);

  if (!existing || t >= existing.resetAt) {
    const resetAt = t + windowMs;
    buckets.set(fullKey, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - t) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(fullKey, existing);
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - t) / 1000)),
  };
}
