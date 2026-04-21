import { describe, it, expect } from 'vitest';
import { parseAbi } from 'viem';
import fixture from '../fixtures/wallets/flaunch-creator.json';
import { flaunchAdapter } from '@/lib/platforms/flaunch';
import { baseClient } from '@/lib/chains/base';
import { FLAUNCH_REVENUE_MANAGER } from '@/lib/constants-evm';
import { asBaseAddress } from '@/lib/chains/types';

describe('flaunchAdapter (integration, hits real Flaunch API + Base RPC)', () => {
  const wallet = fixture.wallet as `0x${string}`;

  it('getCreatorTokens returns at least one Flaunch coin for fixture wallet', async () => {
    const tokens = await flaunchAdapter.getCreatorTokens(wallet);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token.platform).toBe('flaunch');
      expect(token.chain).toBe('base');
      expect(token.tokenAddress).toMatch(/^0x[a-f0-9]{40}$/);
    }
  }, 30_000);

  it('getHistoricalFees returns exactly one synthetic TokenFee', async () => {
    const fees = await flaunchAdapter.getHistoricalFees(wallet);
    expect(fees).toHaveLength(1);
    const [fee] = fees;
    expect(fee.tokenAddress).toBe('BASE:flaunch-revenue');
    expect(fee.tokenSymbol).toBe('ETH');
    expect(fee.platform).toBe('flaunch');
    expect(fee.chain).toBe('base');
    expect(fee.totalClaimed).toBe('0');
    expect(BigInt(fee.totalUnclaimed)).toBeGreaterThan(0n);
    expect(BigInt(fee.totalEarned)).toBe(BigInt(fee.totalUnclaimed));
  }, 30_000);

  it('totalUnclaimed matches a direct RevenueManager.balances read (parity)', async () => {
    // Read adapter and on-chain value in rapid succession so block delta is
    // bounded. We allow a small drift (absolute difference) in case a claim
    // transaction landed between the two reads.
    const [fees, directBalance] = await Promise.all([
      flaunchAdapter.getHistoricalFees(wallet),
      baseClient.readContract({
        address: FLAUNCH_REVENUE_MANAGER,
        abi: parseAbi(['function balances(address) view returns (uint256)']),
        functionName: 'balances',
        args: [asBaseAddress(wallet)],
      }),
    ]);
    expect(fees).toHaveLength(1);
    const adapterUnclaimed = BigInt(fees[0].totalUnclaimed);
    const direct = directBalance as bigint;

    // Exact match expected in the common case. Allow 0.001 ETH (1e15 wei)
    // absolute drift to tolerate an in-flight claim between the two reads.
    const diff = adapterUnclaimed > direct ? adapterUnclaimed - direct : direct - adapterUnclaimed;
    expect(diff).toBeLessThan(10n ** 15n);
  }, 30_000);

  it('getLiveUnclaimedFees is equivalent to historical when balance > 0', async () => {
    const [historical, live] = await Promise.all([
      flaunchAdapter.getHistoricalFees(wallet),
      flaunchAdapter.getLiveUnclaimedFees(wallet),
    ]);
    // Both should yield the same single row for a wallet with positive balance.
    expect(live).toHaveLength(historical.length);
    if (live.length === 1 && historical.length === 1) {
      expect(live[0].tokenAddress).toBe(historical[0].tokenAddress);
    }
  }, 30_000);

  it('returns empty array for a wallet with no Flaunch NFTs', async () => {
    // Well-known dead address, chosen because it demonstrably holds no
    // Memestream NFT. If this ever flips, replace with another cold wallet.
    const emptyWallet = '0x000000000000000000000000000000000000dEaD';
    const tokens = await flaunchAdapter.getCreatorTokens(emptyWallet);
    expect(tokens).toHaveLength(0);
    const fees = await flaunchAdapter.getHistoricalFees(emptyWallet);
    expect(fees).toHaveLength(0);
  }, 30_000);
});
