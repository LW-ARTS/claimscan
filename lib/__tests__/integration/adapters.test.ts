import { describe, it, expect } from 'vitest';
import { getAdapter } from '@/lib/platforms';
import { getFixture } from '@/lib/__tests__/fixtures/wallets';
import { assertTokenFeeShape } from '@/lib/__tests__/helpers/assertions';

// setup.ts (registered in vitest.integration.config.ts setupFiles) already:
//   - stubs `server-only` via vi.mock
//   - mocks @/lib/logger
//   - loads .env.test via dotenv config()
// No manual setup needed here.

describe('adapter happy path', () => {
  describe('bags', () => {
    const fixture = getFixture('bags');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });

  describe('pump', () => {
    const fixture = getFixture('pump');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }

      // SC-3: pump must return at least one synthetic vault aggregate token ID
      expect(
        results.some(
          (r) => r.tokenAddress === 'SOL:pump' || r.tokenAddress === 'SOL:pumpswap'
        ),
        'pump: at least one result must have tokenAddress "SOL:pump" or "SOL:pumpswap"'
      ).toBe(true);
    });
  });

  describe('clanker', () => {
    const fixture = getFixture('clanker');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });

  describe('zora', () => {
    const fixture = getFixture('zora');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });

  describe('bankr', () => {
    const fixture = getFixture('bankr');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    }, 30_000); // Bankr is known to be slow; explicit timeout as documentation
  });

  describe('believe', () => {
    const fixture = getFixture('believe');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });

  describe('raydium', () => {
    const fixture = getFixture('raydium');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });

  describe('revshare', () => {
    const fixture = getFixture('revshare');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });

  describe('coinbarrel', () => {
    const fixture = getFixture('coinbarrel');

    it('getHistoricalFees returns non-empty array with valid TokenFee shape', async () => {
      const adapter = getAdapter(fixture.adapterName);
      expect(adapter).not.toBeNull();

      const results = await adapter!.getHistoricalFees(fixture.walletAddress);

      expect(results.length).toBeGreaterThanOrEqual(fixture.expectedMinResultCount);

      for (let i = 0; i < results.length; i++) {
        assertTokenFeeShape(results[i], `${fixture.adapterName}[${i}]`);
      }
    });
  });
});
