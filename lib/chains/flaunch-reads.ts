import 'server-only';
import { parseAbi } from 'viem';
import { baseClient } from './base';
import type { BaseAddress } from './types';
import { FLAUNCH_REVENUE_MANAGER } from '@/lib/constants-evm';
import { createLogger } from '@/lib/logger';

const log = createLogger('flaunch-reads');

// ═══════════════════════════════════════════════
// ABI — only the reads we use in Phase 11
// RevenueManager.balances returns ETH wei claimable AGGREGATED per wallet
// (not per coin). This is the canonical driver for the synthetic
// 'BASE:flaunch-revenue' TokenFee row.
// ═══════════════════════════════════════════════

const REVENUE_MANAGER_ABI = parseAbi([
  'function balances(address recipient) view returns (uint256)',
]);

/**
 * Read the aggregated ETH-wei claimable balance for a wallet from the
 * Flaunch RevenueManager on Base mainnet.
 *
 * Returns 0n on network error (does not throw). The adapter treats a 0
 * return the same way it treats "no coins": no TokenFee emitted.
 */
export async function readFlaunchBalances(recipient: BaseAddress): Promise<bigint> {
  try {
    const value = await baseClient.readContract({
      address: FLAUNCH_REVENUE_MANAGER,
      abi: REVENUE_MANAGER_ABI,
      functionName: 'balances',
      args: [recipient],
    });
    return value as bigint;
  } catch (err) {
    log.warn('readFlaunchBalances_failed', {
      recipient: recipient.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return 0n;
  }
}
