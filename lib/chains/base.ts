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

/** Max blocks per getLogs query.
 * mainnet.base.org and drpc.org both support ~10K blocks per getLogs. */
const LOGS_CHUNK_SIZE = 10_000n;

/** Concurrent chunk requests for chunkedGetLogs. */
const LOGS_PARALLEL_CHUNKS = 3;

/** Scan window: ~200K blocks ≈ ~4.6 days of Base blocks (2s block time).
 * All tokens are scanned in a single pass (address array), so total chunks = 200K/10K = 20.
 * At 3 parallel = ~7 rounds × ~500ms = ~3.5s per scan. Combined with MAX preservation
 * in creator.ts, claimed values never regress from partial scans. */
const SCAN_WINDOW_BLOCKS = 200_000n;

/** Timeout for getLogs-based scans — prevents blocking the resolve if RPCs are slow.
 * 25s gives room for retries (1s+2s+3s backoff) across ~7 sequential rounds,
 * while staying within the 55s overall resolve budget. */
const CLAIM_LOGS_TIMEOUT_MS = 25_000;

// ═══════════════════════════════════════════════
// Chunked getLogs (works around RPC block limits)
// ═══════════════════════════════════════════════

/**
 * Split a large getLogs range into 10K-block chunks processed in parallel batches.
 * Uses baseLogsClient (public RPC) which supports 10K blocks per query.
 */
/** Fetch logs for a single chunk range with retry + exponential backoff on 429. */
async function fetchLogsChunk(params: {
  address: Address | Address[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  args: Record<string, Address>;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<Array<{ address: string; args: Record<string, unknown> }>> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (baseLogsClient as any).getLogs({
        address: params.address,
        event: params.event,
        args: params.args,
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      });
      return logs as Array<{ address: string; args: Record<string, unknown> }>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = msg.includes('429') || msg.includes('rate limit') || msg.includes('503') || msg.includes('no backend');
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = 1_000 * (attempt + 1); // 1s, 2s, 3s
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return []; // unreachable but satisfies TS
}

async function chunkedGetLogs(params: {
  address: Address | Address[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  args: Record<string, Address>;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<Array<{ address: string; args: Record<string, unknown> }>> {
  const { address, event, args, fromBlock, toBlock } = params;
  if (fromBlock > toBlock) return [];

  // Build list of [start, end] chunk ranges
  const chunks: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += LOGS_CHUNK_SIZE) {
    const end = start + LOGS_CHUNK_SIZE - 1n > toBlock ? toBlock : start + LOGS_CHUNK_SIZE - 1n;
    chunks.push([start, end]);
  }

  const allLogs: Array<{ address: string; args: Record<string, unknown> }> = [];

  // Process in parallel batches — retry logic handles 429s
  for (let i = 0; i < chunks.length; i += LOGS_PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + LOGS_PARALLEL_CHUNKS);
    const results = await Promise.allSettled(
      batch.map(([start, end]) =>
        fetchLogsChunk({ address, event, args, fromBlock: start, toBlock: end })
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allLogs.push(...r.value);
      } else {
        console.warn('[base] chunkedGetLogs chunk failed:', r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }

    // Throttle between rounds to avoid overwhelming public RPCs
    if (i + LOGS_PARALLEL_CHUNKS < chunks.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allLogs;
}

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

    console.log(`[base] getClankerClaimLogs: scanning ${tokens.length} tokens, blocks ${fromBlock}..${latestBlock} (${latestBlock - fromBlock} blocks, ${(latestBlock - fromBlock) / LOGS_CHUNK_SIZE} chunks)`);

    const logs = await chunkedGetLogs({
      address: tokens,
      event: erc20TransferEvent,
      args: {
        from: CLANKER_FEE_LOCKER,
        to: owner,
      },
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const token = log.address.toLowerCase();
      const value = (log.args.value as bigint) ?? 0n;
      claimMap.set(token, (claimMap.get(token) ?? 0n) + value);
    }

    console.log(`[base] getClankerClaimLogs: found ${claimMap.size} tokens with claims, ${logs.length} transfers in ${Date.now() - t0}ms`);
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

    const logs = await chunkedGetLogs({
      address: ZORA_PROTOCOL_REWARDS,
      event: zoraWithdrawEvent,
      args: { from: account },
      fromBlock,
      toBlock: latestBlock,
    });

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
