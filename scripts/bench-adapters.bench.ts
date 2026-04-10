import { bench, describe } from 'vitest';
import { WALLET_FIXTURES } from '@/lib/__tests__/fixtures/wallets';
import { getAdapter } from '@/lib/platforms';

// tinybench options applied to every bench() call
const BENCH_OPTS = {
  time: 0,              // rely on iterations count only, not time budget
  iterations: 10,       // 10 clean samples per benchmark (BM-02)
  warmupIterations: 2,  // 2 warmup calls discarded before samples collected (BM-02)
  now: () => performance.now(),  // wall-clock measurement (BM-02)
};

for (const fixture of WALLET_FIXTURES) {
  describe(`${fixture.adapterName}`, () => {
    const adapter = getAdapter(fixture.adapterName)!;

    bench('getCreatorTokens', async () => {
      await adapter.getCreatorTokens(fixture.walletAddress);
    }, BENCH_OPTS);

    bench('getHistoricalFees', async () => {
      await adapter.getHistoricalFees(fixture.walletAddress);
    }, BENCH_OPTS);

    bench('getLiveUnclaimedFees', async () => {
      await adapter.getLiveUnclaimedFees(fixture.walletAddress);
    }, BENCH_OPTS);
  });
}
