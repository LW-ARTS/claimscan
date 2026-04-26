import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    time: async (_label: string, fn: () => Promise<unknown>) => fn(),
  }),
}));
vi.mock('@/lib/chains/solana', () => ({
  isValidSolanaAddress: (_a: string) => true,
}));
vi.mock('@/lib/prices', () => ({
  getNativeTokenPrices: async () => ({ sol: 86.74, eth: 2360, bnb: 633 }),
}));
vi.mock('@/lib/platforms/solana-metadata', () => ({
  enrichSolanaTokenSymbols: async <T>(fees: T[]) => fees,
}));
vi.mock('@/lib/platforms/bags-api', () => ({
  bagsFetch: async () => null,
  getClaimablePositionsCached: async () => [],
}));

import { __positionToFee } from '@/lib/platforms/bags';

// Real position payloads captured from production Bags API for wallet
// CZkrgZx9AghXLkvLmGzH8VnvdxvjQAPmBS9CS3hpEwUy (handle "rebeccaperrotto").
// 2026-04-26 — see investigation notes for the rebeccaperrotto missing-coin bug.

const newSchemaMigrated = {
  baseMint: '4UeLCRqARmfb6e6KQijtiktqqXUxbfk6jZng7DhuBAGS',
  isCustomFeeVault: true,
  isMigrated: true,
  totalClaimableLamportsUserShare: '201957356787',
  claimableDisplayAmount: 201.957356787,
  customFeeVaultBalance: 0,
  dammPoolClaimableAmount: 201.957356787,
  virtualPoolClaimableAmount: 0,
  customFeeVaultBps: 10000,
};

const newSchemaUnmigrated = {
  baseMint: 'EpgwwTe9LZi96BMYYLdZrN5qEFNMjxJXHc3SWVPgBAGS',
  isCustomFeeVault: true,
  isMigrated: false,
  totalClaimableLamportsUserShare: 485580206,
  claimableDisplayAmount: 0.485580206,
  customFeeVaultBalance: 0,
  virtualPoolClaimableAmount: 0.485580206,
  customFeeVaultBps: 10000,
};

const legacyPartiallyClaimed = {
  baseMint: '7268DY2AYiTQ8x5vg6C3sZo4ci556euKz3AJtY47BAGS',
  isCustomFeeVault: true,
  isMigrated: false,
  totalClaimableLamportsUserShare: '3044200000',
  virtualPoolClaimableLamportsUserShare: 1300906965,
  userVaultClaimableLamportsUserShare: 0,
};

const legacyFullyEarned = {
  baseMint: 'CdKuZVXCJ2phYmMKmxUKd5koFo7aSFSAFHp7A1G1BAGS',
  isCustomFeeVault: true,
  isMigrated: false,
  totalClaimableLamportsUserShare: '727300000',
  virtualPoolClaimableLamportsUserShare: 16784707,
  userVaultClaimableLamportsUserShare: 0,
};

describe('positionToFee — Bags adapter schema handling', () => {
  describe('NEW custom-fee-vault schema', () => {
    it('reads unclaimed from claimableDisplayAmount when lamport fields are absent', () => {
      const fee = __positionToFee(newSchemaMigrated);
      expect(fee).not.toBeNull();
      expect(fee!.tokenAddress).toBe('4UeLCRqARmfb6e6KQijtiktqqXUxbfk6jZng7DhuBAGS');
      expect(fee!.totalEarned).toBe('201957356787');
      // claimableDisplayAmount 201.957356787 → Math.round(* 1e9) recovers the exact lamports.
      expect(fee!.totalUnclaimed).toBe('201957356787');
      // No claimed history available from the API in new schema; DB preservation handles it.
      expect(fee!.totalClaimed).toBe('0');
    });

    it('handles non-migrated new-schema position (virtualPoolClaimableAmount mirrors claimableDisplayAmount)', () => {
      const fee = __positionToFee(newSchemaUnmigrated);
      expect(fee).not.toBeNull();
      expect(fee!.totalUnclaimed).toBe('485580206');
      expect(fee!.totalEarned).toBe('485580206');
    });

    it('treats absent claimableDisplayAmount as zero unclaimed (defensive)', () => {
      const stripped = { ...newSchemaMigrated };
      delete (stripped as { claimableDisplayAmount?: unknown }).claimableDisplayAmount;
      const fee = __positionToFee(stripped);
      expect(fee).not.toBeNull();
      // earned still reads from totalClaimable, but unclaimed defaults to 0
      expect(fee!.totalUnclaimed).toBe('0');
      expect(fee!.totalClaimed).toBe('201957356787');
    });
  });

  describe('LEGACY schema (pre custom-fee-vault migration)', () => {
    it('sums the three pool lamport fields for unclaimed', () => {
      const fee = __positionToFee(legacyPartiallyClaimed);
      expect(fee).not.toBeNull();
      expect(fee!.totalEarned).toBe('3044200000');
      expect(fee!.totalUnclaimed).toBe('1300906965');
      expect(fee!.totalClaimed).toBe(String(3044200000n - 1300906965n));
    });

    it('still works when only one of the three lamport fields is set', () => {
      const fee = __positionToFee(legacyFullyEarned);
      expect(fee).not.toBeNull();
      expect(fee!.totalUnclaimed).toBe('16784707');
    });

    it('ignores claimableDisplayAmount when lamport fields are present (legacy precedence)', () => {
      const hybrid = {
        ...legacyPartiallyClaimed,
        // Hypothetically present but should not be consulted.
        claimableDisplayAmount: 9.999,
      };
      const fee = __positionToFee(hybrid);
      expect(fee!.totalUnclaimed).toBe('1300906965');
    });
  });

  describe('dust filter', () => {
    it('drops new-schema positions below dust threshold when claimed === 0', () => {
      // 0.02 SOL @ $86.74 ≈ $1.73, well under $15 minimum.
      const dustNewSchema = {
        baseMint: '9jXxm4bf5ujM1iCgGCrgnu3AaYF3eJRhF2f89yHaBAGS',
        isCustomFeeVault: true,
        isMigrated: false,
        totalClaimableLamportsUserShare: 19752803,
        claimableDisplayAmount: 0.019752803,
      };
      const dustLamports = BigInt(Math.floor((15 / 86.74) * 1e9));
      const fee = __positionToFee(dustNewSchema, dustLamports);
      expect(fee).toBeNull();
    });

    it('keeps positions above dust threshold even with claimed === 0', () => {
      const dustLamports = BigInt(Math.floor((15 / 86.74) * 1e9));
      const fee = __positionToFee(newSchemaMigrated, dustLamports);
      expect(fee).not.toBeNull();
    });
  });

  describe('invariants', () => {
    it('returns null when baseMint is missing', () => {
      const fee = __positionToFee({ ...newSchemaMigrated, baseMint: '' });
      expect(fee).toBeNull();
    });

    it('returns null when earned is zero', () => {
      const fee = __positionToFee({
        ...newSchemaMigrated,
        totalClaimableLamportsUserShare: '0',
      });
      expect(fee).toBeNull();
    });

    it('clamps unclaimed to earned to preserve earned >= unclaimed invariant', () => {
      // Construct a pathological new-schema row where claimableDisplayAmount overshoots
      // totalClaimable (could happen during float rounding or stale cache races).
      const overshoot = {
        ...newSchemaMigrated,
        totalClaimableLamportsUserShare: '100000000000', // 100 SOL
        claimableDisplayAmount: 200, // 200 SOL → would become 200 * 1e9 lamports
      };
      const fee = __positionToFee(overshoot);
      expect(fee!.totalEarned).toBe('100000000000');
      expect(fee!.totalUnclaimed).toBe('100000000000');
      expect(fee!.totalClaimed).toBe('0');
    });
  });
});
