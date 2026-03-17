import { heliusDasRpc } from '@/lib/helius/client';
import { getAdapter } from '@/lib/platforms/index';
import { getTokenFees, wethToWei, sumDailyEarningsWei, searchLaunches } from '@/lib/platforms/bankr';
import { PLATFORM_CONFIG } from '@/lib/constants';
import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  METEORA_DBC_PROGRAM,
  COINBARREL_PROGRAM_ID,
  RAYDIUM_LAUNCHLAB_PROGRAM_ID,
  CLANKER_API_BASE,
} from '@/lib/constants';
import { getNativeTokenPrices } from '@/lib/prices/index';
import { safeBigInt, toUsdValue } from '@/lib/utils';
import type { Platform, Chain } from '@/lib/supabase/types';
import { lookupTokenByAddress, upsertWatchedToken } from '../state/db';

// Map program authorities → platform IDs (mirrors lib/helius/discovery.ts)
const PROGRAM_TO_PLATFORM: Record<string, Platform> = {
  [PUMP_PROGRAM_ID]: 'pump',
  [PUMPSWAP_PROGRAM_ID]: 'pump',
  [METEORA_DBC_PROGRAM]: 'believe',
  [COINBARREL_PROGRAM_ID]: 'coinbarrel',
  [RAYDIUM_LAUNCHLAB_PROGRAM_ID]: 'raydium',
};

// Timeout wrapper for the entire lookup operation (15s for VPS, no Vercel limit)
const LOOKUP_TIMEOUT_MS = 15_000;

export interface LookupResult {
  platform: Platform;
  platformName: string;
  chain: Chain;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  feeRecipient: string | null;
  feeRecipientHandle: string | null;
  totalEarned: string;
  totalClaimed: string;
  totalUnclaimed: string;
  totalEarnedUsd: number | null;
  nativeSymbol: string;
  nativeAmount: string;
  nativeAmountClaimed: string;
  nativeAmountUnclaimed: string;
  nativeUsdPrice: number;
  hasUnclaimed: boolean;
  watchedTokenId: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('lookup timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timeoutId!));
}

export async function lookupToken(
  tokenAddress: string,
  chain: Chain
): Promise<LookupResult | null> {
  try {
    return await withTimeout(doLookup(tokenAddress, chain), LOOKUP_TIMEOUT_MS);
  } catch (err) {
    console.error(`[lookup] Failed for ${tokenAddress}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function doLookup(tokenAddress: string, chain: Chain): Promise<LookupResult | null> {
  // FAST PATH: Check DB for existing data
  const dbResult = await lookupTokenByAddress(tokenAddress, chain);
  if (dbResult) {
    return await enrichResult(dbResult.platform, dbResult.chain, {
      tokenAddress: dbResult.tokenAddress,
      tokenSymbol: dbResult.tokenSymbol,
      feeRecipient: dbResult.feeRecipient,
      feeRecipientHandle: dbResult.feeRecipientHandle,
      totalEarned: dbResult.totalEarned,
      totalClaimed: dbResult.totalClaimed,
      totalUnclaimed: dbResult.totalUnclaimed,
      totalEarnedUsd: dbResult.totalEarnedUsd,
      creatorId: dbResult.creatorId,
    });
  }

  // DISCOVERY PATH: On-chain reverse lookup
  if (chain === 'sol') {
    return await discoverSolanaToken(tokenAddress);
  } else {
    return await discoverBaseToken(tokenAddress);
  }
}

// ═══════════════════════════════════════════════
// Solana Discovery — Helius DAS getAsset
// ═══════════════════════════════════════════════

interface DasAssetResult {
  id: string;
  interface: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
  };
  token_info?: { symbol?: string };
  authorities?: Array<{ address: string; scopes: string[] }>;
  grouping?: Array<{ group_key: string; group_value: string }>;
}

async function discoverSolanaToken(tokenAddress: string): Promise<LookupResult | null> {
  const asset = await heliusDasRpc<DasAssetResult>(
    'getAsset',
    { id: tokenAddress },
    'bot-getAsset'
  );

  if (!asset) return null;

  // Detect platform from authorities/grouping
  let platform: Platform | null = null;
  let creatorWallet: string | null = null;

  for (const auth of asset.authorities ?? []) {
    const matched = PROGRAM_TO_PLATFORM[auth.address];
    if (matched) {
      platform = matched;
      break;
    }
  }

  if (!platform) {
    for (const group of asset.grouping ?? []) {
      const matched = PROGRAM_TO_PLATFORM[group.group_value];
      if (matched) {
        platform = matched;
        break;
      }
    }
  }

  if (!platform) return null; // Not a supported launchpad token

  // Extract creator wallet (update_authority is typically the creator for launchpad tokens)
  // The first authority with 'full' scope is usually the update authority / creator
  for (const auth of asset.authorities ?? []) {
    if (!PROGRAM_TO_PLATFORM[auth.address]) {
      creatorWallet = auth.address;
      break;
    }
  }

  const tokenSymbol = asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? null;

  // Try to fetch live fees if we have a creator wallet and adapter
  if (creatorWallet) {
    const adapter = getAdapter(platform);
    if (adapter?.supportsLiveFees) {
      try {
        const fees = await adapter.getLiveUnclaimedFees(creatorWallet);
        const tokenFee = fees.find((f) => f.tokenAddress === tokenAddress);
        if (tokenFee) {
          return await enrichResult(platform, 'sol', {
            tokenAddress,
            tokenSymbol: tokenFee.tokenSymbol ?? tokenSymbol,
            feeRecipient: creatorWallet,
            feeRecipientHandle: null,
            totalEarned: tokenFee.totalEarned,
            totalClaimed: tokenFee.totalClaimed,
            totalUnclaimed: tokenFee.totalUnclaimed,
            totalEarnedUsd: tokenFee.totalEarnedUsd,
            creatorId: null,
          });
        }
      } catch (err) {
        console.warn(`[lookup] Live fee fetch failed for ${platform}:`, err instanceof Error ? err.message : err);
      }
    }

    // Fallback: return with zero fees (we know the platform but couldn't fetch fees)
    return await enrichResult(platform, 'sol', {
      tokenAddress,
      tokenSymbol,
      feeRecipient: creatorWallet,
      feeRecipientHandle: null,
      totalEarned: '0',
      totalClaimed: '0',
      totalUnclaimed: '0',
      totalEarnedUsd: null,
      creatorId: null,
    });
  }

  return null;
}

// ═══════════════════════════════════════════════
// Base Discovery — Clanker API
// ═══════════════════════════════════════════════

interface ClankerTokensResponse {
  data: Array<{
    id: number;
    name: string;
    symbol: string;
    contract_address: string;
    pool_address: string;
    requestor_address: string;
    type: string;
  }>;
}

async function discoverBaseToken(tokenAddress: string): Promise<LookupResult | null> {
  // Try Clanker public API (GET /api/tokens?q=<address>)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(
      `https://www.clanker.world/api/tokens?q=${encodeURIComponent(tokenAddress)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const body: ClankerTokensResponse = await res.json();
      const data = body.data?.find(
        (t) => t.contract_address?.toLowerCase() === tokenAddress.toLowerCase()
      );
      if (data && data.requestor_address) {
        const adapter = getAdapter('clanker');
        if (adapter?.supportsLiveFees) {
          try {
            const fees = await adapter.getLiveUnclaimedFees(data.requestor_address);
            const tokenFee = fees.find(
              (f) => f.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
            );
            if (tokenFee) {
              return await enrichResult('clanker', 'base', {
                tokenAddress,
                tokenSymbol: tokenFee.tokenSymbol ?? data.symbol,
                feeRecipient: data.requestor_address,
                feeRecipientHandle: null,
                totalEarned: tokenFee.totalEarned,
                totalClaimed: tokenFee.totalClaimed,
                totalUnclaimed: tokenFee.totalUnclaimed,
                totalEarnedUsd: tokenFee.totalEarnedUsd,
                creatorId: null,
              });
            }
          } catch (err) {
            console.warn('[lookup] Clanker live fee fetch failed:', err instanceof Error ? err.message : err);
          }
        }

        // Fallback: we know it's Clanker but couldn't fetch fees
        return await enrichResult('clanker', 'base', {
          tokenAddress,
          tokenSymbol: data.symbol,
          feeRecipient: data.requestor_address,
          feeRecipientHandle: null,
          totalEarned: '0',
          totalClaimed: '0',
          totalUnclaimed: '0',
          totalEarnedUsd: null,
          creatorId: null,
        });
      }
    }
  } catch (err) {
    console.warn('[lookup] Clanker API lookup failed:', err instanceof Error ? err.message : err);
  }

  // Try Bankr Doppler API (public, no auth needed)
  try {
    const result = await discoverBankrToken(tokenAddress);
    if (result) return result;
  } catch (err) {
    console.warn('[lookup] Bankr discovery failed:', err instanceof Error ? err.message : err);
  }

  return null;
}

// ═══════════════════════════════════════════════
// Base Discovery — Bankr Doppler API (public, no auth)
// ═══════════════════════════════════════════════

async function discoverBankrToken(tokenAddress: string): Promise<LookupResult | null> {
  const feeData = await getTokenFees(tokenAddress);
  if (!feeData) return null;

  const { totals, dailyEarnings, tokens } = feeData;
  const claimableWei = wethToWei(totals?.claimableWeth);
  const dailyEarnedWei = sumDailyEarningsWei(dailyEarnings);
  const claimedWeiFromTotals = wethToWei(totals?.claimedWeth);
  const totalsEarnedWei = (BigInt(claimableWei) + BigInt(claimedWeiFromTotals)).toString();

  const totalEarnedWei = BigInt(dailyEarnedWei) > BigInt(totalsEarnedWei)
    ? dailyEarnedWei
    : totalsEarnedWei;

  const totalClaimedWei = BigInt(totalEarnedWei) > BigInt(claimableWei)
    ? (BigInt(totalEarnedWei) - BigInt(claimableWei)).toString()
    : '0';

  // No fees at all = probably not a Bankr token
  if (totalEarnedWei === '0' && claimableWei === '0') return null;

  // Try to extract symbol from the tokens array
  const tokenSymbol = tokens?.[0]?.symbol ?? tokens?.[0]?.name ?? null;

  // Try to resolve the fee recipient handle via Search API
  let feeRecipientHandle: string | null = null;
  let feeRecipient: string | null = feeData.address || null;
  try {
    console.log(`[bankr-debug] Calling searchLaunches for ${tokenAddress}`);
    const searchData = await searchLaunches(tokenAddress);
    console.log(`[bankr-debug] searchLaunches response keys:`, Object.keys(searchData));
    console.log(`[bankr-debug] groups:`, JSON.stringify(searchData.groups ? Object.keys(searchData.groups) : 'no groups'));
    const allResults = [
      ...(searchData.groups?.tokens?.results ?? []),
      ...(searchData.groups?.byFeeRecipient?.results ?? []),
      ...(searchData.groups?.byDeployer?.results ?? []),
    ];
    console.log(`[bankr-debug] allResults count: ${allResults.length}`);
    if (allResults.length > 0) {
      console.log(`[bankr-debug] first result:`, JSON.stringify(allResults[0], null, 2));
    }
    const match = allResults.find(
      (t) => t.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
    );
    console.log(`[bankr-debug] match found: ${!!match}, xUsername: ${match?.feeRecipient?.xUsername ?? 'none'}`);
    if (match?.feeRecipient?.xUsername) {
      feeRecipientHandle = match.feeRecipient.xUsername;
    }
    if (match?.feeRecipient?.walletAddress) {
      feeRecipient = match.feeRecipient.walletAddress;
    }
  } catch (err) {
    console.warn(`[bankr-debug] searchLaunches failed:`, err instanceof Error ? err.message : err);
  }

  return await enrichResult('bankr', 'base', {
    tokenAddress,
    tokenSymbol,
    feeRecipient,
    feeRecipientHandle,
    totalEarned: totalEarnedWei,
    totalClaimed: totalClaimedWei,
    totalUnclaimed: claimableWei,
    totalEarnedUsd: null,
    creatorId: null,
  });
}

// ═══════════════════════════════════════════════
// Result Enrichment (prices, persistence, formatting data)
// ═══════════════════════════════════════════════

interface RawFeeData {
  tokenAddress: string;
  tokenSymbol: string | null;
  feeRecipient: string | null;
  feeRecipientHandle: string | null;
  totalEarned: string;
  totalClaimed: string;
  totalUnclaimed: string;
  totalEarnedUsd: number | null;
  creatorId: string | null;
}

async function enrichResult(
  platform: Platform,
  chain: Chain,
  data: RawFeeData
): Promise<LookupResult> {
  const config = PLATFORM_CONFIG[platform];
  const nativeSymbol = chain === 'sol' ? 'SOL' : 'ETH';
  const nativeDecimals = chain === 'sol' ? 9 : 18;

  // Fetch native prices for USD conversion
  const prices = await getNativeTokenPrices();
  const nativeUsdPrice = chain === 'sol' ? prices.sol : prices.eth;

  // Convert raw amounts to human-readable native token amounts
  const earned = safeBigInt(data.totalEarned);
  const claimed = safeBigInt(data.totalClaimed);
  const unclaimed = safeBigInt(data.totalUnclaimed);

  const divisor = BigInt(10 ** nativeDecimals);
  const formatNative = (val: bigint): string => {
    if (val === 0n) return '0';
    const whole = val / divisor;
    const remainder = val % divisor;
    if (remainder === 0n) return `${whole}`;
    const fracStr = remainder.toString().padStart(nativeDecimals, '0').replace(/0+$/, '');
    return `${whole}.${fracStr.slice(0, 4)}`;
  };

  const hasUnclaimed = unclaimed > 0n;

  // Calculate USD values from native amounts if not already provided
  let earnedUsd = data.totalEarnedUsd;
  if (earnedUsd == null && nativeUsdPrice > 0 && earned > 0n) {
    earnedUsd = toUsdValue(earned, nativeDecimals, nativeUsdPrice);
  }

  // Auto-track: upsert into watched_tokens if unclaimed > 0
  // Skip upsert when data comes from DB fast-path (creatorId is set) to avoid
  // regressing poll worker snapshots with potentially stale fee_records data
  let watchedTokenId: string | null = null;
  if (hasUnclaimed && !data.creatorId) {
    watchedTokenId = await upsertWatchedToken({
      tokenAddress: data.tokenAddress,
      tokenSymbol: data.tokenSymbol,
      chain,
      platform,
      creatorId: data.creatorId,
      feeRecipientAddress: data.feeRecipient,
      snapshotEarned: data.totalEarned,
      snapshotClaimed: data.totalClaimed,
      snapshotUnclaimed: data.totalUnclaimed,
      snapshotEarnedUsd: earnedUsd,
    });
  }

  return {
    platform,
    platformName: config.name,
    chain,
    chainName: chain === 'sol' ? 'Solana' : 'Base',
    tokenAddress: data.tokenAddress,
    tokenSymbol: data.tokenSymbol,
    feeRecipient: data.feeRecipient,
    feeRecipientHandle: data.feeRecipientHandle,
    totalEarned: data.totalEarned,
    totalClaimed: data.totalClaimed,
    totalUnclaimed: data.totalUnclaimed,
    totalEarnedUsd: earnedUsd,
    nativeSymbol,
    nativeAmount: formatNative(earned),
    nativeAmountClaimed: formatNative(claimed),
    nativeAmountUnclaimed: formatNative(unclaimed),
    nativeUsdPrice,
    hasUnclaimed,
    watchedTokenId,
  };
}
