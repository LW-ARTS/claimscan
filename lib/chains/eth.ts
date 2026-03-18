import 'server-only';
import { createPublicClient, http, fallback, parseAbi, parseAbiItem, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { ZORA_PROTOCOL_REWARDS } from '@/lib/constants-evm';
import { chunkedGetLogs } from './evm-logs';

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
// Chunked getLogs constants
// ═══════════════════════════════════════════════

/** Max blocks per getLogs query on ETH public RPCs. */
const ETH_LOGS_CHUNK_SIZE = 10_000n;

/** Concurrent chunk requests. */
const ETH_LOGS_PARALLEL_CHUNKS = 5;

/** Scan window: ~50K blocks ≈ ~7 days on ETH (~12s block time).
 * Smaller than Base (500K) because ETH public RPCs are slower. */
const ETH_SCAN_WINDOW_BLOCKS = 50_000n;

/** Timeout to prevent blocking resolve when RPCs are slow.
 * 20s gives room for retries on slower ETH public RPCs. */
const ETH_CLAIM_LOGS_TIMEOUT_MS = 20_000;

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

    const logs = await chunkedGetLogs(
      ethLogsClient,
      '[eth]',
      ETH_LOGS_CHUNK_SIZE,
      ETH_LOGS_PARALLEL_CHUNKS,
      0,
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
