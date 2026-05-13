type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function checkInMemoryRateLimit(key: string, options?: { limit?: number; windowMs?: number }): RateLimitResult {
  const limit = options?.limit ?? Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 12);
  const windowMs = options?.windowMs ?? 60_000;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}
