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
vi.mock('@/lib/helius/client', () => ({ isHeliusAvailable: () => false }));
vi.mock('@/lib/helius/transactions', () => ({ fetchClaimHistory: async () => [] }));
vi.mock('@/lib/resolve/identity', () => ({
  fetchAllFees: async () => ({ fees: [], syncedPlatforms: new Set<string>() }),
  fetchFeesByHandle: async () => ({ fees: [], syncedPlatforms: new Set<string>() }),
}));

import { findStaleFeeRows } from '@/lib/services/fee-sync';
import type { TokenFee } from '@/lib/platforms/types';

type ExistingRow = {
  platform: string;
  chain: string;
  token_address: string;
};

const fee = (platform: string, chain: string, tokenAddress: string): TokenFee => ({
  platform: platform as TokenFee['platform'],
  chain: chain as TokenFee['chain'],
  tokenAddress,
  tokenSymbol: 'TEST',
  totalEarned: '0',
  totalClaimed: '0',
  totalUnclaimed: '0',
  totalEarnedUsd: null,
  royaltyBps: null,
});

const row = (platform: string, chain: string, tokenAddress: string): ExistingRow => ({
  platform,
  chain,
  token_address: tokenAddress,
});

describe('findStaleFeeRows', () => {
  it('returns rows that exist in DB but not in fresh data for synced platforms', () => {
    const existing = [
      row('bankr', 'base', '0xSTALE1'),
      row('bankr', 'base', '0xSTALE2'),
    ];
    const fresh: TokenFee[] = [];
    const synced = new Set(['bankr']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(2);
    expect(stale.map((r) => r.token_address)).toEqual(['0xSTALE1', '0xSTALE2']);
  });

  it('keeps rows that ARE present in fresh data', () => {
    const existing = [
      row('bankr', 'base', '0xKEEP'),
      row('bankr', 'base', '0xSTALE'),
    ];
    const fresh = [fee('bankr', 'base', '0xKEEP')];
    const synced = new Set(['bankr']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(1);
    expect(stale[0].token_address).toBe('0xSTALE');
  });

  it('does NOT prune rows for platforms not in syncedPlatforms (adapter failed)', () => {
    const existing = [
      row('bankr', 'base', '0xBANKR_STALE'),
      row('clanker', 'base', '0xCLANKER_STALE'),
    ];
    const fresh: TokenFee[] = [];
    // Only bankr synced — clanker adapter must have failed, so leave its rows alone
    const synced = new Set(['bankr']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(1);
    expect(stale[0].platform).toBe('bankr');
  });

  it('NEVER prunes bags rows even when bags is in syncedPlatforms (legacy disappear logic)', () => {
    const existing = [
      row('bags', 'sol', 'BAGS_STALE'),
      row('bankr', 'base', '0xBANKR_STALE'),
    ];
    const fresh: TokenFee[] = [];
    const synced = new Set(['bags', 'bankr']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(1);
    expect(stale[0].platform).toBe('bankr');
  });

  it('returns empty when fresh data covers all existing rows', () => {
    const existing = [
      row('bankr', 'base', '0xA'),
      row('bankr', 'base', '0xB'),
    ];
    const fresh = [fee('bankr', 'base', '0xA'), fee('bankr', 'base', '0xB')];
    const synced = new Set(['bankr']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(0);
  });

  it('returns empty when syncedPlatforms is empty (no adapters succeeded)', () => {
    const existing = [row('bankr', 'base', '0xA')];
    const fresh: TokenFee[] = [];
    const synced = new Set<string>();

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(0);
  });

  it('keys by platform+chain+tokenAddress (same address on different chains is distinct)', () => {
    const existing = [
      row('clanker', 'base', '0xSAME'),
      row('clanker', 'bsc', '0xSAME'),
    ];
    // Fresh only has the base one — bsc is stale
    const fresh = [fee('clanker', 'base', '0xSAME')];
    const synced = new Set(['clanker']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(1);
    expect(stale[0].chain).toBe('bsc');
  });

  it('case-insensitive token address comparison (DB stores checksummed, fresh may not be)', () => {
    const existing = [row('bankr', 'base', '0xAbCdEf0000000000000000000000000000000000')];
    const fresh = [fee('bankr', 'base', '0xabcdef0000000000000000000000000000000000')];
    const synced = new Set(['bankr']);

    const stale = findStaleFeeRows(existing, fresh, synced);

    expect(stale).toHaveLength(0);
  });
});
