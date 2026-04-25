import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Hoisted mocks for bsc client surfaces — vi.hoisted ensures the fn refs
// are initialized before vi.mock factories run (vi.mock is hoisted).
const { multicallMock, getLogsMock } = vi.hoisted(() => ({
  multicallMock: vi.fn(),
  getLogsMock: vi.fn(),
}));

// scanTokenCreated uses bscLogsClient (public BSC RPCs, 50K block range cap).
// batchVaultClaimable / batchReadDecimals use bscClient.multicall (Alchemy).
vi.mock('@/lib/chains/bsc', () => ({
  bscClient: { multicall: multicallMock },
  bscLogsClient: { getLogs: getLogsMock },
}));

// Logger uses Sentry surfaces for warn-level events; mock to silence.
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

import { asBscAddress } from '@/lib/chains/types';
import {
  FLAP_TOKEN_CREATED_EVENT,
  scanTokenCreated,
  batchVaultClaimable,
  assertDeployBlockNotPlaceholder,
} from '@/lib/chains/flap-reads';

const PORTAL = asBscAddress('0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0');
const SPOOF = asBscAddress('0x0000000000000000000000000000000000000bAd');
const VAULT_A = asBscAddress('0x1111111111111111111111111111111111111111');
const VAULT_B = asBscAddress('0x2222222222222222222222222222222222222222');
const VAULT_C = asBscAddress('0x3333333333333333333333333333333333333333');
const USER = asBscAddress('0x685B23F8f932a6238b45f516c27a43840beC0Ef0');

const VAULT_CLAIMABLE_ABI = [
  {
    type: 'function',
    name: 'claimable',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

describe('FP-03: flap-reads event decoder', () => {
  beforeEach(() => {
    multicallMock.mockReset();
    getLogsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('decodes TokenCreated with all 7 non-indexed fields', () => {
    // ABI shape — parseAbiItem returns { name, type, inputs }
    expect(FLAP_TOKEN_CREATED_EVENT.name).toBe('TokenCreated');
    expect(FLAP_TOKEN_CREATED_EVENT.type).toBe('event');

    const inputs = FLAP_TOKEN_CREATED_EVENT.inputs;
    expect(inputs).toHaveLength(7);

    // Field order MUST match the verified Portal impl (RESEARCH.md):
    //   (uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)
    expect(inputs.map((i) => i.name)).toEqual([
      'ts',
      'creator',
      'nonce',
      'token',
      'name',
      'symbol',
      'meta',
    ]);
    expect(inputs.map((i) => i.type)).toEqual([
      'uint256',
      'address',
      'uint256',
      'address',
      'string',
      'string',
      'string',
    ]);

    // CRITICAL: ZERO indexed parameters. log.address is the ONLY spoof
    // defense — see scanTokenCreated belt-and-suspenders check.
    expect(
      inputs.every((i) => !(i as { indexed?: boolean }).indexed),
    ).toBe(true);
  });

  it('rejects spoofed TokenCreated log whose address !== FLAP_PORTAL', async () => {
    // Forge a log: correct topic0/event shape but emitted by attacker contract.
    // Without the post-decode address check, this row would seed garbage into
    // flap_tokens. The throw blocks the entire batch (fail-closed).
    getLogsMock.mockResolvedValueOnce([
      {
        address: SPOOF,
        args: {
          ts: 1n,
          creator: USER,
          nonce: 0n,
          token: VAULT_A,
          name: 'fake',
          symbol: 'FAKE',
          meta: '',
        },
        blockNumber: 100n,
        transactionHash: '0xdeadbeef' as `0x${string}`,
      },
    ]);

    await expect(
      scanTokenCreated({ portal: PORTAL, fromBlock: 0n, toBlock: 200n }),
    ).rejects.toThrow(/Spoofed/);
  });

  it('batchVaultClaimable degrades individual vault failures to null via allowFailure', async () => {
    // Mixed batch — middle entry reverts. The whole batch should NOT tank.
    multicallMock.mockResolvedValueOnce([
      { status: 'success', result: 1_000n },
      { status: 'failure', error: { message: 'revert: reentrancy' } },
      { status: 'success', result: 500n },
    ]);

    const result = await batchVaultClaimable([
      { vault: VAULT_A, user: USER, abi: VAULT_CLAIMABLE_ABI },
      { vault: VAULT_B, user: USER, abi: VAULT_CLAIMABLE_ABI },
      { vault: VAULT_C, user: USER, abi: VAULT_CLAIMABLE_ABI },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ status: 'success', result: 1_000n });
    expect(result[1].status).toBe('failure');
    expect(result[2]).toEqual({ status: 'success', result: 500n });

    // D-15: allowFailure: true is mandatory so a single bad vault doesn't
    // tank the entire cron pass.
    expect(multicallMock).toHaveBeenCalledWith(
      expect.objectContaining({ allowFailure: true }),
    );
  });

  it('runtime guard throws when FLAP_PORTAL_DEPLOY_BLOCK === 0n', async () => {
    // Real production state: const is 39_980_228n → guard does NOT throw.
    expect(() => assertDeployBlockNotPlaceholder()).not.toThrow();

    // Forced placeholder state via module re-mock + dynamic import. This
    // exercises the dead-code-elimination-resistant pattern (the function
    // re-reads the import binding at call time so a future regression that
    // resets the constant to 0n WILL surface here, not silently pass).
    vi.resetModules();
    vi.doMock('@/lib/constants-evm', () => ({
      FLAP_PORTAL: PORTAL,
      FLAP_VAULT_PORTAL: VAULT_A,
      FLAP_PORTAL_DEPLOY_BLOCK: 0n,
    }));
    vi.doMock('@/lib/chains/bsc', () => ({
      bscClient: { multicall: multicallMock },
      bscLogsClient: { getLogs: getLogsMock },
    }));
    vi.doMock('@sentry/nextjs', () => ({
      captureMessage: vi.fn(),
      addBreadcrumb: vi.fn(),
      captureException: vi.fn(),
    }));

    const reads = await import('@/lib/chains/flap-reads');
    expect(() => reads.assertDeployBlockNotPlaceholder()).toThrow(/placeholder/i);

    vi.doUnmock('@/lib/constants-evm');
    vi.doUnmock('@/lib/chains/bsc');
    vi.doUnmock('@sentry/nextjs');
    vi.resetModules();
  });
});
