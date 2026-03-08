import 'server-only';
import { createPublicClient, http, fallback, parseAbi, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { ZORA_PROTOCOL_REWARDS } from '@/lib/constants';

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
