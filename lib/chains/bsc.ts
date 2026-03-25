import 'server-only';
import { createPublicClient, http, fallback, type Address } from 'viem';
import { bsc } from 'viem/chains';
import { CLANKER_BSC_FEE_LOCKER } from '@/lib/constants-evm';
import { batchClankerFeesGeneric, getClankerClaimLogsGeneric } from './clanker-reads';
import { createLogger } from '@/lib/logger';
const log = createLogger('bsc');

// ═══════════════════════════════════════════════
// Client (multi-RPC with adaptive fallback)
// ═══════════════════════════════════════════════

const BSC_RPC_URLS: string[] = (() => {
  const envUrls = process.env.BSC_RPC_URL;
  if (!envUrls) {
    log.warn('BSC_RPC_URL is not set — falling back to public RPCs which are rate-limited and unreliable for production.');
    return ['https://bsc-dataseed.binance.org'];
  }
  return envUrls.split(',').map((u) => u.trim()).filter(Boolean);
})();

export const bscClient = createPublicClient({
  chain: bsc,
  transport: BSC_RPC_URLS.length === 1
    ? http(BSC_RPC_URLS[0], { timeout: 10_000, retryCount: 2, retryDelay: 500 })
    : fallback(
        BSC_RPC_URLS.map((url) => http(url, { timeout: 10_000 })),
        { rank: true }
      ),
});

/**
 * Dedicated client for eth_getLogs calls using free public RPCs.
 * BSC public RPCs support smaller block ranges (~5K) than Base (~10K).
 */
const BSC_PUBLIC_RPCS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-rpc.publicnode.com',
];
export const bscLogsClient = createPublicClient({
  chain: bsc,
  transport: fallback(
    BSC_PUBLIC_RPCS.map((url) => http(url, { timeout: 15_000 })),
    { rank: true }
  ),
});

// ═══════════════════════════════════════════════
// Clanker Reads (BSC)
// ═══════════════════════════════════════════════

/** Clanker FeeLocker deployed on BSC ~mid Feb 2026.
 * First BSC token created 2026-02-20. Conservative floor ~1 week before that. */
const CLANKER_BSC_FEELOCKER_DEPLOY_BLOCK = 87_000_000n;

/** BSC has 3s blocks. 250K blocks ≈ ~8.7 days.
 * Smaller than Base (500K) because BSC RPCs support 5K block ranges vs Base's 10K,
 * producing 50 chunks (same as Base) to fit within the 15s timeout budget. */
const BSC_SCAN_WINDOW_BLOCKS = 250_000n;

/** BSC public RPCs typically support 5K block ranges for getLogs. */
const BSC_LOGS_CHUNK_SIZE = 5_000n;
const BSC_LOGS_PARALLEL_CHUNKS = 3;
const BSC_CLAIM_LOGS_TIMEOUT_MS = 15_000;

export async function batchClankerFeesBsc(
  owner: Address,
  tokens: Address[]
): Promise<Array<{ token: Address; available: bigint; claimed: bigint }>> {
  // Cast needed: viem's PublicClient<Transport, typeof bsc> has chain-specific type params
  // that don't unify with the structural MulticallClient interface, despite satisfying it at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchClankerFeesGeneric(bscClient as any, CLANKER_BSC_FEE_LOCKER, owner, tokens, '[bsc]');
}

export async function getClankerClaimLogsBsc(
  owner: Address,
  tokens: Address[]
): Promise<Map<string, bigint>> {
  // Cast needed: same viem chain-generic mismatch as batchClankerFeesBsc above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getClankerClaimLogsGeneric(bscLogsClient as any, CLANKER_BSC_FEE_LOCKER, CLANKER_BSC_FEELOCKER_DEPLOY_BLOCK, BSC_SCAN_WINDOW_BLOCKS, BSC_LOGS_CHUNK_SIZE, BSC_LOGS_PARALLEL_CHUNKS, 200, BSC_CLAIM_LOGS_TIMEOUT_MS, '[bsc]', owner, tokens);
}
