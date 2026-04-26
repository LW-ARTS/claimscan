import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// server-only is a Next.js build-time marker; mock it so Node's vitest runner
// can import modules with `import 'server-only'` (same pattern used across
// flaunch-client, fee-math, distributed-lock unit tests).
vi.mock('server-only', () => ({}));

// Hoisted mocks — use vi.hoisted so the fn refs are initialized before the
// vi.mock factories run (vi.mock is hoisted to the top of the file).
const { readContractMock, captureMessageMock } = vi.hoisted(() => ({
  readContractMock: vi.fn(),
  captureMessageMock: vi.fn(),
}));

vi.mock('@/lib/chains/bsc', () => ({
  bscClient: {
    readContract: readContractMock,
  },
}));

// Mock all Sentry surfaces the logger touches (addBreadcrumb on warn/error,
// captureException on error, captureMessage is both what we assert and what
// logger.ts emits on error-level with non-Error payload).
vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

import { asBscAddress } from '@/lib/chains/types';
import { splitVaultHandler } from '@/lib/platforms/flap-vaults/split-vault';

// Stable test fixtures — addresses from RESEARCH.md fixtures, treated as opaque
// since bscClient is mocked.
const VAULT_ADDRESS = asBscAddress('0x321354E6F01E765F220Eb275f315d1d79EE24a33');
const USER = asBscAddress('0x685B23F8f932a6238b45f516c27a43840beC0Ef0');

describe('SV-02: splitVaultHandler — userBalances tuple decode + invariant guard', () => {
  beforeEach(() => {
    readContractMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('readClaimable returns accumulated - claimed when accumulated > claimed (mock [1000n, 300n] -> 700n)', async () => {
    readContractMock.mockResolvedValueOnce([1000n, 300n] as readonly [bigint, bigint]);
    const result = await splitVaultHandler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(700n);

    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT_ADDRESS,
        functionName: 'userBalances',
        args: [USER],
      }),
    );
  });

  it('readClaimable returns 0n when accumulated == claimed (steady-state, dispatched)', async () => {
    // Test both [123n, 123n] (post-claim) and [0n, 0n] (never credited)
    readContractMock.mockResolvedValueOnce([123n, 123n] as readonly [bigint, bigint]);
    expect(await splitVaultHandler.readClaimable(VAULT_ADDRESS, USER)).toBe(0n);

    readContractMock.mockResolvedValueOnce([0n, 0n] as readonly [bigint, bigint]);
    expect(await splitVaultHandler.readClaimable(VAULT_ADDRESS, USER)).toBe(0n);
  });

  it('readClaimable returns 0n on bscClient.readContract rejection (does not throw)', async () => {
    readContractMock.mockRejectedValueOnce(new Error('rpc down'));
    const result = await splitVaultHandler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(0n);
  });
});
