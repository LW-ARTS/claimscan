import 'server-only';

// Lazy Redis init (reused across creator-resolve, cron, and any other caller)
let _redis: import('@upstash/redis').Redis | null | undefined;

async function getRedis(): Promise<import('@upstash/redis').Redis | null> {
  if (_redis !== undefined) return _redis;
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (url && token) {
      const { Redis } = await import('@upstash/redis');
      _redis = new Redis({ url, token });
    } else {
      _redis = null;
    }
  } catch {
    _redis = null;
  }
  return _redis;
}

/**
 * Try to acquire a distributed lock keyed on `claimscan:lock:<key>`.
 * Returns true if acquired (or if Redis unavailable, fail-open),
 * false if another process holds the lock.
 *
 * `ttlSeconds` defaults to 60 (matches the original creator-resolve lock).
 */
export async function tryAcquireLock(key: string, ttlSeconds = 60): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true; // No Redis: fail-open, instance-local dedup still active
  try {
    const result = await redis.set(`claimscan:lock:${key}`, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch {
    return true; // Redis failure: fail-open
  }
}

export async function releaseLock(key: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(`claimscan:lock:${key}`);
  } catch {
    // Best-effort: lock will expire via TTL
  }
}
