import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidatePositionsCache } from '@/lib/platforms/bags-api';
import { verifyConfirmToken } from '@/lib/claim/hmac';
import { CLAIMSCAN_FEE_WALLET, CLAIM_RECOVERY_WINDOW_MS, CLAIM_HMAC_MAX_AGE_MINUTES, SOLANA_FINALIZATION_WAIT_MS } from '@/lib/constants';
import type { ClaimAttemptStatus } from '@/lib/supabase/types';
import { trackClaimEvent, trackFeeCollection } from '@/lib/monitoring';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════
// HMAC Token Single-Use (SS-004)
// Redis-backed consumption tracking prevents replay within the 15-min window.
// ═══════════════════════════════════════════════

let _hmacRedis: import('@upstash/redis').Redis | null = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
    _hmacRedis = new Redis({ url, token });
  }
} catch { /* Redis unavailable — allow through (no regression) */ }

const HMAC_DEDUP_PREFIX = 'claimscan:hmac:used:';
const HMAC_DEDUP_TTL_MS = CLAIM_HMAC_MAX_AGE_MINUTES * 60 * 1000;

// In-memory fallback when Redis is unavailable — prevents replay within a single instance
const _localDedup = new Map<string, number>();

function _pruneLocalDedup() {
  const now = Date.now();
  if (_localDedup.size > 500) {
    for (const [k, exp] of _localDedup) {
      if (exp < now) _localDedup.delete(k);
    }
  }
}

/** Return type distinguishes genuine replay from infrastructure failure. */
type ConsumeResult = 'consumed' | 'replay' | 'redis_outage';

async function consumeHmacToken(token: string): Promise<ConsumeResult> {
  const hash = createHash('sha256').update(token).digest('hex').slice(0, 32);

  if (_hmacRedis) {
    try {
      const result = await _hmacRedis.set(`${HMAC_DEDUP_PREFIX}${hash}`, 1, { px: HMAC_DEDUP_TTL_MS, nx: true });
      return result !== null ? 'consumed' : 'replay'; // null = key existed = replay
    } catch (err) {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { claim: 'redis_outage' },
      });
      // Redis error — fall through to in-memory dedup (dev) or fail-closed (prod)
    }
  }

  // H-3: In production serverless, in-memory dedup is unreliable across cold starts.
  // Reject rather than allow potential replays on financial state transitions.
  if (process.env.NODE_ENV === 'production') {
    console.error('[claim/confirm] HMAC dedup unavailable: Redis down and in-memory is not safe in serverless');
    return 'redis_outage';
  }

  // In-memory fallback for development only
  _pruneLocalDedup();
  const now = Date.now();
  const existing = _localDedup.get(hash);
  if (existing && existing > now) return 'replay';
  _localDedup.set(hash, now + HMAC_DEDUP_TTL_MS);
  return 'consumed';
}

// ═══════════════════════════════════════════════
// Finalization verification (fire-and-forget)
// ═══════════════════════════════════════════════

/**
 * After a claim is marked as 'confirmed', wait for on-chain finalization
 * and upgrade the status to 'finalized'. This runs asynchronously after
 * the response is sent so it never blocks the user.
 *
 * Uses an optimistic lock (eq status='confirmed') to avoid overwriting
 * any concurrent status change (e.g., if a cron already finalized it).
 */
async function verifyFinalization(
  txSignature: string,
  claimAttemptId: string,
  supabase: ReturnType<typeof createServiceClient>
) {
  // Wait for finalization — typically 6-12s after confirmed on Solana
  await new Promise((r) => setTimeout(r, SOLANA_FINALIZATION_WAIT_MS));

  const tx = await withRpcFallback(
    (c) => c.getTransaction(txSignature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    }),
    'finalization-verify'
  );

  if (tx && !tx.meta?.err) {
    await supabase
      .from('claim_attempts')
      .update({ status: 'finalized' as ClaimAttemptStatus })
      .eq('id', claimAttemptId)
      .eq('status', 'confirmed'); // Optimistic lock: only upgrade if still confirmed
  }
}

/**
 * Valid forward-only status transitions.
 * Terminal states (`confirmed`, `finalized`) allow no transitions.
 * `failed` and `expired` allow recovery to `submitted`/`confirmed` when a valid
 * txSignature is provided — this handles hardware wallets (Ledger) where signing
 * takes >5 minutes and the inline cleanup expires the attempt, but the on-chain
 * transaction still succeeds.
 */
const VALID_TRANSITIONS: Record<ClaimAttemptStatus, ClaimAttemptStatus[]> = {
  pending: ['signing', 'failed', 'expired'],
  signing: ['submitted', 'failed', 'expired'],
  submitted: ['confirmed', 'finalized', 'failed', 'expired'],
  confirmed: [],
  finalized: [],
  failed: ['submitted'],
  expired: ['submitted'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Handle fee tx logging (separate from claim status updates)
  if (body.feeTx === true) {
    const { txSignature: feeSig, wallet: feeWallet, feeLamports: rawFeeLamports, confirmToken: feeConfirmToken, claimAttemptId: feeAttemptId } = body as {
      txSignature?: string; wallet?: string; feeLamports?: string; confirmToken?: string; claimAttemptId?: string;
    };
    // Validate inputs to prevent DB pollution from unauthenticated requests
    if (
      !feeSig || typeof feeSig !== 'string' || !TX_SIG_RE.test(feeSig) ||
      !feeWallet || typeof feeWallet !== 'string' || !isValidSolanaAddress(feeWallet) ||
      !rawFeeLamports || typeof rawFeeLamports !== 'string' || !/^\d+$/.test(rawFeeLamports)
    ) {
      console.warn('[claim/confirm] Fee tx rejected: invalid input fields', { hasFeeSig: !!feeSig, hasFeeWallet: !!feeWallet, hasRawFeeLamports: !!rawFeeLamports });
      return NextResponse.json({ ok: true }); // Silent response, logged server-side
    }
    // Require HMAC authentication — fee branch must be called with a valid
    // confirmToken tied to a claimAttemptId+wallet to prevent unauthorized
    // fee log injection from on-chain observers.
    if (
      !feeConfirmToken || typeof feeConfirmToken !== 'string' ||
      !feeAttemptId || typeof feeAttemptId !== 'string' || !UUID_RE.test(feeAttemptId)
    ) {
      console.warn('[claim/confirm] Fee tx rejected: missing HMAC fields', { hasFeeConfirmToken: !!feeConfirmToken, hasFeeAttemptId: !!feeAttemptId });
      return NextResponse.json({ ok: true });
    }
    if (!verifyConfirmToken(feeConfirmToken, feeAttemptId, feeWallet)) {
      console.warn('[claim/confirm] Fee tx rejected: HMAC verification failed', { feeAttemptId, feeWallet });
      return NextResponse.json({ ok: true });
    }
    let feeLamports: string = rawFeeLamports;
    const parsedFee = BigInt(feeLamports);
    if (parsedFee <= 0n) {
      console.warn('[claim/confirm] Fee tx rejected: zero/negative fee', { feeLamports, feeAttemptId });
      return NextResponse.json({ ok: true });
    }

    // Verify the fee tx actually exists on-chain and transferred to the treasury.
    // Verify on-chain via RPC. Mark as verified only if check passes.
    let verified = false;
    try {
      const tx = await withRpcFallback(
        (c) => c.getTransaction(feeSig!, { maxSupportedTransactionVersion: 0 }),
        'fee-verify'
      );
      if (!tx || tx.meta?.err) {
        return NextResponse.json({ ok: true }); // Tx doesn't exist or failed on-chain
      }
      const accountKeys = tx.transaction.message.getAccountKeys();
      const feeWalletIdx = accountKeys.staticAccountKeys.findIndex(
        (key) => key.toBase58() === CLAIMSCAN_FEE_WALLET
      );
      if (feeWalletIdx === -1) {
        return NextResponse.json({ ok: true }); // Tx doesn't involve the fee wallet
      }
      // Verify the actual transferred amount matches claimed feeLamports
      const pre = tx.meta?.preBalances?.[feeWalletIdx] ?? 0;
      const post = tx.meta?.postBalances?.[feeWalletIdx] ?? 0;
      const actualDelta = BigInt(post) - BigInt(pre);
      const claimedFee = BigInt(feeLamports);
      if (actualDelta < claimedFee) {
        // Client reported more than actually transferred — store actual amount
        feeLamports = actualDelta > 0n ? actualDelta.toString() : '0';
      }
      verified = actualDelta > 0n;
    } catch {
      // RPC failure — insert with fee_lamports='0' to track the attempt.
      // Actual amount will be reconciled via cron once RPC is available.
      // Never trust client-supplied rawFeeLamports for unverified records.
      console.error(`[claim/confirm] FEE_VERIFICATION_FAILED: sig=${feeSig} wallet=${feeWallet?.slice(0, 6)}...${feeWallet?.slice(-4)} lamports=${rawFeeLamports} — inserting unverified record with amount=0`);
      trackClaimEvent('failure', { reason: 'fee_verification_rpc_error', wallet: feeWallet ?? '', feeLamports: rawFeeLamports ?? '0' });
      try {
        const svc = createServiceClient();
        await svc.from('claim_fees').insert({
          wallet_address: feeWallet,
          tx_signature: feeSig,
          fee_lamports: '0',
          verified: false,
        });
      } catch (insertErr) {
        console.error('[claim/confirm] Failed to insert unverified fee record:', insertErr instanceof Error ? insertErr.message : insertErr);
      }
      return NextResponse.json({ ok: true, pendingVerification: true });
    }

    // Skip insert if on-chain verification found zero transfer (avoids CHECK constraint violation)
    if (feeLamports === '0') {
      return NextResponse.json({ ok: true });
    }

    const supabase = createServiceClient();
    const { error: insertError } = await supabase.from('claim_fees').insert({
      wallet_address: feeWallet,
      tx_signature: feeSig,
      fee_lamports: feeLamports,
      verified,
    });
    if (insertError && insertError.code !== '23505') {
      console.error('[claim/confirm] Fee log insert FAILED (revenue loss):', insertError.message, { sig: feeSig, wallet: feeWallet });
      trackClaimEvent('failure', { reason: 'fee_insert_error', wallet: feeWallet ?? '', feeLamports });
    } else {
      trackFeeCollection(true, feeLamports);
      trackClaimEvent('fee_collected', { wallet: feeWallet ?? '', feeLamports });
    }
    return NextResponse.json({ ok: true });
  }

  const { claimAttemptId, wallet, confirmToken, txSignature, status, errorReason } = body as {
    claimAttemptId?: string; wallet?: string; confirmToken?: string;
    txSignature?: string; status?: string; errorReason?: string;
  };

  // Validate all required auth fields
  if (!claimAttemptId || typeof claimAttemptId !== 'string' || !UUID_RE.test(claimAttemptId)) {
    return NextResponse.json({ error: 'Valid claimAttemptId (UUID) is required' }, { status: 400 });
  }
  if (!wallet || typeof wallet !== 'string' || !isValidSolanaAddress(wallet)) {
    return NextResponse.json({ error: 'Valid wallet address is required' }, { status: 400 });
  }
  if (!confirmToken || typeof confirmToken !== 'string') {
    return NextResponse.json({ error: 'confirmToken is required' }, { status: 400 });
  }

  const validStatuses: readonly ClaimAttemptStatus[] = ['signing', 'submitted', 'confirmed', 'finalized', 'failed', 'expired'];
  if (!status || !validStatuses.includes(status as ClaimAttemptStatus)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
  }

  if (txSignature && (typeof txSignature !== 'string' || !TX_SIG_RE.test(txSignature))) {
    return NextResponse.json({ error: 'Invalid txSignature format' }, { status: 400 });
  }

  // Require txSignature for transitions that imply an on-chain transaction
  if ((status === 'submitted' || status === 'confirmed' || status === 'finalized') && !txSignature) {
    return NextResponse.json({ error: `txSignature is required for status '${status}'` }, { status: 400 });
  }

  // Verify HMAC token — constant-time comparison prevents timing attacks
  if (!verifyConfirmToken(confirmToken, claimAttemptId, wallet)) {
    return NextResponse.json({ error: 'Invalid confirm token' }, { status: 403 });
  }

  // Single-use enforcement (SS-004): prevent HMAC token replay within 15-min window
  const tokenResult = await consumeHmacToken(confirmToken);
  if (tokenResult === 'redis_outage') {
    return NextResponse.json({ error: 'Service temporarily unavailable, please retry' }, { status: 503 });
  }
  if (tokenResult === 'replay') {
    return NextResponse.json({ error: 'Token already used' }, { status: 409 });
  }

  const supabase = createServiceClient();

  // Fetch attempt and verify wallet ownership
  const { data: attempt, error: fetchError } = await supabase
    .from('claim_attempts')
    .select('id, wallet_address, token_address, platform, chain, status, created_at')
    .eq('id', claimAttemptId)
    .single();

  if (fetchError || !attempt) {
    return NextResponse.json({ error: 'Claim attempt not found' }, { status: 404 });
  }

  // Verify the caller owns this claim attempt
  if (attempt.wallet_address !== wallet) {
    return NextResponse.json({ error: 'Wallet mismatch' }, { status: 403 });
  }

  // Don't allow updating already finalized claims
  if (attempt.status === 'confirmed' || attempt.status === 'finalized') {
    return NextResponse.json({ error: 'Claim already finalized' }, { status: 409 });
  }

  // Enforce forward-only status transitions (reject unknown or disallowed)
  const validatedStatus = status as ClaimAttemptStatus;
  const allowed = VALID_TRANSITIONS[attempt.status];
  if (!allowed || !allowed.includes(validatedStatus)) {
    return NextResponse.json(
      { error: 'Invalid status transition' },
      { status: 422 }
    );
  }

  // Limit recovery window: failed/expired → submitted only within the configured window
  if (
    (attempt.status === 'failed' || attempt.status === 'expired') &&
    validatedStatus === 'submitted'
  ) {
    const createdAt = new Date(attempt.created_at).getTime();
    if (Date.now() - createdAt > CLAIM_RECOVERY_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Recovery window expired — start a new claim' },
        { status: 410 }
      );
    }
  }

  // Update the claim attempt
  const updateData: {
    status: string;
    updated_at: string;
    tx_signature?: string;
    error_reason?: string;
  } = {
    status: validatedStatus,
    updated_at: new Date().toISOString(),
  };
  if (txSignature) updateData.tx_signature = txSignature;
  if (errorReason && typeof errorReason === 'string') {
    updateData.error_reason = errorReason.replace(/[\x00-\x1f\x7f\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '').trim().slice(0, 500);
  }

  // Optimistic lock: only update if status hasn't changed since we read it
  const { error: updateError, count: updateCount } = await supabase
    .from('claim_attempts')
    .update(updateData, { count: 'exact' })
    .eq('id', claimAttemptId)
    .eq('status', attempt.status);

  if (updateError) {
    // 23505 = unique_violation — another active claim exists for this wallet+token
    // (e.g., recovery transition from failed→submitted while a new claim was created)
    if (updateError.code === '23505') {
      return NextResponse.json({ error: 'Another active claim exists for this token' }, { status: 409 });
    }
    console.error('[claim/confirm] Update error:', updateError.message);
    trackClaimEvent('failure', { reason: 'db_update_error', claimAttemptId, wallet: wallet ?? '', status: validatedStatus });
    return NextResponse.json({ error: 'Failed to update claim status' }, { status: 500 });
  }
  if (updateCount === 0) {
    // Status was changed by a concurrent request — stale update
    return NextResponse.json({ error: 'Claim status was already updated' }, { status: 409 });
  }

  // On confirmed: invalidate positions cache + schedule finalization upgrade
  if (validatedStatus === 'confirmed') {
    invalidatePositionsCache(attempt.wallet_address);
    trackClaimEvent('success', { claimAttemptId, wallet: wallet ?? '', platform: attempt.platform ?? '', chain: attempt.chain ?? '' });

    // Fire-and-forget: upgrade confirmed → finalized after on-chain finalization.
    // This runs after the response is sent so it doesn't block the user.
    if (txSignature) {
      verifyFinalization(txSignature, claimAttemptId, supabase).catch((err) => {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { claim: 'finalization_failed' },
          extra: { txSignature, claimAttemptId },
        });
      });
    }
  }

  // Track claim failures reported by the client
  if (validatedStatus === 'failed') {
    trackClaimEvent('failure', { reason: errorReason ?? 'unknown', claimAttemptId, wallet: wallet ?? '', platform: attempt.platform ?? '' });
  }

  return NextResponse.json({ ok: true, status: validatedStatus });
}
