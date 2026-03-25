import 'server-only';
import { createPublicClient, http, fallback, isAddress, getAddress, parseAbi, parseAbiItem, type Address } from 'viem';
import { base } from 'viem/chains';
import {
  CLANKER_FEE_LOCKER,
  ZORA_PROTOCOL_REWARDS,
} from '@/lib/constants-evm';
import { chunkedGetLogs } from './evm-logs';
import { batchClankerFeesGeneric, getClankerClaimLogsGeneric } from './clanker-reads';

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
// Clanker ABI (clankerFeeLockerAbi) lives in clanker-reads.ts, shared by Base + BSC.
// ═══════════════════════════════════════════════

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
// Clanker Reads (delegated to shared clanker-reads.ts)
// ═══════════════════════════════════════════════

export async function batchClankerFees(
  owner: Address,
  tokens: Address[]
): Promise<Array<{ token: Address; available: bigint; claimed: bigint }>> {
  // Cast needed: viem's PublicClient<Transport, typeof base> has chain-specific type params
  // that don't unify with the structural MulticallClient interface, despite satisfying it at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchClankerFeesGeneric(baseClient as any, CLANKER_FEE_LOCKER, owner, tokens, '[base]');
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
// Clanker Claim Logs (delegated to shared clanker-reads.ts)
// ═══════════════════════════════════════════════

/** FeeLocker deployed ~late 2024 on Base. */
const CLANKER_FEELOCKER_DEPLOY_BLOCK = 20_000_000n;

/** Zora ProtocolRewards deployed ~Aug 2023 on Base (shortly after Base launch). */
const ZORA_REWARDS_BASE_DEPLOY_BLOCK = 1_000_000n;

const LOGS_CHUNK_SIZE = 10_000n;
const LOGS_PARALLEL_CHUNKS = 3;
const SCAN_WINDOW_BLOCKS = 500_000n;
const CLAIM_LOGS_TIMEOUT_MS = 15_000;

export async function getClankerClaimLogs(
  owner: Address,
  tokens: Address[]
): Promise<Map<string, bigint>> {
  // Cast needed: same viem chain-generic mismatch as batchClankerFees above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getClankerClaimLogsGeneric(baseLogsClient as any, CLANKER_FEE_LOCKER, CLANKER_FEELOCKER_DEPLOY_BLOCK, SCAN_WINDOW_BLOCKS, LOGS_CHUNK_SIZE, LOGS_PARALLEL_CHUNKS, 200, CLAIM_LOGS_TIMEOUT_MS, '[base]', owner, tokens);
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
