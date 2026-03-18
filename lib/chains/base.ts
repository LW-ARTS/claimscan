import 'server-only';
import { createPublicClient, http, fallback, isAddress, getAddress, parseAbi, parseAbiItem, type Address } from 'viem';
import { base } from 'viem/chains';
import {
  CLANKER_FEE_LOCKER,
  ZORA_PROTOCOL_REWARDS,
} from '@/lib/constants-evm';
import { chunkedGetLogs } from './evm-logs';

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

/**
 * Dedicated client for eth_getLogs calls using free public RPCs.
 * Alchemy free tier limits getLogs to ~10 blocks, making it useless for
 * scanning claim history. Public RPCs support larger ranges.
 * Uses fallback transport across multiple free RPCs for resilience.
 * Only used for getLogs — multicall/readContract stay on baseClient (Alchemy).
 */
const BASE_PUBLIC_RPCS = [
  'https://mainnet.base.org',    // 10K block limit
  'https://base.drpc.org',       // ~10K block limit
];
export const baseLogsClient = createPublicClient({
  chain: base,
  transport: fallback(
    BASE_PUBLIC_RPCS.map((url) => http(url, { timeout: 15_000 })),
    { rank: true }
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

/** Max blocks per getLogs query.
 * mainnet.base.org and drpc.org both support ~10K blocks per getLogs. */
const LOGS_CHUNK_SIZE = 10_000n;

/** Concurrent chunk requests for chunkedGetLogs. */
const LOGS_PARALLEL_CHUNKS = 3;

/** Scan window: ~500K blocks ≈ ~11.5 days of Base blocks (2s block time).
 * All tokens are scanned in a single pass (address array), so total chunks = 500K/10K = 50.
 * At 3 parallel = ~17 rounds × ~500ms = ~8.5s per scan. Combined with MAX preservation
 * in creator.ts, claimed values never regress from partial scans. */
const SCAN_WINDOW_BLOCKS = 500_000n;

/** Timeout for getLogs-based scans — prevents blocking the resolve if RPCs are slow.
 * 500K blocks / 10K chunks = 50 chunks. At 3 parallel = ~17 rounds × ~500ms = ~8.5s.
 * 15s gives room for retries (1s+2s+3s backoff) while staying within resolve budget. */
const CLAIM_LOGS_TIMEOUT_MS = 15_000;

/**
 * Get total claimed fees per token by scanning Transfer events FROM the FeeLocker TO the owner.
 * Scans ALL tokens in a single chunked pass using address array — O(chunks) not O(tokens×chunks).
 * Returns a Map of lowercase token address → total claimed wei.
 */
export async function getClankerClaimLogs(
  owner: Address,
  tokens: Address[]
): Promise<Map<string, bigint>> {
  if (tokens.length === 0) return new Map();

  // Wrap in a timeout to prevent blocking the resolve when RPCs are slow.
  // Returns empty map on timeout — tokens with available>0 still appear.
  const scan = async (): Promise<Map<string, bigint>> => {
    const claimMap = new Map<string, bigint>();
    const t0 = Date.now();
    const latestBlock = await baseLogsClient.getBlockNumber();
    const fromBlock = latestBlock > SCAN_WINDOW_BLOCKS
      ? latestBlock - SCAN_WINDOW_BLOCKS
      : CLANKER_FEELOCKER_DEPLOY_BLOCK;

    if (process.env.VERBOSE_LOGS) console.debug(`[base] getClankerClaimLogs: scanning ${tokens.length} tokens, blocks ${fromBlock}..${latestBlock} (${latestBlock - fromBlock} blocks, ${(latestBlock - fromBlock) / LOGS_CHUNK_SIZE} chunks)`);

    const logs = await chunkedGetLogs(
      baseLogsClient,
      '[base]',
      LOGS_CHUNK_SIZE,
      LOGS_PARALLEL_CHUNKS,
      200,
      {
        address: tokens,
        event: erc20TransferEvent,
        args: {
          from: CLANKER_FEE_LOCKER,
          to: owner,
        },
        fromBlock,
        toBlock: latestBlock,
      }
    );

    for (const log of logs) {
      const token = log.address.toLowerCase();
      const value = (log.args.value as bigint) ?? 0n;
      claimMap.set(token, (claimMap.get(token) ?? 0n) + value);
    }

    if (process.env.VERBOSE_LOGS) console.debug(`[base] getClankerClaimLogs: found ${claimMap.size} tokens with claims, ${logs.length} transfers in ${Date.now() - t0}ms`);
    return claimMap;
  };

  try {
    return await Promise.race([
      scan(),
      new Promise<Map<string, bigint>>((resolve) =>
        setTimeout(() => {
          console.warn(`[base] getClankerClaimLogs: timed out after ${CLAIM_LOGS_TIMEOUT_MS}ms`);
          resolve(new Map());
        }, CLAIM_LOGS_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.warn('[base] getClankerClaimLogs failed:', err instanceof Error ? err.message : err);
    return new Map();
  }
}

// ═══════════════════════════════════════════════
// Zora Withdraw Logs (Event-based claimed totals)
// ═══════════════════════════════════════════════

const zoraWithdrawEvent = parseAbiItem(
  'event Withdraw(address indexed from, address indexed to, uint256 amount)'
);

/**
 * Get total withdrawn (claimed) ETH from Zora ProtocolRewards on Base.
 * Uses chunked getLogs via public RPCs with timeout protection.
 */
export async function getZoraWithdrawLogs(
  account: Address
): Promise<bigint> {
  const scan = async (): Promise<bigint> => {
    const latestBlock = await baseLogsClient.getBlockNumber();
    const fromBlock = latestBlock > SCAN_WINDOW_BLOCKS
      ? latestBlock - SCAN_WINDOW_BLOCKS
      : ZORA_REWARDS_BASE_DEPLOY_BLOCK;

    const logs = await chunkedGetLogs(
      baseLogsClient,
      '[base]',
      LOGS_CHUNK_SIZE,
      LOGS_PARALLEL_CHUNKS,
      200,
      {
        address: ZORA_PROTOCOL_REWARDS,
        event: zoraWithdrawEvent,
        args: { from: account },
        fromBlock,
        toBlock: latestBlock,
      }
    );

    let total = 0n;
    for (const log of logs) {
      total += (log.args.amount as bigint) ?? 0n;
    }
    return total;
  };

  try {
    return await Promise.race([
      scan(),
      new Promise<bigint>((resolve) =>
        setTimeout(() => {
          console.warn(`[base] getZoraWithdrawLogs: timed out after ${CLAIM_LOGS_TIMEOUT_MS}ms`);
          resolve(0n);
        }, CLAIM_LOGS_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.warn('[base] getZoraWithdrawLogs failed:', err instanceof Error ? err.message : err);
    return 0n;
  }
}

// ═══════════════════════════════════════════════
// ERC20 Reads
// ═══════════════════════════════════════════════

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
