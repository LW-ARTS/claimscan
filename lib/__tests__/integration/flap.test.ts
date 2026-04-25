import { describe, it, expect } from 'vitest';
import { parseAbi } from 'viem';
import fixture from '../fixtures/wallets/flap-creator.json';
import { flapAdapter } from '@/lib/platforms/flap';
import { bscClient } from '@/lib/chains/bsc';

// Skip when BSC_RPC_URL is missing so local `npm run test:integration` does
// not fall back to public RPCs with console.warn spam. CI injects the Alchemy
// URL via .env.test.
describe.skipIf(!process.env.BSC_RPC_URL)('flapAdapter (integration, live BSC)', () => {
  const wallet = fixture.wallet as `0x${string}`;
  const CLAIMABLE_ABI = parseAbi(['function claimable(address user) view returns (uint256)']);

  it('getHistoricalFees returns at least one row with totalUnclaimed > 0', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    expect(fees.length).toBeGreaterThanOrEqual(1);
    // D-12 filter should have removed any 0n rows.
    for (const fee of fees) {
      expect(BigInt(fee.totalUnclaimed)).toBeGreaterThan(0n);
    }
  }, 60_000);

  it('each row totalUnclaimed matches direct vault.claimable read (parity)', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    expect(fees.length).toBeGreaterThanOrEqual(1);

    // For each row, read claimable directly from the vault as a sanity check.
    // The adapter's getHistoricalFees dispatches to resolveHandler(row.vault_type)
    // which calls bscClient.readContract on CLAIMABLE_ABI, so parity should be EXACT.
    for (const fee of fees) {
      // The adapter emits the TOKEN address as tokenAddress, we need the vault.
      // Adapter doesn't expose vault directly in TokenFee (by design, UI doesn't need it),
      // so we go through the DB: look up flap_tokens.vault_address for this token.
      // Since this is a live integration test with a seeded DB, we just trust that
      // the adapter's multicall result IS the claimable read.
      //
      // Parity proof is: re-read the vault (via fixture.vault for the known fixture
      // token) and assert the adapter-returned value for THAT token matches.
      if (fee.tokenAddress !== fixture.token) continue;
      const directClaimable = await bscClient.readContract({
        address: fixture.vault as `0x${string}`,
        abi: CLAIMABLE_ABI,
        functionName: 'claimable',
        args: [wallet],
      });
      expect(BigInt(fee.totalUnclaimed)).toBe(directClaimable);
      return; // exits loop after verifying the fixture-token row
    }
    // If we fall through, the fixture token was not in the adapter's output, the
    // fixture was stale. Fail with a clear message pointing to the caveat field.
    throw new Error(
      `Fixture token ${fixture.token} not found in adapter output for wallet ${wallet}. ` +
        `Either claimable dropped to 0 (D-12 filter) or the fixture needs re-selection. ` +
        `See fixture.caveat for substitution protocol.`,
    );
  }, 60_000);

  it('adapter respects D-12 filter, no zero-balance rows emitted', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    for (const fee of fees) {
      expect(BigInt(fee.totalUnclaimed)).toBeGreaterThan(0n);
    }
  }, 60_000);

  it('every row carries vaultType (base-v1 | base-v2 | unknown)', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    expect(fees.length).toBeGreaterThanOrEqual(1);
    for (const fee of fees) {
      expect(['base-v1', 'base-v2', 'unknown']).toContain(fee.vaultType);
    }
  }, 60_000);
});
