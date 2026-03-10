import 'server-only';
import { createPublicClient, http, fallback, isAddress, getAddress, parseAbi, parseAbiItem, formatEther, type Address } from 'viem';
import { base } from 'viem/chains';
import {
  CLANKER_FEE_LOCKER,
  ZORA_PROTOCOL_REWARDS,
} from '@/lib/constants';

// ═══════════════════════════════════════════════
// Client (multi-RPC with adaptive fallback)
// ═══════════════════════════════════════════════

const BASE_RPC_URLS: string[] = (() => {
  const envUrls = process.env.BASE_RPC_URL;
  if (!envUrls) {
    console.warn(
      '[base] BASE_RPC_URL is not set — falling back to public RPC which is rate-limited and unreliable for production.'
    );
    return ['https://mainnet.base.org'];
  }
  // Supports comma-separated URLs: BASE_RPC_URL=https://primary.com,https://backup.com
  return envUrls.split(',').map((u) => u.trim()).filter(Boolean);
})();

export const baseClient = createPublicClient({
  chain: base,
  transport: BASE_RPC_URLS.length === 1
    ? http(BASE_RPC_URLS[0], { timeout: 10_000, retryCount: 2, retryDelay: 500 })
    : fallback(
        BASE_RPC_URLS.map((url) => http(url, { timeout: 10_000 })),
        { rank: true } // adaptive scoring — promotes healthiest RPC
      ),
});

// ═══════════════════════════════════════════════
// ABIs (minimal — only the reads we need)
// ═══════════════════════════════════════════════

export const clankerFeeLockerAbi = parseAbi([
  'function availableFees(address feeOwner, address token) view returns (uint256)',
  // NOTE: The FeeLocker contract does NOT expose a 'claimedFees' read function.
  // Total claimed amounts must be derived from onchain event logs or a subgraph.
  // Only availableFees (unclaimed) is directly readable.
]);

export const zoraProtocolRewardsAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

export const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

// ═══════════════════════════════════════════════
// Clanker Reads
// ═══════════════════════════════════════════════

/**
 * Get unclaimed fees for a single token from Clanker FeeLocker.
 */
export async function getClankerAvailableFees(
  owner: Address,
  token: Address
): Promise<bigint> {
  try {
    return await baseClient.readContract({
      address: CLANKER_FEE_LOCKER,
      abi: clankerFeeLockerAbi,
      functionName: 'availableFees',
      args: [owner, token],
    });
  } catch (err) {
    console.warn(`[base] availableFees failed for owner=${owner} token=${token}:`, err instanceof Error ? err.message : err);
    return 0n;
  }
}

/**
 * Batch read unclaimed fees for multiple tokens via multicall.
 * Returns array of { token, available } for each token.
 * NOTE: Only unclaimed (available) fees are readable onchain.
 * Claimed totals are not exposed by the FeeLocker contract.
 */
/** Max tokens per multicall batch.
 * Post-Fusaka (Dec 2025), Base gas limit is 60M. Each availableFees call
 * uses ~5k gas, so the chain supports 1000+ calls per multicall. The limit
 * here is driven by RPC response payload size (~2-4MB on most providers). */
const MULTICALL_BATCH_SIZE = 200;

export async function batchClankerFees(
  owner: Address,
  tokens: Address[]
): Promise<Array<{ token: Address; available: bigint; claimed: bigint }>> {
  if (tokens.length === 0) return [];

  // Process in chunks to avoid overloading the RPC with huge multicall payloads
  const allResults: Array<{ token: Address; available: bigint; claimed: bigint }> = [];

  for (let start = 0; start < tokens.length; start += MULTICALL_BATCH_SIZE) {
    const chunk = tokens.slice(start, start + MULTICALL_BATCH_SIZE);

    // Only read availableFees — claimedFees is not a valid contract function
    const contracts = chunk.map((token) => ({
      address: CLANKER_FEE_LOCKER,
      abi: clankerFeeLockerAbi,
      functionName: 'availableFees' as const,
      args: [owner, token] as const,
    }));

    const results = await baseClient.multicall({
      contracts,
      allowFailure: true,
    });

    const chunkResults = chunk.map((token, i) => {
      const availResult = results[i];
      if (availResult.status === 'failure') {
        console.warn(`[base] multicall availableFees failed for token=${token}:`, availResult.error?.message ?? 'unknown');
      }
      return {
        token,
        available: availResult.status === 'success' && typeof availResult.result === 'bigint'
          ? availResult.result
          : 0n,
        // claimed is not readable from the contract — always 0n
        claimed: 0n,
      };
    });

    allResults.push(...chunkResults);
  }

  return allResults;
}

// ═══════════════════════════════════════════════
// Zora Reads
// ═══════════════════════════════════════════════

/**
 * Get unclaimed Zora ProtocolRewards balance for an account.
 * Only applies to Zora v3 — v4 auto-distributes fees.
 */
export async function getZoraProtocolRewardsBalance(
  account: Address
): Promise<bigint> {
  try {
    return await baseClient.readContract({
      address: ZORA_PROTOCOL_REWARDS,
      abi: zoraProtocolRewardsAbi,
      functionName: 'balanceOf',
      args: [account],
    });
  } catch (err) {
    console.warn('[base] Zora ProtocolRewards balanceOf failed:', err instanceof Error ? err.message : err);
    return 0n;
  }
}

// ═══════════════════════════════════════════════
// Clanker Claim Logs (Event-based claimed totals)
// ═══════════════════════════════════════════════

/**
 * ERC20 Transfer event — used to detect fee claims from FeeLocker to owner.
 * When a creator calls collectFees(), the FeeLocker transfers tokens to them.
 */
const erc20TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

/** FeeLocker deployed ~late 2024 on Base. */
const CLANKER_FEELOCKER_DEPLOY_BLOCK = 20_000_000n;

/** Zora ProtocolRewards deployed ~Aug 2023 on Base (shortly after Base launch).
 * Conservative floor to avoid scanning from genesis while being safely before deployment. */
const ZORA_REWARDS_BASE_DEPLOY_BLOCK = 1_000_000n;

/** Max tokens per getClankerClaimLogs batch to avoid overwhelming RPCs with concurrent getLogs. */
const CLAIM_LOGS_BATCH_SIZE = 5;

/**
 * Get total claimed fees per token by scanning Transfer events FROM the FeeLocker TO the owner.
 * Returns a Map of lowercase token address → total claimed wei.
 */
export async function getClankerClaimLogs(
  owner: Address,
  tokens: Address[]
): Promise<Map<string, bigint>> {
  const claimMap = new Map<string, bigint>();
  if (tokens.length === 0) return claimMap;

  try {
    // Scan Transfer events FROM FeeLocker TO owner across all token contracts.
    // Process in batches of CLAIM_LOGS_BATCH_SIZE to avoid overwhelming RPCs
    // with concurrent getLogs calls (each scans ~20M+ blocks).
    for (let i = 0; i < tokens.length; i += CLAIM_LOGS_BATCH_SIZE) {
      const batch = tokens.slice(i, i + CLAIM_LOGS_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (token) => {
          const logs = await baseClient.getLogs({
            address: token,
            event: erc20TransferEvent,
            args: {
              from: CLANKER_FEE_LOCKER,
              to: owner,
            },
            fromBlock: CLANKER_FEELOCKER_DEPLOY_BLOCK,
            toBlock: 'latest',
          });

          let total = 0n;
          for (const log of logs) {
            total += log.args.value ?? 0n;
          }
          if (total > 0n) {
            claimMap.set(token.toLowerCase(), total);
          }
        })
      );

      for (const r of results) {
        if (r.status === 'rejected') {
          console.warn('[base] getClankerClaimLogs failed for a token:', r.reason instanceof Error ? r.reason.message : r.reason);
        }
      }
    }
  } catch (err) {
    console.warn('[base] getClankerClaimLogs failed:', err instanceof Error ? err.message : err);
  }

  return claimMap;
}

// ═══════════════════════════════════════════════
// Zora Withdraw Logs (Event-based claimed totals)
// ═══════════════════════════════════════════════

const zoraWithdrawEvent = parseAbiItem(
  'event Withdraw(address indexed from, address indexed to, uint256 amount)'
);

/**
 * Get total withdrawn (claimed) ETH from Zora ProtocolRewards on Base.
 */
export async function getZoraWithdrawLogs(
  account: Address
): Promise<bigint> {
  try {
    const logs = await baseClient.getLogs({
      address: ZORA_PROTOCOL_REWARDS,
      event: zoraWithdrawEvent,
      args: { from: account },
      fromBlock: ZORA_REWARDS_BASE_DEPLOY_BLOCK,
      toBlock: 'latest',
    });

    let total = 0n;
    for (const log of logs) {
      total += log.args.amount ?? 0n;
    }
    return total;
  } catch (err) {
    console.warn('[base] getZoraWithdrawLogs failed:', err instanceof Error ? err.message : err);
    return 0n;
  }
}

// ═══════════════════════════════════════════════
// ERC20 Reads
// ═══════════════════════════════════════════════

/**
 * Get ERC20 token balance for an account.
 */
export async function getErc20Balance(
  token: Address,
  account: Address
): Promise<bigint> {
  try {
    return await baseClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    });
  } catch (err) {
    console.warn(`[base] ERC20 balanceOf failed for token=${token}:`, err instanceof Error ? err.message : err);
    return 0n;
  }
}

/**
 * Get ERC20 token info (symbol, name, decimals).
 */
export async function getErc20Info(token: Address): Promise<{
  symbol: string;
  name: string;
  decimals: number;
} | null> {
  try {
    const results = await baseClient.multicall({
      contracts: [
        { address: token, abi: erc20Abi, functionName: 'symbol' },
        { address: token, abi: erc20Abi, functionName: 'name' },
        { address: token, abi: erc20Abi, functionName: 'decimals' },
      ],
      allowFailure: true,
    });

    // If decimals call failed, return null — callers should not assume 18
    const decimals = results[2].status === 'success' ? Number(results[2].result) : null;
    if (decimals === null) {
      console.warn(`[base] Failed to read decimals for token ${token}, skipping`);
      return null;
    }

    return {
      symbol: results[0].status === 'success' ? (results[0].result as string) : 'UNKNOWN',
      name: results[1].status === 'success' ? (results[1].result as string) : 'Unknown Token',
      decimals,
    };
  } catch (err) {
    console.warn(`[base] ERC20 info multicall failed for token=${token}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ═══════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════

/** The EVM zero address — never a real user wallet. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Check if a Base/EVM address is valid using viem's isAddress.
 * Rejects the zero address since it's never a real user wallet.
 */
export function isValidEvmAddress(address: string): boolean {
  if (!isAddress(address, { strict: false })) return false;
  if (address === ZERO_ADDRESS) return false;
  return true;
}

/**
 * Normalize an EVM address to EIP-55 checksummed form.
 * Use at wallet storage boundaries to prevent case-sensitive DB duplicates.
 */
export function normalizeEvmAddress(address: string): string {
  return getAddress(address);
}

/**
 * Format wei to ETH string.
 */
export function weiToEth(wei: bigint): string {
  return formatEther(wei);
}
