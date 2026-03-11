import 'server-only';
import { createPublicClient, http, fallback, parseAbi, parseAbiItem, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { ZORA_PROTOCOL_REWARDS } from '@/lib/constants';

/** Zora ProtocolRewards deployed ~mid 2023 on ETH mainnet.
 * Conservative floor to avoid scanning from genesis while being safely before deployment. */
const ZORA_REWARDS_ETH_DEPLOY_BLOCK = 17_000_000n;

// ═══════════════════════════════════════════════
// Client (multi-RPC with adaptive fallback)
// ═══════════════════════════════════════════════

const ETH_RPC_URLS: string[] = (() => {
  const envUrls = process.env.ETH_RPC_URL;
  if (!envUrls) {
    console.warn(
      '[eth] ETH_RPC_URL is not set — falling back to public RPC which is rate-limited and unreliable for production.'
    );
    return ['https://eth.llamarpc.com'];
  }
  return envUrls.split(',').map((u) => u.trim()).filter(Boolean);
})();

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: ETH_RPC_URLS.length === 1
    ? http(ETH_RPC_URLS[0], { timeout: 10_000, retryCount: 2, retryDelay: 500 })
    : fallback(
        ETH_RPC_URLS.map((url) => http(url, { timeout: 10_000 })),
        { rank: true }
      ),
});

/**
 * Dedicated client for eth_getLogs calls using free public RPCs.
 * Alchemy free tier limits getLogs to ~10 blocks, making it useless for
 * scanning withdraw history. Public RPCs support larger ranges.
 */
const ETH_PUBLIC_RPCS = [
  'https://rpc.ankr.com/eth',
  'https://ethereum-rpc.publicnode.com',
];
const ethLogsClient = createPublicClient({
  chain: mainnet,
  transport: fallback(
    ETH_PUBLIC_RPCS.map((url) => http(url, { timeout: 15_000 })),
    { rank: true }
  ),
});

// ═══════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════

const zoraProtocolRewardsAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

// ═══════════════════════════════════════════════
// Zora Reads (ETH Mainnet)
// ═══════════════════════════════════════════════

/**
 * Get unclaimed Zora ProtocolRewards balance on ETH mainnet.
 * The same contract (0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B) is deployed
 * on both Base and ETH mainnet.
 */
export async function getZoraProtocolRewardsBalanceEth(
  account: Address
): Promise<bigint> {
  try {
    return await ethClient.readContract({
      address: ZORA_PROTOCOL_REWARDS,
      abi: zoraProtocolRewardsAbi,
      functionName: 'balanceOf',
      args: [account],
    });
  } catch (err) {
    console.warn('[eth] Zora ProtocolRewards balanceOf failed:', err instanceof Error ? err.message : err);
    return 0n;
  }
}

// ═══════════════════════════════════════════════
// Chunked getLogs (works around RPC block limits)
// ═══════════════════════════════════════════════

/** Max blocks per getLogs query on ETH public RPCs. */
const ETH_LOGS_CHUNK_SIZE = 10_000n;

/** Concurrent chunk requests. */
const ETH_LOGS_PARALLEL_CHUNKS = 5;

/** Scan window: ~10K blocks ≈ ~33 hours on ETH (~12s block time).
 * Much smaller than Base (500K) because ETH public RPCs are significantly slower
 * and multiple wallets scan concurrently. */
const ETH_SCAN_WINDOW_BLOCKS = 10_000n;

/** Timeout to prevent blocking resolve when RPCs are slow.
 * 20s gives room for retries on slower ETH public RPCs. */
const ETH_CLAIM_LOGS_TIMEOUT_MS = 20_000;

/** Fetch logs for a single chunk range with retry + exponential backoff. */
async function fetchLogsChunkEth(params: {
  address: Address;
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
      const logs = await (ethLogsClient as any).getLogs({
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
        const delay = 1_000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return [];
}

async function chunkedGetLogsEth(params: {
  address: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  args: Record<string, Address>;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<Array<{ address: string; args: Record<string, unknown> }>> {
  const { address, event, args, fromBlock, toBlock } = params;
  if (fromBlock > toBlock) return [];

  const chunks: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += ETH_LOGS_CHUNK_SIZE) {
    const end = start + ETH_LOGS_CHUNK_SIZE - 1n > toBlock ? toBlock : start + ETH_LOGS_CHUNK_SIZE - 1n;
    chunks.push([start, end]);
  }

  const allLogs: Array<{ address: string; args: Record<string, unknown> }> = [];

  for (let i = 0; i < chunks.length; i += ETH_LOGS_PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + ETH_LOGS_PARALLEL_CHUNKS);
    const results = await Promise.allSettled(
      batch.map(([start, end]) =>
        fetchLogsChunkEth({ address, event, args, fromBlock: start, toBlock: end })
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allLogs.push(...r.value);
      } else {
        console.warn('[eth] chunkedGetLogsEth chunk failed:', r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }
  }

  return allLogs;
}

// ═══════════════════════════════════════════════
// Zora Withdraw Logs (ETH Mainnet)
// ═══════════════════════════════════════════════

const zoraWithdrawEvent = parseAbiItem(
  'event Withdraw(address indexed from, address indexed to, uint256 amount)'
);

/**
 * Get total withdrawn (claimed) ETH from Zora ProtocolRewards on ETH mainnet.
 * Uses chunked getLogs via public RPCs to avoid Alchemy free tier 10-block limit.
 */
export async function getZoraWithdrawLogsEth(
  account: Address
): Promise<bigint> {
  const scan = async (): Promise<bigint> => {
    // Use ethClient (Alchemy) for fast getBlockNumber, ethLogsClient for getLogs
    const latestBlock = await ethClient.getBlockNumber();
    const fromBlock = latestBlock > ETH_SCAN_WINDOW_BLOCKS
      ? latestBlock - ETH_SCAN_WINDOW_BLOCKS
      : ZORA_REWARDS_ETH_DEPLOY_BLOCK;

    const logs = await chunkedGetLogsEth({
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
          console.warn(`[eth] getZoraWithdrawLogsEth: timed out after ${ETH_CLAIM_LOGS_TIMEOUT_MS}ms`);
          resolve(0n);
        }, ETH_CLAIM_LOGS_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.warn('[eth] getZoraWithdrawLogsEth failed:', err instanceof Error ? err.message : err);
    return 0n;
  }
}
