import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { pushSSEEvent } from '@/lib/helius/sse-registry';

// ═══════════════════════════════════════════════
// Helius Webhook Receiver
// Receives enhanced transaction events from Helius and pushes
// real-time updates to connected SSE clients.
// ═══════════════════════════════════════════════

const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;

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
  // Verify webhook secret — fail closed if not configured
  if (!WEBHOOK_SECRET) {
    console.error('[webhook] HELIUS_WEBHOOK_SECRET is not configured — rejecting request');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization');
  if (!verifyWebhookSecret(authHeader, WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as HeliusWebhookEvent[];

    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let totalNotified = 0;

    for (const event of payload) {
      // Collect all accounts affected by this transaction
      const affectedAccounts = new Set<string>();

      for (const transfer of event.nativeTransfers ?? []) {
        affectedAccounts.add(transfer.toUserAccount);
        affectedAccounts.add(transfer.fromUserAccount);
      }

      for (const transfer of event.tokenTransfers ?? []) {
        affectedAccounts.add(transfer.toUserAccount);
        affectedAccounts.add(transfer.fromUserAccount);
      }

      for (const data of event.accountData ?? []) {
        affectedAccounts.add(data.account);
      }

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
