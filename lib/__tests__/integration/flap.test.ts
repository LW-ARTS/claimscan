import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/wallets/flap-creator.json';

// Skip when BSC_RPC_URL is missing so local `npm run test:integration` does
// not fall back to public RPCs with console.warn spam. CI injects Alchemy URL
// via .env.test.
describe.skipIf(!process.env.BSC_RPC_URL)('flapAdapter (integration, live BSC)', () => {
  it('returns ≥1 TokenFee row for fixture wallet with claimable > 0', async () => {
    expect.fail('stub — Plan 12-07 implements integration test against live BSC using fixture ' + fixture.wallet);
  });

  it('adapter totalUnclaimed matches direct bscClient.readContract(vault.claimable)', async () => {
    expect.fail('stub — Plan 12-07 implements parity cross-check');
  });
});
