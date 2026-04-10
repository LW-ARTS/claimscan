import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { getAdapter } from '@/lib/platforms';

// setup.ts (registered in vitest.integration.config.ts setupFiles) already:
//   - stubs `server-only` via vi.mock
//   - mocks @/lib/logger
//   - loads .env.test via dotenv config()
// No manual setup needed here.

// ═══════════════════════════════════════════════════════════════
// IT-04: Degradation under invalid credentials
//
// Mechanism: vi.stubEnv overrides env vars read at call-time by
// getApiKeys() in bags-api.ts. On 401/403 the fetch wrapper returns
// null; getClaimablePositionsCached falls back to []; getHistoricalFees
// catches and returns []. No throw, no uncaught rejection.
// ═══════════════════════════════════════════════════════════════

describe('adapter degradation (invalid credentials)', () => {
  describe('bags — invalid API key', () => {
    beforeEach(() => {
      // Override both key env vars so no valid key can be sourced.
      // BAGS_API_KEYS is the preferred multi-key var; BAGS_API_KEY is the legacy fallback.
      vi.stubEnv('BAGS_API_KEYS', 'invalid-key-for-testing');
      vi.stubEnv('BAGS_API_KEY', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('getHistoricalFees returns [] without throwing', async () => {
      const adapter = getAdapter('bags');
      expect(adapter).not.toBeNull();

      // Use the well-known fixture wallet so the address passes validation.
      // With an invalid API key, the Bags API should respond 401/403 and the
      // adapter should return [] gracefully.
      const result = await adapter!.getHistoricalFees(
        'BTeqNydtKyDaSxQNRm8ByaUDPK3cpQ1FsXMtaF1Hfaom'
      );

      expect(Array.isArray(result)).toBe(true);
      // Must return empty array (not throw, not return null)
      expect(result).toEqual([]);
    });

    it('getLiveUnclaimedFees returns [] without throwing', async () => {
      const adapter = getAdapter('bags');
      expect(adapter).not.toBeNull();

      const result = await adapter!.getLiveUnclaimedFees(
        'BTeqNydtKyDaSxQNRm8ByaUDPK3cpQ1FsXMtaF1Hfaom'
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// IT-05: Empty result for wallets with no tokens on the platform
//
// Addresses are deterministically inert:
//   - Solana: 11111111111111111111111111111112 (System Program address,
//     valid base58, zero fee history on any launchpad)
//   - EVM: 0x000000000000000000000000000000000000dEaD (canonical burn address,
//     passes isValidEvmAddress, never a creator in any EVM launchpad index)
// ═══════════════════════════════════════════════════════════════

const SOLANA_EMPTY_WALLET = '11111111111111111111111111111112';
const EVM_EMPTY_WALLET = '0x000000000000000000000000000000000000dEaD';

describe('adapter empty wallet (no tokens on platform)', () => {
  describe('bags — Solana wallet with no Bags activity', () => {
    it('getHistoricalFees returns [] without throwing', async () => {
      const adapter = getAdapter('bags');
      expect(adapter).not.toBeNull();

      const result = await adapter!.getHistoricalFees(SOLANA_EMPTY_WALLET);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });

  describe('pump — Solana wallet with no Pump tokens', () => {
    it('getHistoricalFees returns [] without throwing', async () => {
      const adapter = getAdapter('pump');
      expect(adapter).not.toBeNull();

      // Pump adapter validates the address and queries Helius for tokens.
      // The System Program address has no Pump-created tokens, so the result
      // must be an empty array.
      const result = await adapter!.getHistoricalFees(SOLANA_EMPTY_WALLET);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });

  describe('clanker — EVM burn address with no creator tokens', () => {
    it('getHistoricalFees returns [] without throwing', async () => {
      const adapter = getAdapter('clanker');
      expect(adapter).not.toBeNull();

      // Clanker getHistoricalFees calls getCreatorTokens internally.
      // When the API returns no tokens for this address, fetchChainFees
      // receives an empty array and short-circuits to [] immediately.
      const result = await adapter!.getHistoricalFees(EVM_EMPTY_WALLET);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });
});
