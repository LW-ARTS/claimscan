import { NextResponse } from 'next/server';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { createServiceClient } from '@/lib/supabase/service';
import { generateBatchClaimTransactions } from '@/lib/platforms/bags-claim';
import { generateConfirmToken } from '@/lib/claim/hmac';

/** Vercel Hobby hard limit is 10s. Reduced batch size (10 mints) fits within this budget. */
export const maxDuration = 10;

export async function POST(request: Request) {
  // Fail fast if HMAC secret is not configured
  try { generateConfirmToken('_test', '_test'); } catch {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body: { wallet?: string; tokenMints?: string[] };
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
  if (!Array.isArray(tokenMints) || tokenMints.length === 0 || tokenMints.length > 10) {
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

  const supabase = createServiceClient();

  // Inline cleanup: expire stale claims for THIS wallet before checking limits.
  // This self-heals stuck locks without waiting for the daily cron job.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
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

  // DB-based rate limit: max 30 active claims per wallet
  const { count: activeCount, error: countError } = await supabase
    .from('claim_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_address', wallet)
    .in('status', ['pending', 'signing', 'submitted']);

  if (countError) {
    console.error('[claim/bags] Rate limit check failed:', countError.message);
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }

  if (activeCount !== null && activeCount >= 30) {
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
  const { data: activeClaims } = await supabase
    .from('claim_attempts')
    .select('token_address')
    .eq('wallet_address', wallet)
    .in('status', ['pending', 'signing', 'submitted'])
    .in('token_address', tokenMints);

  const alreadyLocked = new Set((activeClaims ?? []).map((c) => c.token_address));
  const mintsToInsert = tokenMints.filter((mint) => {
    if (alreadyLocked.has(mint)) {
      skippedMints.push({ tokenMint: mint, error: 'Claim already in progress' });
      return false;
    }
    return true;
  });

  if (mintsToInsert.length > 0) {
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
  let results;
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
    return NextResponse.json({ error: 'Failed to generate claim transactions' }, { status: 500 });
  }

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

  return NextResponse.json({
    transactions,
    failedMints: [
      ...skippedMints,
      ...results
        .filter((r) => r.error || r.transactions.length === 0)
        .map((r) => ({ tokenMint: r.tokenMint, error: r.error || 'No transactions returned' })),
    ],
  });
}
