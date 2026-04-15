import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { pushSSEEvent } from '@/lib/helius/sse-registry';

// ═══════════════════════════════════════════════
// Helius Webhook Receiver
// Receives enhanced transaction events from Helius and pushes
// real-time updates to connected SSE clients.
// ═══════════════════════════════════════════════

const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;

// Replay protection: Redis-backed dedup persists across cold starts (M3).
// Falls back to in-memory Map when Redis is unavailable.
const DEDUP_PREFIX = 'claimscan:webhook:sig:';
const DEDUP_TTL_MS = 5 * 60 * 1000;

let _redis: import('@upstash/redis').Redis | null = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
    _redis = new Redis({ url, token });
  }
} catch { /* Redis unavailable — fall back to in-memory */ }

const processedSignatures = new Map<string, number>();
const DEDUP_MAX_SIZE = 5000;

async function isReplay(signature: string): Promise<boolean> {
  // Try Redis first — persists across cold starts
  if (_redis) {
    try {
      const result = await _redis.set(`${DEDUP_PREFIX}${signature}`, 1, { px: DEDUP_TTL_MS, nx: true });
      // SET NX returns 'OK' on success (new key), null if key already exists (replay)
      return result === null;
    } catch {
      // Redis failed — fall through to in-memory
    }
  }

  // In-memory fallback (per-instance, resets on cold start)
  const now = Date.now();
  if (processedSignatures.size > DEDUP_MAX_SIZE) {
    for (const [sig, ts] of processedSignatures) {
      if (now - ts > DEDUP_TTL_MS) processedSignatures.delete(sig);
    }
  }
  if (processedSignatures.has(signature)) return true;
  processedSignatures.set(signature, now);
  return false;
}

function verifyWebhookSecret(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  const maxLen = Math.max(actual.length, expected.length);
  const paddedActual = Buffer.alloc(maxLen);
  const paddedExpected = Buffer.alloc(maxLen);
  actual.copy(paddedActual);
  expected.copy(paddedExpected);
  return actual.length === expected.length && timingSafeEqual(paddedActual, paddedExpected);
}

interface HeliusWebhookEvent {
  type: string;
  signature: string;
  timestamp: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
  }>;
}

export async function POST(request: Request) {
  // Verify webhook secret — fail closed if not configured or too short.
  // Min 32 chars matches the CRON_SECRET requirement (lib/supabase/service.ts).
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length < 32) {
    console.error('[webhook] HELIUS_WEBHOOK_SECRET not configured or too short (min 32 chars)');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization');
  if (!verifyWebhookSecret(authHeader, WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Guard against oversized payloads (max 1MB).
    // Require Content-Length to prevent chunked transfer encoding bypass,
    // then verify actual byteLength because Content-Length is advisory and
    // attackers can lie about it before streaming a larger body.
    const contentLength = request.headers.get('content-length');
    if (!contentLength) {
      return NextResponse.json({ error: 'Content-Length required' }, { status: 411 });
    }
    const parsedLength = parseInt(contentLength, 10);
    if (isNaN(parsedLength) || parsedLength > 1_048_576) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const buf = await request.arrayBuffer();
    if (buf.byteLength > 1_048_576) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    const payload = JSON.parse(new TextDecoder().decode(buf)) as HeliusWebhookEvent[];

    if (!Array.isArray(payload) || payload.length > 500) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let totalNotified = 0;
    const MAX_TOTAL_ACCOUNTS = 1000;
    let totalAccounts = 0;

    for (const event of payload) {
      if (totalAccounts >= MAX_TOTAL_ACCOUNTS) break;
      // Skip already-processed events (replay protection — Redis-backed)
      if (event.signature && await isReplay(event.signature)) continue;
      const affectedAccounts = new Set<string>();

      for (const transfer of (event.nativeTransfers ?? []).slice(0, 100)) {
        affectedAccounts.add(transfer.toUserAccount);
        affectedAccounts.add(transfer.fromUserAccount);
      }

      for (const transfer of (event.tokenTransfers ?? []).slice(0, 100)) {
        affectedAccounts.add(transfer.toUserAccount);
        affectedAccounts.add(transfer.fromUserAccount);
      }

      for (const data of (event.accountData ?? []).slice(0, 100)) {
        affectedAccounts.add(data.account);
      }
      totalAccounts += affectedAccounts.size;

      // Push SSE update to connected clients watching these accounts
      const sseData = {
        type: 'fee-update',
        signature: event.signature,
        timestamp: event.timestamp,
      };

      for (const account of affectedAccounts) {
        totalNotified += pushSSEEvent(account, sseData);
      }
    }

    return NextResponse.json({ ok: true, notified: totalNotified });
  } catch (err) {
    console.error('[webhook] processing failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
