import { describe, it, expect } from 'vitest';

// Stub for Plan 12-02. Implementation asserts FLAP_PORTAL, FLAP_VAULT_PORTAL
// are non-placeholder BscAddress values and FLAP_PORTAL_DEPLOY_BLOCK > 0n.
describe('FP-01: Flap BSC constants', () => {
  it('FLAP_PORTAL resolves to the verified proxy address', () => {
    expect.fail('stub — Plan 12-02 populates constants-evm.ts');
  });

  it('FLAP_VAULT_PORTAL resolves to the verified proxy address', () => {
    expect.fail('stub — Plan 12-02 populates constants-evm.ts');
  });

  it('FLAP_PORTAL_DEPLOY_BLOCK is 39_980_228n (not placeholder 0n)', () => {
    expect.fail('stub — Plan 12-02 populates constants-evm.ts');
  });
});
