import 'server-only';
import { heliusDasRpc, isHeliusAvailable } from './client';
import type { CreatorToken } from '@/lib/platforms/types';
import type { Platform } from '@/lib/supabase/types';
import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  METEORA_DBC_PROGRAM,
  COINBARREL_PROGRAM_ID,
  RAYDIUM_LAUNCHLAB_PROGRAM_ID,
} from '@/lib/constants';

// ═══════════════════════════════════════════════
// DAS Token Discovery
// Uses getAssetsByOwner to find ALL fungible tokens in a wallet,
// then cross-references authorities against known launchpad programs.
// ═══════════════════════════════════════════════

/** Map program authorities → ClaimScan platform IDs */
const PROGRAM_TO_PLATFORM: Record<string, Platform> = {
  [PUMP_PROGRAM_ID]: 'pump',
  [PUMPSWAP_PROGRAM_ID]: 'pump',
  [METEORA_DBC_PROGRAM]: 'believe',
  [COINBARREL_PROGRAM_ID]: 'coinbarrel',
  [RAYDIUM_LAUNCHLAB_PROGRAM_ID]: 'raydium',
};

interface DasAssetItem {
  id: string;
  interface: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  token_info?: { symbol?: string; decimals?: number };
  authorities?: Array<{ address: string; scopes: string[] }>;
  grouping?: Array<{ group_key: string; group_value: string }>;
}

interface DasAssetsByOwnerResult {
  total: number;
  limit: number;
  page: number;
  items: DasAssetItem[];
}

/** Max pages to fetch (1000 assets/page) to control credit usage */
const MAX_PAGES = 3;

/**
 * Discover all fungible tokens in a Solana wallet via DAS getAssetsByOwner.
 * Cross-references token authorities against known launchpad programs.
 *
 * Cost: 10 credits per page (DAS call).
 */
export async function discoverWalletTokens(
  wallet: string
): Promise<CreatorToken[]> {
  if (!isHeliusAvailable()) return [];

  const result: CreatorToken[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const data = await heliusDasRpc<DasAssetsByOwnerResult>(
      'getAssetsByOwner',
      {
        ownerAddress: wallet,
        page,
        limit: 1000,
        displayOptions: {
          showFungible: true,
          showNativeBalance: false,
        },
      },
      `das-discovery-p${page}`
    );

    if (!data || data.items.length === 0) break;

    for (const asset of data.items) {
      // Only care about fungible tokens
      if (!asset.interface?.toLowerCase().includes('fungible')) continue;

      const platform = detectPlatform(asset);
      if (!platform) continue;

      result.push({
        tokenAddress: asset.id,
        chain: 'sol',
        platform,
        symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? null,
        name: asset.content?.metadata?.name ?? null,
        imageUrl: asset.content?.links?.image ?? null,
      });
    }

    // Last page — fewer items than limit
    if (data.items.length < 1000) break;
    page++;
  }

  return result;
}

/**
 * Check if a DAS asset was minted by a known launchpad program
 * by inspecting its authorities or grouping metadata.
 */
function detectPlatform(asset: DasAssetItem): Platform | null {
  for (const auth of asset.authorities ?? []) {
    const matched = PROGRAM_TO_PLATFORM[auth.address];
    if (matched) return matched;
  }

  for (const group of asset.grouping ?? []) {
    const matched = PROGRAM_TO_PLATFORM[group.group_value];
    if (matched) return matched;
  }

  return null;
}
