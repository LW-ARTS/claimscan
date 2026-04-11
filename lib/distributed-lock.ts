import 'server-only';
import { randomUUID } from 'crypto';

type UpstashRedis = import('@upstash/redis').Redis;

// Lazy Redis init (reused across creator-resolve, cron, and any other caller)
let _redis: UpstashRedis | null | undefined;

async function getRedis(): Promise<UpstashRedis | null> {
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
 * Sentinel returned when Redis is unavailable and the acquisition
 * degrades to fail-open. `releaseLock` treats this as a no-op.
 */
export const NO_REDIS_TOKEN = '__no-redis__' as const;
export type LockToken = string;

/**
 * Server-side compare-and-delete script. Only deletes the key if its
 * current value matches ARGV[1] (the caller's token). This closes the
 * "foreign release" anti-pattern where a late finalizer from process A
 * would otherwise release a lock that process B now owns after A's TTL
 * expired and B reacquired it.
 *
 * Loaded once per Upstash instance via SCRIPT LOAD, then invoked by SHA
 * on every release. Loading via Upstash's scriptLoad returns a SHA that
 * we cache in memory; if it's flushed or unavailable on a subsequent
 * call, we fall back to re-loading it.
 */
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

let _scriptSha: string | null = null;

async function getScriptSha(redis: UpstashRedis): Promise<string | null> {
  if (_scriptSha) return _scriptSha;
  try {
    _scriptSha = await redis.scriptLoad(RELEASE_SCRIPT);
    return _scriptSha;
  } catch {
    return null;
  }
}

/**
 * Try to acquire a distributed lock keyed on `claimscan:lock:<key>`.
 *
 * Returns:
 *   - a fresh UUID token on successful acquisition (pass it to releaseLock)
 *   - NO_REDIS_TOKEN when Redis is unavailable (fail-open — caller should
 *     proceed; instance-local dedup still provides same-instance protection)
 *   - null when another process currently holds the lock
 *
 * `ttlSeconds` defaults to 60. Call sites inside request handlers with a
 * Vercel maxDuration of 60s should pass a TTL strictly greater than that
 * (e.g. 90) so the lock cannot expire while the holder is still running.
 */
export async function tryAcquireLock(
  key: string,
  ttlSeconds = 60,
): Promise<LockToken | null> {
  const redis = await getRedis();
  if (!redis) return NO_REDIS_TOKEN;
  const token = randomUUID();
  try {
    const result = await redis.set(`claimscan:lock:${key}`, token, {
      nx: true,
      ex: ttlSeconds,
    });
    return result === 'OK' ? token : null;
  } catch {
    return NO_REDIS_TOKEN;
  }
}

/**
 * Release a previously-acquired lock. Ownership-verified via Lua CAS.
 *
 * - `null` token → noop (the caller never acquired the lock)
 * - `NO_REDIS_TOKEN` → noop (fail-open acquisition; nothing to release)
 * - UUID token → atomic compare-and-delete; only deletes if we still own
 *   the key. If another process has since acquired it (because our TTL
 *   expired and they took ownership), their lock is preserved.
 */
export async function releaseLock(
  key: string,
  token: LockToken | null,
): Promise<void> {
  if (!token || token === NO_REDIS_TOKEN) return;
  const redis = await getRedis();
  if (!redis) return;
  try {
    const sha = await getScriptSha(redis);
    if (!sha) return;
    await redis.evalsha(sha, [`claimscan:lock:${key}`], [token]);
  } catch {
    // Best-effort: lock will expire via TTL. If evalsha fails because the
    // script cache was flushed, reset the SHA so the next call reloads it.
    _scriptSha = null;
  }
}
