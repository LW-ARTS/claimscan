import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub for Plan 12-02. Implementation covers:
//  - FLAP_TOKEN_CREATED_EVENT decoder round-trips the verified signature
//    (uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)
//  - scanTokenCreated throws on spoofed log.address (belt-and-suspenders protection)
//  - batchVaultClaimable multicall handles allowFailure: true per-entry
//  - FLAP_PORTAL_DEPLOY_BLOCK === 0n guard throws in runtime check
describe('FP-03: flap-reads event decoder', () => {
  it('decodes TokenCreated with all 7 non-indexed fields', () => {
    expect.fail('stub — Plan 12-02 implements scanTokenCreated');
  });

  it('rejects spoofed TokenCreated log whose address !== FLAP_PORTAL', () => {
    expect.fail('stub — Plan 12-02 implements spoof guard');
  });

  it('batchVaultClaimable degrades individual vault failures to null via allowFailure', () => {
    expect.fail('stub — Plan 12-02 implements batchVaultClaimable');
  });

  it('runtime guard throws when FLAP_PORTAL_DEPLOY_BLOCK === 0n', () => {
    expect.fail('stub — Plan 12-02 implements runtime guard');
  });
});
