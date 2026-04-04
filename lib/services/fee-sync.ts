import 'server-only';
import { safeBigInt } from '@/lib/utils';
import type { Database } from '@/lib/supabase/types';
import type { IdentityProvider } from '@/lib/supabase/types';
import type { TokenFee, ResolvedWallet } from '@/lib/platforms/types';
import {
  fetchAllFees,
  fetchFeesByHandle,
} from '@/lib/resolve/identity';
import { isHeliusAvailable } from '@/lib/helius/client';
import { fetchClaimHistory } from '@/lib/helius/transactions';
import type { Logger } from '@/lib/logger';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];
type SupabaseClient = ReturnType<typeof import('@/lib/supabase/service').createServiceClient>;

// ═══════════════════════════════════════════════
// Fee Aggregation + Merge
// ═══════════════════════════════════════════════

/**
 * Fetch fees from all sources (handle-based + wallet-based),
 * merge and dedup by platform:chain:tokenAddress.
 */
export async function aggregateFees(
  handle: string,
  provider: IdentityProvider,
  wallets: ResolvedWallet[],
  log: Logger
): Promise<TokenFee[]> {
  // Handle-based + wallet-based fees in parallel
  const [handleFees, walletFees] = await Promise.all([
    log.time('fetchFeesByHandle', () => fetchFeesByHandle(handle, provider), { handle }),
    wallets.length > 0
      ? log.time('fetchAllFees', () => fetchAllFees(wallets), { walletCount: wallets.length })
      : Promise.resolve([]),
  ]);

  // Merge + dedup
  const feeMap = new Map<string, TokenFee>();
  for (const fee of handleFees) {
    feeMap.set(`${fee.platform}:${fee.chain}:${fee.tokenAddress}`, fee);
  }
  for (const fee of walletFees) {
    const key = `${fee.platform}:${fee.chain}:${fee.tokenAddress}`;
    const existing = feeMap.get(key);
    if (!existing) {
      feeMap.set(key, fee);
    } else {
      const feeEarned = safeBigInt(fee.totalEarned);
      const existingEarned = safeBigInt(existing.totalEarned);
      if (feeEarned > existingEarned ||
          (feeEarned === existingEarned && safeBigInt(fee.totalClaimed) > safeBigInt(existing.totalClaimed))) {
        feeMap.set(key, {
          ...fee,
          totalEarnedUsd: fee.totalEarnedUsd ?? existing.totalEarnedUsd,
          tokenSymbol: fee.tokenSymbol ?? existing.tokenSymbol,
          royaltyBps: fee.royaltyBps ?? existing.royaltyBps,
        });
      }
    }
  }

  log.info('fees aggregated', {
    handleFeeCount: handleFees.length,
    walletFeeCount: walletFees.length,
    mergedCount: feeMap.size,
  });

  return Array.from(feeMap.values());
}

// ═══════════════════════════════════════════════
// Fee Persistence (upsert + claimed-preservation)
// ═══════════════════════════════════════════════

/**
 * Persist fee records to Supabase with:
 * - Claimed-preservation (monotonic claimed values)
 * - Disappeared Bags token detection
 */
export async function persistFees(
  creatorId: string,
  allFees: TokenFee[],
  supabase: SupabaseClient,
  log: Logger
): Promise<void> {
  if (allFees.length === 0) return;

  // Fetch existing fees for claimed-preservation
  const { data: existingFees, error: existingError } = await supabase
    .from('fee_records')
    .select('platform, chain, token_address, total_claimed, total_earned, total_unclaimed, total_earned_usd, token_symbol, royalty_bps')
    .eq('creator_id', creatorId);

  if (existingError) {
    log.error('failed to fetch existing fees for claimed-preservation', { error: existingError.message });
  }

  // Build claimed map for monotonic preservation
  const existingClaimedMap = new Map<string, { claimed: string; earned: string }>();
  if (existingFees) {
    for (const ef of existingFees) {
      existingClaimedMap.set(`${ef.platform}:${ef.chain}:${ef.token_address}`, {
        claimed: ef.total_claimed,
        earned: ef.total_earned,
      });
    }
  }

  const feeRows = allFees.map((fee) => {
    let totalClaimed = fee.totalClaimed;
    let totalEarned = fee.totalEarned;

    // Claimed is monotonically increasing — preserve higher DB value
    const key = `${fee.platform}:${fee.chain}:${fee.tokenAddress}`;
    const existing = existingClaimedMap.get(key);
    if (existing && safeBigInt(existing.claimed) > safeBigInt(totalClaimed)) {
      totalClaimed = existing.claimed;
      const claimed = safeBigInt(totalClaimed);
      const unclaimed = safeBigInt(fee.totalUnclaimed);
      totalEarned = (unclaimed + claimed).toString();
    }

    return {
      creator_id: creatorId,
      creator_token_id: null,
      platform: fee.platform,
      chain: fee.chain,
      token_address: fee.tokenAddress,
      token_symbol: fee.tokenSymbol,
      total_earned: totalEarned,
      total_claimed: totalClaimed,
      total_unclaimed: fee.totalUnclaimed,
      total_earned_usd: fee.totalEarnedUsd,
      claim_status:
        safeBigInt(fee.totalUnclaimed) > 0n && safeBigInt(totalClaimed) > 0n
          ? 'partially_claimed' as const
          : safeBigInt(fee.totalUnclaimed) > 0n
            ? 'unclaimed' as const
            : safeBigInt(totalEarned) > 0n
              ? 'claimed' as const
              : 'unclaimed' as const,
      royalty_bps: fee.royaltyBps,
      last_synced_at: new Date().toISOString(),
    };
  });

  const { error: feeError } = await supabase
    .from('fee_records')
    .upsert(feeRows, { onConflict: 'creator_id,platform,chain,token_address' });
  if (feeError) {
    log.warn('fee_records upsert error', { error: feeError.message });
  }

  // Detect disappeared Bags tokens → mark as fully claimed
  await detectDisappearedTokens(creatorId, allFees, existingFees, supabase, log);
}

/**
 * Bags' API only returns tokens with unclaimed > 0.
 * When fully claimed, they vanish. Detect and mark them as claimed.
 */
async function detectDisappearedTokens(
  creatorId: string,
  freshFees: TokenFee[],
  existingFees: Pick<FeeRecord, 'platform' | 'chain' | 'token_address' | 'total_earned' | 'total_unclaimed' | 'total_claimed' | 'total_earned_usd' | 'token_symbol' | 'royalty_bps'>[] | null,
  supabase: SupabaseClient,
  log: Logger
): Promise<void> {
  if (!existingFees || existingFees.length === 0) return;

  // Guard: if fresh data contains ZERO Bags entries, this is likely an API outage,
  // not a genuine disappearance. Skip detection to avoid false "fully claimed" updates.
  // Also guard against partial API responses: if fresh count drops below 50% of existing,
  // the API likely returned incomplete data.
  const freshBagsCount = freshFees.filter((f) => f.platform === 'bags').length;
  const existingBagsCount = existingFees.filter((ef) => ef.platform === 'bags').length;
  if (freshBagsCount === 0 || (existingBagsCount > 0 && freshBagsCount < existingBagsCount * 0.5)) {
    const existingBagsWithUnclaimed = existingFees.filter(
      (ef) => ef.platform === 'bags' && safeBigInt(ef.total_unclaimed) > 0n
    ).length;
    if (existingBagsWithUnclaimed > 0) {
      log.info('Bags fees count too low vs DB — skipping disappearance detection (possible API outage or partial response)', {
        freshBagsCount,
        existingBagsCount,
        existingBagsWithUnclaimed,
      });
      return;
    }
  }

  const freshKeys = new Set(freshFees.map((f) => `${f.platform}:${f.chain}:${f.tokenAddress}`));
  const disappeared = existingFees.filter((ef) => {
    if (ef.platform !== 'bags') return false;
    const key = `${ef.platform}:${ef.chain}:${ef.token_address}`;
    if (freshKeys.has(key)) return false;
    return safeBigInt(ef.total_earned) > 0n && safeBigInt(ef.total_unclaimed) > 0n;
  });

  if (disappeared.length === 0) return;

  log.info('Bags tokens disappeared from API — marking as fully claimed', { count: disappeared.length });

  const claimedRows = disappeared.map((ef) => ({
    creator_id: creatorId,
    creator_token_id: null,
    platform: ef.platform,
    chain: ef.chain,
    token_address: ef.token_address,
    token_symbol: ef.token_symbol,
    total_earned: ef.total_earned,
    total_claimed: ef.total_earned,
    total_unclaimed: '0',
    total_earned_usd: ef.total_earned_usd,
    claim_status: 'claimed' as const,
    royalty_bps: ef.royalty_bps,
    last_synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('fee_records')
    .upsert(claimedRows, { onConflict: 'creator_id,platform,chain,token_address' });
  if (error) {
    log.warn('fully-claimed upsert error', { error: error.message });
  }
}

// ═══════════════════════════════════════════════
// Claim History (fire-and-forget)
// ═══════════════════════════════════════════════

/**
 * Fetch and persist claim history for Solana wallets via Helius.
 * Fire-and-forget — failure doesn't block the main flow.
 */
export function syncClaimHistory(
  creatorId: string,
  wallets: ResolvedWallet[],
  supabase: SupabaseClient,
  log: Logger
): void {
  if (!isHeliusAvailable()) return;

  const solWallets = wallets.filter((w) => w.chain === 'sol');
  if (solWallets.length === 0) return;

  Promise.resolve(
    (async () => {
      for (const wallet of solWallets) {
        try {
          const claims = await fetchClaimHistory(wallet.address, { limit: 50 });
          if (claims.length > 0) {
            const claimRows = claims
              .filter((c) => c.txHash)
              .map((c) => ({
                creator_id: creatorId,
                platform: c.platform,
                chain: c.chain,
                token_address: c.tokenAddress,
                amount: c.amount,
                amount_usd: c.amountUsd,
                tx_hash: c.txHash,
                claimed_at: c.claimedAt,
              }));
            if (claimRows.length > 0) {
              const { error } = await supabase
                .from('claim_events')
                .upsert(claimRows, { onConflict: 'tx_hash' });
              if (error) {
                log.warn('claim_events upsert error', { error: error.message, wallet: wallet.address });
              }
            }
          }
        } catch (err) {
          log.warn('claim history failed', { wallet: wallet.address, err: err instanceof Error ? err.message : String(err) });
        }
      }
    })()
  ).catch((err) => {
    log.warn('claim history batch failed', { err: err instanceof Error ? err.message : String(err) });
  });
}
