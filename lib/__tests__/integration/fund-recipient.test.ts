import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/wallets/flap-fund-recipient-creator.json';
import { fundRecipientHandler } from '@/lib/platforms/flap-vaults/fund-recipient';
import { detectFundRecipient } from '@/lib/platforms/flap-vaults';

describe.skipIf(!process.env.BSC_RPC_URL)('fund-recipient handler (integration, live BSC)', () => {
  it('readCumulative returns >= 70 BNB for fixture taxProcessor', async () => {
    const result = await fundRecipientHandler.readCumulative(fixture.tax_processor as `0x${string}`);
    expect(result).toBeGreaterThanOrEqual(BigInt(fixture.expected_cumulative_at_least_wei));
  }, 60_000);

  it('detectFundRecipient classifies fixture token correctly', async () => {
    const fr = await detectFundRecipient(fixture.token as `0x${string}`);
    expect(fr.matched).toBe(true);
    expect(fr.taxProcessor!.toLowerCase()).toBe(fixture.tax_processor.toLowerCase());
    expect(fr.marketAddress!.toLowerCase()).toBe(fixture.wallet.toLowerCase());
  }, 60_000);

  it('detectFundRecipient returns matched=false for a base-v2 fixture (mutual exclusion)', async () => {
    // Reuse Phase 12 base-v2 fixture token. Even though it has a taxProcessor,
    // its marketAddress is a contract (the vault), not an EOA, so getCode check rejects.
    const fr = await detectFundRecipient('0x7372bf3b8744e6ee9eeb8c1613c4ac4aa4f67777');
    expect(fr.matched).toBe(false);
  }, 60_000);
});
