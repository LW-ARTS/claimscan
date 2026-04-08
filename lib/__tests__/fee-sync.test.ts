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

import { findStaleFeeRows, pruneStaleFeeRowsForCreator } from '@/lib/services/fee-sync';
import type { TokenFee } from '@/lib/platforms/types';

type ExistingRow = {
  platform: string;
  chain: string;
  token_address: string;
};

// ─── Recorder mock supabase ──────────────────────────────────────────
// Captures every .from('fee_records').select(...).eq(...) and
// .delete().eq(...).in(...) chain so tests can assert what queries
// the helper actually issued. Supports simulated SELECT and DELETE failures.

type SupabaseCall = {
  op: 'select' | 'delete';
  filters: Record<string, unknown>;
  in?: string[];
};

function makeRecorderSupabase(seedRows: ExistingRow[] = []) {
  const calls: SupabaseCall[] = [];
  let selectShouldFail = false;
  let deleteShouldFail = false;

  // The supabase client uses chained builders that resolve only when awaited.
  // We model this with a `chain` object whose .eq() / .in() return itself
  // and whose .then() records the call and resolves with { data, error }.
  const supabase = {
    from(_table: string) {
      return {
        select(_cols: string) {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          };
          chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) => {
            calls.push({ op: 'select', filters: { ...filters } });
            if (selectShouldFail) {
              resolve({ data: null, error: { message: 'simulated select failure' } });
            } else {
              resolve({ data: seedRows, error: null });
            }
          };
          return chain;
        },
        delete() {
          const filters: Record<string, unknown> = {};
          let inValues: string[] | undefined;
          const chain: Record<string, unknown> = {};
          chain.eq = (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          };
          chain.in = (_col: string, vals: string[]) => {
            inValues = vals;
            return chain;
          };
          chain.then = (resolve: (v: { error: unknown }) => void) => {
            calls.push({
              op: 'delete',
              filters: { ...filters },
              in: inValues,
            });
            resolve({ error: deleteShouldFail ? { message: 'simulated delete failure' } : null });
          };
          return chain;
        },
      };
    },
  };

  return {
    supabase: supabase as never,
    calls,
    setSelectFails: (v: boolean) => { selectShouldFail = v; },
    setDeleteFails: (v: boolean) => { deleteShouldFail = v; },
  };
}

function makeMockLogger() {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
    time: async <T,>(_label: string, fn: () => Promise<T>) => fn(),
    traceId: 'test',
  };
  return logger;
}

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

// ─── pruneStaleFeeRowsForCreator integration tests ───────────────────────

describe('pruneStaleFeeRowsForCreator', () => {
  it('returns a discriminated result with deleted, selectFailed, deleteAttempted, deleteFailures', async () => {
    const { supabase } = makeRecorderSupabase([
      { platform: 'bankr', chain: 'base', token_address: '0xSTALE' },
    ]);
    const result = await pruneStaleFeeRowsForCreator(
      'creator-1',
      [], // empty fresh
      new Set(['bankr']),
      supabase,
      makeMockLogger()
    );
    expect(result).toMatchObject({
      deleted: 1,
      selectFailed: false,
      deleteAttempted: 1,
      deleteFailures: 0,
    });
  });

  it('uses batched DELETE with .in() per (platform, chain) group, not row-by-row', async () => {
    const { supabase, calls } = makeRecorderSupabase([
      { platform: 'bankr', chain: 'base', token_address: '0xA' },
      { platform: 'bankr', chain: 'base', token_address: '0xB' },
      { platform: 'clanker', chain: 'base', token_address: '0xC' },
    ]);
    const result = await pruneStaleFeeRowsForCreator(
      'creator-1',
      [],
      new Set(['bankr', 'clanker']),
      supabase,
      makeMockLogger()
    );

    // 1 SELECT + 2 DELETE batches (one per (platform, chain) group)
    const deleteCalls = calls.filter((c) => c.op === 'delete');
    expect(deleteCalls).toHaveLength(2);
    // Bankr batch contains both 0xA and 0xB
    const bankrBatch = deleteCalls.find((c) => c.filters.platform === 'bankr');
    expect(bankrBatch?.in).toEqual(['0xA', '0xB']);
    // Clanker batch contains only 0xC
    const clankerBatch = deleteCalls.find((c) => c.filters.platform === 'clanker');
    expect(clankerBatch?.in).toEqual(['0xC']);

    expect(result.deleted).toBe(3);
    expect(result.deleteAttempted).toBe(3);
  });

  it('returns selectFailed=true and skips prune when SELECT fails', async () => {
    const recorder = makeRecorderSupabase([
      { platform: 'bankr', chain: 'base', token_address: '0xSTALE' },
    ]);
    recorder.setSelectFails(true);

    const result = await pruneStaleFeeRowsForCreator(
      'creator-1',
      [],
      new Set(['bankr']),
      recorder.supabase,
      makeMockLogger()
    );

    expect(result).toEqual({
      deleted: 0,
      selectFailed: true,
      deleteAttempted: 0,
      deleteFailures: 0,
    });
    // No DELETE was attempted
    expect(recorder.calls.filter((c) => c.op === 'delete')).toHaveLength(0);
  });

  it('reports deleteFailures when batch DELETE returns an error', async () => {
    const recorder = makeRecorderSupabase([
      { platform: 'bankr', chain: 'base', token_address: '0xA' },
      { platform: 'bankr', chain: 'base', token_address: '0xB' },
    ]);
    recorder.setDeleteFails(true);

    const result = await pruneStaleFeeRowsForCreator(
      'creator-1',
      [],
      new Set(['bankr']),
      recorder.supabase,
      makeMockLogger()
    );

    expect(result).toEqual({
      deleted: 0,
      selectFailed: false,
      deleteAttempted: 2,
      deleteFailures: 2,
    });
  });

  it('logs warn tripwire when syncedPlatforms is empty but rows exist', async () => {
    const log = makeMockLogger();
    const { supabase } = makeRecorderSupabase([
      { platform: 'bankr', chain: 'base', token_address: '0xLEFTOVER' },
    ]);

    const result = await pruneStaleFeeRowsForCreator(
      'creator-1',
      [],
      new Set(), // empty, refactor bug simulation
      supabase,
      log
    );

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('empty syncedPlatforms but rows exist'),
      expect.objectContaining({ creatorId: 'creator-1', existingCount: 1 })
    );
    expect(result).toEqual({ deleted: 0, selectFailed: false, deleteAttempted: 0, deleteFailures: 0 });
  });

  it('does NOT log tripwire when syncedPlatforms is empty AND no rows exist', async () => {
    const log = makeMockLogger();
    const { supabase } = makeRecorderSupabase([]); // no rows

    await pruneStaleFeeRowsForCreator('creator-1', [], new Set(), supabase, log);

    expect(log.warn).not.toHaveBeenCalled();
  });
});
