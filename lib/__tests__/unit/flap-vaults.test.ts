import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// server-only is a Next.js build-time marker; mock it so Node's vitest runner
// can import modules with `import 'server-only'` (same pattern used across
// flaunch-client, fee-math, distributed-lock unit tests).
vi.mock('server-only', () => ({}));

// Hoisted mocks — use vi.hoisted so the fn refs are initialized before the
// vi.mock factories run (vi.mock is hoisted to the top of the file).
const { readContractMock, captureMessageMock, getCodeMock, callMock } = vi.hoisted(() => ({
  readContractMock: vi.fn(),
  captureMessageMock: vi.fn(),
  getCodeMock: vi.fn(),
  callMock: vi.fn(),
}));

vi.mock('@/lib/chains/bsc', () => ({
  bscClient: {
    readContract: readContractMock,
    getCode: getCodeMock,
    call: callMock,
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
import {
  resolveVaultKind,
  resolveHandler,
} from '@/lib/platforms/flap-vaults';
import { baseV1Handler } from '@/lib/platforms/flap-vaults/base-v1';
import { baseV2Handler } from '@/lib/platforms/flap-vaults/base-v2';
import { unknownHandler } from '@/lib/platforms/flap-vaults/unknown';
import { splitVaultHandler } from '@/lib/platforms/flap-vaults/split-vault';
import { detectFundRecipient } from '@/lib/platforms/flap-vaults';

// Stable test fixtures — addresses from RESEARCH.md §Fixture Wallet but
// treated as opaque since bscClient is mocked.
const VAULT_PORTAL = asBscAddress('0x90497450f2a706f1951b5bdda52B4E5d16f34C06');
const TAX_TOKEN = asBscAddress('0x7372bf3b8744e6eE9eeB8C1613C4Ac4aa4f67777');
const VAULT_ADDRESS = asBscAddress('0x321354E6F01E765F220Eb275f315d1d79EE24a33');
const USER = asBscAddress('0x685B23F8f932a6238b45f516c27a43840beC0Ef0');

describe('FP-04: resolveHandler — string-lookup dispatch', () => {
  it('returns baseV1Handler for "base-v1"', () => {
    expect(resolveHandler('base-v1')).toBe(baseV1Handler);
  });

  it('returns baseV2Handler for "base-v2"', () => {
    expect(resolveHandler('base-v2')).toBe(baseV2Handler);
  });

  it('returns unknownHandler for "unknown"', () => {
    expect(resolveHandler('unknown')).toBe(unknownHandler);
  });

  it('returns unknownHandler for any unrecognized string (??  default)', () => {
    expect(resolveHandler('bogus-string')).toBe(unknownHandler);
    expect(resolveHandler('')).toBe(unknownHandler);
    expect(resolveHandler('base-v3')).toBe(unknownHandler);
  });

  it('returns splitVaultHandler for "split-vault"', () => {
    expect(resolveHandler('split-vault')).toBe(splitVaultHandler);
  });
});

describe('FP-04: resolveVaultKind — classification strategy', () => {
  beforeEach(() => {
    readContractMock.mockReset();
    captureMessageMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('primary (getVaultCategory) reverts, vaultUISchema probe hits → base-v2 (fallback)', async () => {
    // VAULT_CATEGORY_MAP maps 0→unknown and 1→unknown, so resolving v1/v2
    // always flows through the method-probe fallback today. Simulate the
    // primary reverting and the V2 probe succeeding.
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'getVaultCategory') {
        throw new Error('primary revert');
      }
      if (args.functionName === 'vaultUISchema') {
        return '{}';
      }
      throw new Error('unexpected call');
    });

    const kind = await resolveVaultKind(VAULT_PORTAL, TAX_TOKEN, VAULT_ADDRESS);
    expect(kind).toBe('base-v2');
  });

  it('primary reverts, V2 probe reverts, V1 claimable(0x0) hits → base-v1 (fallback)', async () => {
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'getVaultCategory') {
        throw new Error('primary revert');
      }
      if (args.functionName === 'vaultUISchema') {
        throw new Error('v2 probe revert');
      }
      if (args.functionName === 'claimable') {
        return 0n;
      }
      throw new Error('unexpected call');
    });

    const kind = await resolveVaultKind(VAULT_PORTAL, TAX_TOKEN, VAULT_ADDRESS);
    expect(kind).toBe('base-v1');
  });

  it('primary returns mapped unknown, all probes revert → unknown', async () => {
    // getVaultCategory returns 0 (NONE) → maps to 'unknown' in VAULT_CATEGORY_MAP,
    // so we fall through to probes, which all revert.
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'getVaultCategory') {
        return 0;
      }
      throw new Error('probe revert');
    });

    const kind = await resolveVaultKind(VAULT_PORTAL, TAX_TOKEN, VAULT_ADDRESS);
    expect(kind).toBe('unknown');
  });

  it('all classifiers fail (primary throws, probes throw) → unknown terminal', async () => {
    readContractMock.mockImplementation(async () => {
      throw new Error('blanket revert');
    });

    const kind = await resolveVaultKind(VAULT_PORTAL, TAX_TOKEN, VAULT_ADDRESS);
    expect(kind).toBe('unknown');
  });

  it('primary reverts, V2 reverts, V1 reverts, SplitVault userBalances(0x0) hits -> split-vault', async () => {
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'getVaultCategory') throw new Error('primary revert');
      if (args.functionName === 'vaultUISchema') throw new Error('v2 probe revert');
      if (args.functionName === 'claimable') throw new Error('v1 probe revert');
      if (args.functionName === 'userBalances') return [0n, 0n] as readonly [bigint, bigint];
      throw new Error('unexpected call');
    });

    const kind = await resolveVaultKind(VAULT_PORTAL, TAX_TOKEN, VAULT_ADDRESS);
    expect(kind).toBe('split-vault');
  });
});

describe('FP-04: unknownHandler — D-16 Sentry warning', () => {
  beforeEach(() => {
    captureMessageMock.mockReset();
  });

  it('readClaimable returns 0n AND fires Sentry.captureMessage with fingerprint', async () => {
    const result = await unknownHandler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(0n);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, options] = captureMessageMock.mock.calls[0];
    expect(msg).toBe('Flap unknown vault detected');
    expect(options).toMatchObject({
      level: 'warning',
      fingerprint: ['flap-unknown-vault', VAULT_ADDRESS],
      extra: {
        vault: VAULT_ADDRESS,
      },
    });
  });
});

describe('FP-04: baseV1Handler + baseV2Handler — delegate to bscClient.readContract', () => {
  beforeEach(() => {
    readContractMock.mockReset();
  });

  it('baseV1 readClaimable returns the uint256 from bscClient.readContract', async () => {
    readContractMock.mockResolvedValueOnce(123_456_789n);
    const result = await baseV1Handler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(123_456_789n);

    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT_ADDRESS,
        functionName: 'claimable',
        args: [USER],
      }),
    );
  });

  it('baseV2 readClaimable returns the uint256 from bscClient.readContract', async () => {
    readContractMock.mockResolvedValueOnce(987_654_321n);
    const result = await baseV2Handler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(987_654_321n);

    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT_ADDRESS,
        functionName: 'claimable',
        args: [USER],
      }),
    );
  });

  it('baseV1 readClaimable returns 0n and logs on RPC error (does not throw)', async () => {
    readContractMock.mockRejectedValueOnce(new Error('rpc down'));
    const result = await baseV1Handler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(0n);
  });

  it('baseV2 readClaimable returns 0n and logs on RPC error (does not throw)', async () => {
    readContractMock.mockRejectedValueOnce(new Error('rpc down'));
    const result = await baseV2Handler.readClaimable(VAULT_ADDRESS, USER);
    expect(result).toBe(0n);
  });
});

describe('FR-01: detectFundRecipient — token-level fund-recipient probe', () => {
  const TOKEN = asBscAddress('0x5f28b56a2f6e396a69fc912aec8d42d8afa17777');
  const TAX_PROCESSOR = asBscAddress('0xf9113d169a093E174b29776049638A6684F2C9a7');
  const RECIPIENT = asBscAddress('0xe4cC6a1fa41e48BB968E0Dd29Df09092b25A4457');

  // tryGetVault(taxToken) eth_call response layout:
  //   0..32  bool found, 32..64 struct offset, 64..96 vault address slot
  // We use callMock to control lookupVaultAddress's branch.
  const FOUND_FALSE_RESPONSE = {
    data: ('0x' + '0'.repeat(64) + '0'.repeat(64) + '0'.repeat(64)) as `0x${string}`,
  };
  const FOUND_TRUE_WITH_VAULT = {
    data: ('0x' + '0'.repeat(63) + '1' + '0'.repeat(64) + '0'.repeat(24) + '321354e6f01e765f220eb275f315d1d79ee24a33') as `0x${string}`,
  };

  beforeEach(() => {
    readContractMock.mockReset();
    getCodeMock.mockReset();
    callMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lookupVaultAddress returns a vault → matched=false (vault-having branch)', async () => {
    callMock.mockResolvedValueOnce(FOUND_TRUE_WITH_VAULT);
    const fr = await detectFundRecipient(TOKEN);
    expect(fr.matched).toBe(false);
  });

  it('lookupVaultAddress null + taxProcessor reverts → matched=false', async () => {
    callMock.mockResolvedValueOnce(FOUND_FALSE_RESPONSE);
    readContractMock.mockImplementationOnce(async () => { throw new Error('taxProcessor revert'); });
    const fr = await detectFundRecipient(TOKEN);
    expect(fr.matched).toBe(false);
  });

  it('lookupVaultAddress null + taxProcessor ok + marketAddress reverts → matched=false', async () => {
    callMock.mockResolvedValueOnce(FOUND_FALSE_RESPONSE);
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'taxProcessor') return TAX_PROCESSOR;
      if (args.functionName === 'marketAddress') throw new Error('marketAddress revert');
      throw new Error('unexpected call');
    });
    const fr = await detectFundRecipient(TOKEN);
    expect(fr.matched).toBe(false);
  });

  it('lookupVaultAddress null + all probes ok + getCode returns non-empty bytecode → matched=false (contract, not EOA)', async () => {
    callMock.mockResolvedValueOnce(FOUND_FALSE_RESPONSE);
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'taxProcessor') return TAX_PROCESSOR;
      if (args.functionName === 'marketAddress') return RECIPIENT;
      throw new Error('unexpected call');
    });
    getCodeMock.mockResolvedValueOnce('0x6080604052' as `0x${string}`);
    const fr = await detectFundRecipient(TOKEN);
    expect(fr.matched).toBe(false);
  });

  it('lookupVaultAddress null + all probes ok + getCode === 0x (EOA) → matched=true with addresses', async () => {
    callMock.mockResolvedValueOnce(FOUND_FALSE_RESPONSE);
    readContractMock.mockImplementation(async (args: { functionName: string }) => {
      if (args.functionName === 'taxProcessor') return TAX_PROCESSOR;
      if (args.functionName === 'marketAddress') return RECIPIENT;
      throw new Error('unexpected call');
    });
    getCodeMock.mockResolvedValueOnce('0x' as `0x${string}`);
    const fr = await detectFundRecipient(TOKEN);
    expect(fr.matched).toBe(true);
    expect(fr.taxProcessor!.toLowerCase()).toBe(TAX_PROCESSOR.toLowerCase());
    expect(fr.marketAddress!.toLowerCase()).toBe(RECIPIENT.toLowerCase());
  });
});
