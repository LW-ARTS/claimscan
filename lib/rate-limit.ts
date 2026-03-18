import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let generalLimiter: Ratelimit | null = null;
let searchLimiter: Ratelimit | null = null;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (url && token) {
  const redis = new Redis({ url, token });

  generalLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    prefix: 'claimscan:rl',
    analytics: true,
  });

  searchLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'claimscan:rl:search',
    analytics: true,
  });
}

if (!generalLimiter && process.env.NODE_ENV === 'production') {
  console.error('[rate-limit] CRITICAL: Upstash Redis not configured in production. Rate limiting is per-instance only.');
}

export { generalLimiter, searchLimiter };
