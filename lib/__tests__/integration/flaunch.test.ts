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

  it('getHistoricalFees returns exactly one synthetic TokenFee with historical earnings', async () => {
    const fees = await flaunchAdapter.getHistoricalFees(wallet);
    expect(fees).toHaveLength(1);
    const [fee] = fees;
    expect(fee.tokenAddress).toBe('BASE:flaunch-revenue');
    expect(fee.tokenSymbol).toBe('ETH');
    expect(fee.platform).toBe('flaunch');
    expect(fee.chain).toBe('base');
    // Fixture wallet claimed ~$159K (~50 ETH) historically. totalEarned must
    // reflect historical earnings.
    expect(BigInt(fee.totalEarned)).toBeGreaterThan(0n);
    // Earned must be >= unclaimed (can't claim more than you earned).
    expect(BigInt(fee.totalEarned)).toBeGreaterThanOrEqual(BigInt(fee.totalUnclaimed));
    // totalClaimed = totalEarned - totalUnclaimed (always non-negative).
    expect(BigInt(fee.totalClaimed)).toBeGreaterThanOrEqual(0n);
    expect(BigInt(fee.totalClaimed)).toBe(BigInt(fee.totalEarned) - BigInt(fee.totalUnclaimed));
    // Floor assertion — guards against silent regression where
    // readFlaunchHistoricalEarnings returns 0n (partial failure, ABI change,
    // wrong addresses, etc). If totalEarned collapses to claimable (~0), all
    // other asserts in this block still pass, but totalClaimed drops to 0 and
    // the user-visible "~$159K claimed" disappears. 10 ETH (10n ** 19n wei) is
    // well below the fixture's real ~50 ETH and well above any noise floor.
    expect(BigInt(fee.totalClaimed)).toBeGreaterThanOrEqual(10n ** 19n);
  }, 60_000);

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

    // Exact match expected in the common case. Allow 0.01 ETH (1e16 wei)
    // absolute drift — 0.001 ETH was too tight for the ~$159K fixture wallet,
    // where a single claim tx during the ~100ms window between the two reads
    // can exceed that. 0.01 ETH is still tight enough to catch a systemic
    // adapter/RPC divergence (e.g., reading from wrong contract).
    const diff = adapterUnclaimed > direct ? adapterUnclaimed - direct : direct - adapterUnclaimed;
    expect(diff).toBeLessThan(10n ** 16n);
  }, 60_000);

  it('getLiveUnclaimedFees returns empty for a fully-claimed wallet', async () => {
    // Fixture wallet claimed everything: historical shows earnings but live shows nothing.
    const [historical, live] = await Promise.all([
      flaunchAdapter.getHistoricalFees(wallet),
      flaunchAdapter.getLiveUnclaimedFees(wallet),
    ]);
    expect(historical).toHaveLength(1);
    expect(BigInt(historical[0].totalEarned)).toBeGreaterThan(0n);
    // All fees were claimed, so live unclaimed should be empty.
    expect(live).toHaveLength(0);
  }, 60_000);

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
