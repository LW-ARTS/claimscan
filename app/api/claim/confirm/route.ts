import { NextResponse } from 'next/server';
import { isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidatePositionsCache } from '@/lib/platforms/bags-api';
import { generateConfirmToken, verifyConfirmToken } from '@/lib/claim/hmac';
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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Handle fee tx logging (separate from claim status updates)
  if (body.feeTx === true) {
    const { txSignature: feeSig, wallet: feeWallet, feeLamports } = body as {
      txSignature?: string; wallet?: string; feeLamports?: string;
    };
    // Validate inputs to prevent DB pollution from unauthenticated requests
    if (
      !feeSig || typeof feeSig !== 'string' || !TX_SIG_RE.test(feeSig) ||
      !feeWallet || typeof feeWallet !== 'string' || !isValidSolanaAddress(feeWallet) ||
      !feeLamports || typeof feeLamports !== 'string' || !/^\d+$/.test(feeLamports)
    ) {
      return NextResponse.json({ ok: true }); // Silent ignore invalid data
    }
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
      const feeWalletFound = accountKeys.staticAccountKeys.some(
        (key) => key.toBase58() === CLAIMSCAN_FEE_WALLET
      );
      if (!feeWalletFound) {
        return NextResponse.json({ ok: true }); // Tx doesn't involve the fee wallet
      }
      verified = true;
    } catch {
      // RPC failure — insert as unverified. Revenue dashboard reconciles later.
    }

    const supabase = createServiceClient();
    await supabase.from('claim_fees').insert({
      wallet_address: feeWallet,
      tx_signature: feeSig,
      fee_lamports: feeLamports,
      verified,
    }).then(({ error }) => {
      if (error && error.code !== '23505') {
        console.warn('[claim/confirm] Fee log insert failed:', error.message);
      }
    });
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
  let expectedToken: string;
  try {
    expectedToken = generateConfirmToken(claimAttemptId, wallet);
  } catch {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!verifyConfirmToken(confirmToken, expectedToken)) {
    return NextResponse.json({ error: 'Invalid confirm token' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Fetch attempt and verify wallet ownership
  const { data: attempt, error: fetchError } = await supabase
    .from('claim_attempts')
    .select('id, wallet_address, token_address, platform, chain, status')
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

  // Update the claim attempt
  const updateData: Record<string, unknown> = {
    status: validatedStatus,
    updated_at: new Date().toISOString(),
  };
  if (txSignature) updateData.tx_signature = txSignature;
  if (errorReason && typeof errorReason === 'string') {
    updateData.error_reason = errorReason.slice(0, 500);
  }

  // Optimistic lock: only update if status hasn't changed since we read it
  const { error: updateError, count: updateCount } = await supabase
    .from('claim_attempts')
    .update(updateData, { count: 'exact' })
    .eq('id', claimAttemptId)
    .eq('status', attempt.status);

  if (updateError) {
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
