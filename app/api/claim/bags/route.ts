import { NextResponse } from 'next/server';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { createServiceClient } from '@/lib/supabase/service';
import { generateBatchClaimTransactions } from '@/lib/platforms/bags-claim';
import { feeScopedAttemptId, generateConfirmToken } from '@/lib/claim/hmac';
import { verifyWalletProof } from '@/lib/claim/wallet-proof';
import { computeMintsHashPrefix } from '@/lib/claim/wallet-proof-msg';
import {
  CLAIMSCAN_FEE_BPS,
  MIN_FEE_LAMPORTS,
  MAX_ACTIVE_CLAIMS_PER_WALLET,
  MAX_MINTS_PER_CLAIM_BATCH,
  CLAIM_PENDING_EXPIRY_MS,
  CLAIM_SUBMITTED_EXPIRY_MS,
} from '@/lib/constants';
import { trackClaimEvent, trackPerformance, trackFeeCollection } from '@/lib/monitoring';
import { verifyTurnstile } from '@/lib/turnstile';

/** Vercel Hobby hard limit is 10s. Reduced batch size (10 mints) fits within this budget. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  // Fail fast if HMAC secret is not configured
  try { generateConfirmToken('_test', '_test'); } catch {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body: {
    wallet?: string;
    tokenMints?: string[];
    fullTokenMints?: string[];
    cfTurnstileToken?: string;
    walletProofMessage?: string;
    walletProofSignature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { wallet, tokenMints } = body;

  // Validate wallet
  if (!wallet || typeof wallet !== 'string' || !isValidSolanaAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  // Validate tokenMints
  if (!Array.isArray(tokenMints) || tokenMints.length === 0 || tokenMints.length > MAX_MINTS_PER_CLAIM_BATCH) {
    return NextResponse.json(
      { error: 'tokenMints must be an array of 1-10 items' },
      { status: 400 }
    );
  }

  for (const mint of tokenMints) {
    if (typeof mint !== 'string' || !isValidSolanaAddress(mint)) {
      return NextResponse.json(
        { error: 'Invalid token mint address' },
        { status: 400 }
      );
    }
  }

  // L-2: Use trusted IP resolution (Vercel platform IP > x-real-ip), not spoofable x-forwarded-for
  const ip = (request as unknown as { ip?: string }).ip
    ?? (process.env.VERCEL ? request.headers.get('x-real-ip')?.trim() : null)
    ?? null;
  const turnstile = await verifyTurnstile(body.cfTurnstileToken ?? null, ip);
  if (!turnstile.success) {
    return NextResponse.json({ error: turnstile.error ?? 'Captcha verification failed' }, { status: 403 });
  }

  // P1 fix: require the caller to prove control of `wallet` via signMessage.
  // Without this, anyone who passes Turnstile could open claim_attempts for a
  // third-party wallet and hold the victim's MAX_ACTIVE_CLAIMS_PER_WALLET
  // budget or lock specific mints with "Claim already in progress".
  const { walletProofMessage, walletProofSignature, fullTokenMints } = body;
  if (
    !walletProofMessage || typeof walletProofMessage !== 'string' || walletProofMessage.length > 500 ||
    !walletProofSignature || typeof walletProofSignature !== 'string' || walletProofSignature.length > 200
  ) {
    return NextResponse.json({ error: 'Wallet ownership proof is required' }, { status: 403 });
  }
  // The proof covers the FULL mint set the user selected, so we must verify
  // against that set — not against a single chunk. Sanity-bound the array
  // (creators with pathological fanout shouldn't force unbounded hashing)
  // and require the current chunk to be a subset.
  if (
    !Array.isArray(fullTokenMints) ||
    fullTokenMints.length === 0 ||
    fullTokenMints.length > 200 ||
    fullTokenMints.length < tokenMints.length
  ) {
    return NextResponse.json({ error: 'Invalid wallet ownership proof' }, { status: 403 });
  }
  const fullSet = new Set<string>();
  for (const mint of fullTokenMints) {
    if (typeof mint !== 'string' || !isValidSolanaAddress(mint)) {
      return NextResponse.json({ error: 'Invalid wallet ownership proof' }, { status: 403 });
    }
    fullSet.add(mint);
  }
  for (const mint of tokenMints) {
    if (!fullSet.has(mint)) {
      return NextResponse.json({ error: 'Invalid wallet ownership proof' }, { status: 403 });
    }
  }
  const expectedMintsHashPrefix = await computeMintsHashPrefix(fullTokenMints);
  const proofErr = await verifyWalletProof({
    message: walletProofMessage,
    signature: walletProofSignature,
    wallet,
    expectedMintsHashPrefix,
  });
  if (proofErr) {
    // Log the reason server-side but return a generic error to avoid oracle-style probing.
    console.warn(`[claim/bags] Wallet proof rejected: ${proofErr} (wallet=${wallet.slice(0, 6)}...${wallet.slice(-4)})`);
    return NextResponse.json({ error: 'Invalid wallet ownership proof' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Inline cleanup: expire stale claims for THIS wallet before checking limits.
  // This self-heals stuck locks without waiting for the daily cron job.
  const fiveMinAgo = new Date(Date.now() - CLAIM_PENDING_EXPIRY_MS).toISOString();
  const twoMinAgo = new Date(Date.now() - CLAIM_SUBMITTED_EXPIRY_MS).toISOString();
  const [cleanup1, cleanup2] = await Promise.all([
    supabase
      .from('claim_attempts')
      .update({ status: 'expired', error_reason: 'Blockhash expired (stale)', updated_at: new Date().toISOString() })
      .eq('wallet_address', wallet)
      .in('status', ['pending', 'signing'])
      .lt('created_at', fiveMinAgo),
    supabase
      .from('claim_attempts')
      .update({ status: 'expired', error_reason: 'Transaction confirmation timeout', updated_at: new Date().toISOString() })
      .eq('wallet_address', wallet)
      .eq('status', 'submitted')
      .lt('updated_at', twoMinAgo),
  ]);
  if (cleanup1.error) console.error('[claim/bags] Stale pending/signing cleanup failed:', cleanup1.error.message);
  if (cleanup2.error) console.error('[claim/bags] Stale submitted cleanup failed:', cleanup2.error.message);

  // DB-based rate limit: max 10 active claims per wallet
  const { count: activeCount, error: countError } = await supabase
    .from('claim_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_address', wallet)
    .in('status', ['pending', 'signing', 'submitted']);

  if (countError) {
    console.error('[claim/bags] Rate limit check failed:', countError.message);
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }

  if (activeCount !== null && activeCount >= MAX_ACTIVE_CLAIMS_PER_WALLET) {
    return NextResponse.json(
      { error: 'Too many active claims. Please wait for existing claims to complete.' },
      { status: 429 }
    );
  }

  // Optimistic lock: bulk insert pending claim_attempts (2 queries instead of N)
  const claimAttemptIds: Record<string, string> = {};
  const lockedMints: string[] = [];
  const skippedMints: Array<{ tokenMint: string; error: string }> = [];

  // Step 1: Find which mints already have active claims (1 SELECT)
  const { data: activeClaims, error: activeError } = await supabase
    .from('claim_attempts')
    .select('token_address')
    .eq('wallet_address', wallet)
    .in('status', ['pending', 'signing', 'submitted'])
    .in('token_address', tokenMints);

  if (activeError) {
    console.error('[claim/bags] Active claims check failed:', activeError.message);
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }

  const alreadyLocked = new Set((activeClaims ?? []).map((c) => c.token_address));
  const mintsToInsert = tokenMints.filter((mint) => {
    if (alreadyLocked.has(mint)) {
      skippedMints.push({ tokenMint: mint, error: 'Claim already in progress' });
      return false;
    }
    return true;
  });

  if (mintsToInsert.length > 0) {
    // Atomic locking via idx_claim_attempts_active (migration 018).
    // If a concurrent request inserts first, the unique constraint rejects the duplicate.
    // Step 2: Bulk insert all available mints (1 INSERT)
    const rows = mintsToInsert.map((mint) => ({
      wallet_address: wallet,
      token_address: mint,
      platform: 'bags' as const,
      chain: 'sol' as const,
      status: 'pending' as const,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('claim_attempts')
      .insert(rows)
      .select('id, token_address');

    if (insertError) {
      // If bulk insert fails due to unique constraint race, fall back to per-mint insert
      if (insertError.code === '23505') {
        for (const mint of mintsToInsert) {
          const { data, error } = await supabase
            .from('claim_attempts')
            .insert({
              wallet_address: wallet,
              token_address: mint,
              platform: 'bags',
              chain: 'sol',
              status: 'pending',
            })
            .select('id')
            .single();

          if (error) {
            skippedMints.push({
              tokenMint: mint,
              error: error.code === '23505' ? 'Claim already in progress' : 'Failed to create claim record',
            });
            continue;
          }
          claimAttemptIds[mint] = data.id;
          lockedMints.push(mint);
        }
      } else {
        console.error(`[claim/bags] Bulk insert error:`, insertError.message);
        for (const mint of mintsToInsert) {
          skippedMints.push({ tokenMint: mint, error: 'Failed to create claim record' });
        }
      }
    } else if (inserted) {
      for (const row of inserted) {
        claimAttemptIds[row.token_address] = row.id;
        lockedMints.push(row.token_address);
      }
    }
  }

  if (lockedMints.length === 0) {
    return NextResponse.json(
      { error: 'All tokens already have active claims in progress' },
      { status: 409 }
    );
  }

  // Generate claim transactions — wrapped in try/finally to clean up locks on failure
  trackClaimEvent('initiated', { wallet, platform: 'bags', mintCount: lockedMints.length });
  let results;
  const txGenStart = performance.now();
  try {
    results = await generateBatchClaimTransactions(wallet, lockedMints);
  } catch (err) {
    // Clean up ALL pending locks created in this request
    const idsToClean = Object.values(claimAttemptIds);
    if (idsToClean.length > 0) {
      const { error: cleanupErr } = await supabase
        .from('claim_attempts')
        .update({
          status: 'failed',
          error_reason: err instanceof Error ? err.message : 'Transaction generation failed',
          updated_at: new Date().toISOString(),
        })
        .in('id', idsToClean);
      if (cleanupErr) console.error('[claim/bags] Lock cleanup after tx failure failed:', cleanupErr.message);
    }
    trackClaimEvent('failure', { reason: 'tx_generation_error', wallet, platform: 'bags', mintCount: lockedMints.length });
    return NextResponse.json({ error: 'Failed to generate claim transactions' }, { status: 500 });
  }
  trackPerformance('bags_batch_tx_generation', performance.now() - txGenStart, 8000);

  const transactions: Array<{
    tokenMint: string;
    claimAttemptId: string;
    confirmToken: string;
    txs: Array<{ tx: string; blockhash: { blockhash: string; lastValidBlockHeight: number } }>;
  }> = [];

  for (const result of results) {
    const attemptId = claimAttemptIds[result.tokenMint];
    if (!attemptId) continue;

    if (result.error || result.transactions.length === 0) {
      const { error: failErr } = await supabase
        .from('claim_attempts')
        .update({
          status: 'failed',
          error_reason: result.error || 'No transactions returned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', attemptId);
      if (failErr) console.error(`[claim/bags] Failed to mark attempt ${attemptId} as failed:`, failErr.message);
      continue;
    }

    transactions.push({
      tokenMint: result.tokenMint,
      claimAttemptId: attemptId,
      confirmToken: generateConfirmToken(attemptId, wallet),
      txs: result.transactions,
    });
  }

  // Calculate service fee server-side from DB fee_records (not client-controlled)
  // Filter by creator_id that owns this wallet to avoid cross-wallet fee inflation
  const successMints = transactions.map((t) => t.tokenMint);
  let feeLamports = '0';
  if (successMints.length > 0) {
    // Find creator(s) associated with this wallet
    const { data: walletRows, error: walletErr } = await supabase
      .from('wallets')
      .select('creator_id')
      .eq('address', wallet)
      .limit(1);
    if (walletErr) {
      console.error('[claim/bags] Wallet lookup failed:', walletErr.message);
    }
    const creatorId = walletRows?.[0]?.creator_id;

    // If wallet has no associated creator, skip fee calculation entirely
    // to avoid unscoped queries that could sum other creators' records
    if (!creatorId) {
      return NextResponse.json({
        transactions,
        feeLamports: '0',
        failedMints: [
          ...skippedMints,
          ...results
            .filter((r) => r.error || r.transactions.length === 0)
            .map((r) => ({ tokenMint: r.tokenMint, error: r.error || 'No transactions returned' })),
        ],
      });
    }

    // NOTE: Fee is computed from DB-cached total_unclaimed which can be up to 40 min stale.
    // This is an accepted tradeoff: the user sees the exact fee before signing, and
    // on-chain verification in /api/claim/confirm caps the stored fee to the actual delta.
    const { data: feeRecords, error: feeQueryErr } = await supabase
      .from('fee_records')
      .select('total_unclaimed')
      .in('token_address', successMints)
      .eq('platform', 'bags')
      .eq('creator_id', creatorId);
    if (feeQueryErr) {
      console.error('[claim/bags] Fee records query failed:', feeQueryErr.message, { wallet, creatorId });
      return NextResponse.json({ error: 'Fee calculation temporarily unavailable' }, { status: 503 });
    }

    if (feeRecords && feeRecords.length > 0) {
      let totalUnclaimed = 0n;
      for (const r of feeRecords) {
        const val = r.total_unclaimed;
        if (val && /^\d+$/.test(val)) totalUnclaimed += BigInt(val);
      }
      const fee = totalUnclaimed * BigInt(CLAIMSCAN_FEE_BPS) / 10_000n;
      if (fee >= MIN_FEE_LAMPORTS) feeLamports = fee.toString();
    }
  }

  // Track fee collection decision
  const feeCollected = feeLamports !== '0';
  trackFeeCollection(feeCollected, feeLamports);
  if (!feeCollected && transactions.length > 0) {
    trackClaimEvent('fee_skipped', { wallet, platform: 'bags', mintCount: transactions.length });
  }

  // P2/Fix-4: mint a dedicated HMAC token for the single feeTx POST so the
  // fee path doesn't collide with the per-attempt confirmToken (which the
  // client reuses across status transitions). The `fee:` scope prefix on
  // the HMAC input means a status-transition token cannot be replayed as a
  // fee token and vice versa — the server verifies with the same prefix.
  const feeAttemptIdForAuth = transactions[0]?.claimAttemptId;
  const feeConfirmToken = feeAttemptIdForAuth
    ? generateConfirmToken(feeScopedAttemptId(feeAttemptIdForAuth), wallet)
    : null;

  return NextResponse.json({
    transactions,
    feeLamports,
    feeConfirmToken,
    feeAttemptIdForAuth,
    failedMints: [
      ...skippedMints,
      ...results
        .filter((r) => r.error || r.transactions.length === 0)
        .map((r) => ({ tokenMint: r.tokenMint, error: r.error || 'No transactions returned' })),
    ],
  });
}
