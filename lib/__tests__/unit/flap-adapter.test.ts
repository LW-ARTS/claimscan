import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub for Plan 12-05. Implementation covers:
//  - getHistoricalFees reads flap_tokens via service client
//  - Dispatch to handler via resolveHandler(row.vault_type)
//  - Filters claimable === 0n (D-12)
//  - Emits TokenFee with vaultType passed through
describe('FP-06: flap adapter', () => {
  it('reads flap_tokens filtered by creator (lowercase)', () => {
    expect.fail('stub — Plan 12-05 implements flapAdapter');
  });

  it('dispatches to resolveHandler(row.vault_type) per token', () => {
    expect.fail('stub — Plan 12-05 implements handler dispatch');
  });

  it('filters rows where claimable === 0n (D-12)', () => {
    expect.fail('stub — Plan 12-05 implements zero-balance filter');
  });

  it('emits TokenFee with vaultType matching flap_tokens.vault_type', () => {
    expect.fail('stub — Plan 12-05 implements TokenFee emission');
  });
});
