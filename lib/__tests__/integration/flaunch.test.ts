import { describe, it, expect } from 'vitest';
import { parseAbi } from 'viem';
import fixture from '../fixtures/wallets/flaunch-creator.json';
import { flaunchAdapter } from '@/lib/platforms/flaunch';
import { baseClient } from '@/lib/chains/base';
import { FLAUNCH_REVENUE_MANAGER } from '@/lib/constants-evm';
import { asBaseAddress } from '@/lib/chains/types';

// Skip when BASE_RPC_URL is missing so local `npm run test:integration` does
// not fall back to the public `mainnet.base.org` endpoint with console.warn
// spam. CI injects the Alchemy URL via .env.test.
describe.skipIf(!process.env.BASE_RPC_URL)('flaunchAdapter (integration, hits real Flaunch API + Base RPC)', () => {
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

  it('getHistoricalFees returns per-coin TokenFees plus optional legacy row', async () => {
    const fees = await flaunchAdapter.getHistoricalFees(wallet);

    // Fixture wallet has 130+ Takeover.fun coins, but only ~20 have non-zero
    // totalFeesAllocated in the FeeEscrow (the rest are dormant). The adapter
    // skips coins with earned=0 to avoid 100+ noise rows. Floor at 10 to
    // protect against silent regression where the per-coin path collapses
    // back to a single legacy row.
    expect(fees.length).toBeGreaterThanOrEqual(10);

    // Every row uses platform=flaunch, chain=base.
    for (const fee of fees) {
      expect(fee.platform).toBe('flaunch');
      expect(fee.chain).toBe('base');
    }

    // Per-coin rows use real 0x token addresses with non-empty symbols.
    const perCoinRows = fees.filter((f) => f.tokenAddress !== 'BASE:flaunch-legacy');
    expect(perCoinRows.length).toBeGreaterThanOrEqual(10);
    for (const row of perCoinRows) {
      expect(row.tokenAddress).toMatch(/^0x[a-f0-9]{40}$/);
      expect(row.tokenSymbol).toBeTruthy();
      expect(BigInt(row.totalEarned)).toBeGreaterThan(0n);
      // Per-coin rows attribute everything earned as claimed; claimable
      // is held in the legacy row.
      expect(row.totalUnclaimed).toBe('0');
      expect(BigInt(row.totalClaimed)).toBe(BigInt(row.totalEarned));
    }

    // Aggregate floor — guards against silent regression where
    // readFlaunchHistoricalEarnings returns empty perCoin (partial failure,
    // ABI change, wrong addresses, etc). 10 ETH (10n ** 19n wei) is well
    // below the fixture's real ~50 ETH and well above any noise floor.
    const totalEarned = fees.reduce((s, f) => s + BigInt(f.totalEarned), 0n);
    expect(totalEarned).toBeGreaterThanOrEqual(10n ** 19n);
  }, 90_000);

  it('legacy row totalUnclaimed matches RevenueManager.balances (parity)', async () => {
    // The wallet-wide claimable lives in the BASE:flaunch-legacy row.
    // Verify it matches a direct on-chain read within a small drift.
    const [fees, directBalance] = await Promise.all([
      flaunchAdapter.getHistoricalFees(wallet),
      baseClient.readContract({
        address: FLAUNCH_REVENUE_MANAGER,
        abi: parseAbi(['function balances(address) view returns (uint256)']),
        functionName: 'balances',
        args: [asBaseAddress(wallet)],
      }),
    ]);
    const direct = directBalance as bigint;
    const legacyRow = fees.find((f) => f.tokenAddress === 'BASE:flaunch-legacy');

    if (direct === 0n) {
      // Fully-claimed wallet: legacy row is omitted (claimable=0 and there's
      // no old-PM-only fallback condition). This is fine.
      expect(legacyRow).toBeUndefined();
      return;
    }

    expect(legacyRow).toBeDefined();
    const adapterUnclaimed = BigInt(legacyRow!.totalUnclaimed);

    // Allow 0.01 ETH (1e16 wei) drift for in-flight claim between reads.
    const diff = adapterUnclaimed > direct ? adapterUnclaimed - direct : direct - adapterUnclaimed;
    expect(diff).toBeLessThan(10n ** 16n);
  }, 60_000);

  it('getLiveUnclaimedFees returns only rows with claimable > 0', async () => {
    // Fully-claimed wallet (claimable=0): historical has 50+ per-coin rows
    // (totalUnclaimed=0 each) and no legacy row. live is empty.
    const [historical, live] = await Promise.all([
      flaunchAdapter.getHistoricalFees(wallet),
      flaunchAdapter.getLiveUnclaimedFees(wallet),
    ]);
    expect(historical.length).toBeGreaterThanOrEqual(10);
    // Every per-coin row has totalUnclaimed=0 by construction, so live
    // contains only the legacy row when claimable > 0, else nothing.
    for (const row of live) {
      expect(BigInt(row.totalUnclaimed)).toBeGreaterThan(0n);
      expect(row.tokenAddress).toBe('BASE:flaunch-legacy');
    }
  }, 90_000);

  it('returns empty array for a wallet with no Flaunch NFTs', async () => {
    // RevenueManager contract address — a contract, not an EOA, so it can
    // never be a token creator. Safe against "someone launched to this address."
    const emptyWallet = '0xc8d4B2Ca8eD6868eE768beAb1f932d7eecCc1b50';
    const tokens = await flaunchAdapter.getCreatorTokens(emptyWallet);
    expect(tokens).toHaveLength(0);
    const fees = await flaunchAdapter.getHistoricalFees(emptyWallet);
    expect(fees).toHaveLength(0);
  }, 30_000);
});
