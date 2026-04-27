import { describe, it, expect, beforeEach, vi } from 'vitest';

// server-only is a Next.js build-time marker; mock it so Node's vitest runner
// can import the adapter without crashing (same pattern used across fee-math,
// distributed-lock, fee-sync, claim-hmac unit tests).
vi.mock('server-only', () => ({}));

// vi.hoisted() runs before vi.mock() hoisting, making these variables safe to
// reference inside vi.mock() factory functions.
const { mockOr, mockEq, mockSelect, mockFrom, mockReadClaimable, mockReadCumulative } = vi.hoisted(() => {
  const mockOr = vi.fn();
  const mockEq = vi.fn();
  const mockSelect = vi.fn(() => ({ or: mockOr, eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  const mockReadClaimable = vi.fn();
  const mockReadCumulative = vi.fn();
  return { mockOr, mockEq, mockSelect, mockFrom, mockReadClaimable, mockReadCumulative };
});

// Mock the supabase service client — adapter reads flap_tokens rows from Supabase.
// Phase 13: adapter uses .or() dual-axis clause instead of .eq('creator', lower).
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

// Mock the vault handler registry — we only need to verify dispatch happens,
// not that the real handler correctly reads onchain. Each test provides its
// own readClaimable implementation.
// Phase 13: also mock fundRecipientHandler for the fund-recipient dispatch path.
vi.mock('@/lib/platforms/flap-vaults', () => ({
  resolveHandler: (vaultType: string) => ({
    kind: vaultType,
    readClaimable: mockReadClaimable,
  }),
  fundRecipientHandler: {
    kind: 'fund-recipient',
    readCumulative: mockReadCumulative,
  },
}));

// asBscAddress calls getAddress() via viem which does EIP-55 checksum — we
// mock to the identity branded-cast so tests don't need full viem init. The
// adapter only uses the branded address to pass to readClaimable (mocked).
vi.mock('@/lib/chains/types', () => ({
  asBscAddress: (addr: string) => addr as `0x${string}`,
  asBaseAddress: (addr: string) => addr as `0x${string}`,
}));

// bscClient is imported by flap.ts for ERC20 symbol reads — mock readContract.
const { mockBscReadContract } = vi.hoisted(() => ({
  mockBscReadContract: vi.fn().mockResolvedValue('SYMBOL'),
}));
vi.mock('@/lib/chains/bsc', () => ({
  bscClient: { readContract: mockBscReadContract },
}));

// Silence logger output in tests — still verifies the module loads.
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    time: async <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

import { flapAdapter } from '@/lib/platforms/flap';

const WALLET = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
const TOKEN_A = '0x1111111111111111111111111111111111111111';
const TOKEN_B = '0x2222222222222222222222222222222222222222';
const VAULT_A = '0xaaaa000000000000000000000000000000000001';
const VAULT_B = '0xbbbb000000000000000000000000000000000002';

describe('FP-06: flap adapter', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockOr.mockClear();
    mockEq.mockClear();
    mockReadClaimable.mockReset();
    mockReadCumulative.mockReset();
  });

  it('reads flap_tokens filtered by creator (lowercase) via OR clause', async () => {
    mockOr.mockResolvedValueOnce({ data: [], error: null });
    await flapAdapter.getHistoricalFees(WALLET);

    expect(mockFrom).toHaveBeenCalledWith('flap_tokens');
    // Phase 13: adapter uses .or() dual-axis clause instead of .eq('creator', lower).
    expect(mockOr).toHaveBeenCalledTimes(1);
    const orClause = (mockOr.mock.calls[0]?.[0] ?? '') as string;
    // Must include creator.eq.<lowercased wallet> and recipient_address.eq.<lowercased wallet>.
    const lower = WALLET.toLowerCase();
    expect(orClause).toContain(`creator.eq.${lower}`);
    expect(orClause).toContain(`recipient_address.eq.${lower}`);
    // Confirm lowercase normalization (no uppercase chars leaked through).
    expect(orClause).toBe(orClause.toLowerCase());
  });

  it('dispatches to resolveHandler(row.vault_type) per token', async () => {
    // Phase 13: mock data includes new columns; vault-having rows use non-fund-recipient types.
    mockOr.mockResolvedValueOnce({
      data: [
        {
          token_address: TOKEN_A,
          creator: WALLET.toLowerCase(),
          vault_address: VAULT_A,
          vault_type: 'base-v1',
          decimals: 18,
          source: 'native_indexer',
          created_block: 40_000_000,
          recipient_address: null,
          tax_processor_address: null,
        },
        {
          token_address: TOKEN_B,
          creator: WALLET.toLowerCase(),
          vault_address: VAULT_B,
          vault_type: 'base-v2',
          decimals: 18,
          source: 'native_indexer',
          created_block: 40_000_001,
          recipient_address: null,
          tax_processor_address: null,
        },
      ],
      error: null,
    });
    mockReadClaimable.mockResolvedValue(1_000n);

    const fees = await flapAdapter.getHistoricalFees(WALLET);

    // One call per vault-having row, receiving the (vault, user) branded pair.
    expect(mockReadClaimable).toHaveBeenCalledTimes(2);
    expect(mockReadClaimable.mock.calls[0]?.[0]).toBe(VAULT_A);
    expect(mockReadClaimable.mock.calls[0]?.[1]).toBe(WALLET);
    expect(mockReadClaimable.mock.calls[1]?.[0]).toBe(VAULT_B);
    expect(mockReadClaimable.mock.calls[1]?.[1]).toBe(WALLET);
    // Two non-zero rows -> two fees emitted.
    expect(fees).toHaveLength(2);
  });

  it('filters rows where claimable === 0n (D-12)', async () => {
    mockOr.mockResolvedValueOnce({
      data: [
        {
          token_address: TOKEN_A,
          creator: WALLET.toLowerCase(),
          vault_address: VAULT_A,
          vault_type: 'base-v1',
          decimals: 18,
          source: 'native_indexer',
          created_block: 40_000_000,
          recipient_address: null,
          tax_processor_address: null,
        },
        {
          token_address: TOKEN_B,
          creator: WALLET.toLowerCase(),
          vault_address: VAULT_B,
          vault_type: 'base-v2',
          decimals: 18,
          source: 'native_indexer',
          created_block: 40_000_001,
          recipient_address: null,
          tax_processor_address: null,
        },
      ],
      error: null,
    });
    // First row = zero balance (skipped), second row = non-zero (emitted).
    mockReadClaimable.mockResolvedValueOnce(0n).mockResolvedValueOnce(5_000n);

    const fees = await flapAdapter.getHistoricalFees(WALLET);

    expect(fees).toHaveLength(1);
    expect(fees[0]?.tokenAddress).toBe(TOKEN_B);
    expect(fees[0]?.totalUnclaimed).toBe('5000');
  });

  it('emits TokenFee with vaultType matching flap_tokens.vault_type', async () => {
    mockOr.mockResolvedValueOnce({
      data: [
        {
          token_address: TOKEN_A,
          creator: WALLET.toLowerCase(),
          vault_address: VAULT_A,
          vault_type: 'unknown',
          decimals: 18,
          source: 'native_indexer',
          created_block: 40_000_000,
          recipient_address: null,
          tax_processor_address: null,
        },
      ],
      error: null,
    });
    mockReadClaimable.mockResolvedValueOnce(42n);

    const fees = await flapAdapter.getHistoricalFees(WALLET);

    expect(fees).toHaveLength(1);
    expect(fees[0]?.vaultType).toBe('unknown');
    expect(fees[0]?.platform).toBe('flap');
    expect(fees[0]?.chain).toBe('bsc');
    expect(fees[0]?.totalEarnedUsd).toBeNull(); // D-11
    expect(fees[0]?.totalClaimed).toBe('0');    // v1 scope
  });
});

