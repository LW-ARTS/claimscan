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
// Zora Withdraw Logs (ETH Mainnet)
// ═══════════════════════════════════════════════

const zoraWithdrawEvent = parseAbiItem(
  'event Withdraw(address indexed from, address indexed to, uint256 amount)'
);

/**
 * Get total withdrawn (claimed) ETH from Zora ProtocolRewards on ETH mainnet.
 */
export async function getZoraWithdrawLogsEth(
  account: Address
): Promise<bigint> {
  try {
    const logs = await ethClient.getLogs({
      address: ZORA_PROTOCOL_REWARDS,
      event: zoraWithdrawEvent,
      args: { from: account },
      fromBlock: ZORA_REWARDS_ETH_DEPLOY_BLOCK,
      toBlock: 'latest',
    });

    let total = 0n;
    for (const log of logs) {
      total += log.args.amount ?? 0n;
    }
    return total;
  } catch (err) {
    console.warn('[eth] getZoraWithdrawLogsEth failed:', err instanceof Error ? err.message : err);
    return 0n;
  }
}
