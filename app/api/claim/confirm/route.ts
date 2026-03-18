import { NextResponse } from 'next/server';
import { isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidatePositionsCache } from '@/lib/platforms/bags-api';
import { verifyConfirmToken } from '@/lib/claim/hmac';
import { CLAIMSCAN_FEE_WALLET } from '@/lib/constants';
import type { ClaimAttemptStatus } from '@/lib/supabase/types';

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
      return NextResponse.json({ ok: true }); // Silent ignore invalid data
    }
    // Require HMAC authentication — fee branch must be called with a valid
    // confirmToken tied to a claimAttemptId+wallet to prevent unauthorized
    // fee log injection from on-chain observers.
    if (
      !feeConfirmToken || typeof feeConfirmToken !== 'string' ||
      !feeAttemptId || typeof feeAttemptId !== 'string' || !UUID_RE.test(feeAttemptId)
    ) {
      return NextResponse.json({ ok: true }); // Silent ignore unauthenticated
    }
    if (!verifyConfirmToken(feeConfirmToken, feeAttemptId, feeWallet)) {
      return NextResponse.json({ ok: true });
    }
    let feeLamports: string = rawFeeLamports;
    const parsedFee = BigInt(feeLamports);
    if (parsedFee <= 0n) return NextResponse.json({ ok: true });

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
    } catch (rpcErr) {
      // RPC failure — insert with fee_lamports='0' to track the attempt.
      // Actual amount will be reconciled via cron once RPC is available.
      // Never trust client-supplied rawFeeLamports for unverified records.
      console.error(`[claim/confirm] FEE_VERIFICATION_FAILED: sig=${feeSig} wallet=${feeWallet} lamports=${rawFeeLamports} — inserting unverified record with amount=0`);
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

  // Limit recovery window: failed/expired → submitted only within 15 minutes
  const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
  if (
    (attempt.status === 'failed' || attempt.status === 'expired') &&
    validatedStatus === 'submitted'
  ) {
    const createdAt = new Date(attempt.created_at).getTime();
    if (Date.now() - createdAt > RECOVERY_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Recovery window expired — start a new claim' },
        { status: 410 }
      );
    }
  }

  // Update the claim attempt
  const updateData: Record<string, unknown> = {
    status: validatedStatus,
    updated_at: new Date().toISOString(),
  };
  if (txSignature) updateData.tx_signature = txSignature;
  if (errorReason && typeof errorReason === 'string') {
    // eslint-disable-next-line no-control-regex
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
    return NextResponse.json({ error: 'Failed to update claim status' }, { status: 500 });
  }
  if (updateCount === 0) {
    // Status was changed by a concurrent request — stale update
    return NextResponse.json({ error: 'Claim status was already updated' }, { status: 409 });
  }

  // On confirmed: invalidate positions cache
  if (validatedStatus === 'confirmed') {
    invalidatePositionsCache(attempt.wallet_address);
  }

  return NextResponse.json({ ok: true, status: validatedStatus });
}
