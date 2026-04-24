import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub for Plan 12-03. Implementation covers:
//  - getVaultCategory primary path returns 'base-v1' | 'base-v2'
//  - method-probe fallback kicks in when getVaultCategory reverts
//  - unknown fallback returns 'unknown' + fires Sentry.captureMessage with fingerprint
describe('FP-04: flap-vaults classification', () => {
  it('getVaultCategory returns base-v1 enum → handler base-v1', () => {
    expect.fail('stub — Plan 12-03 implements resolveVaultKind primary path');
  });

  it('getVaultCategory returns base-v2 enum → handler base-v2', () => {
    expect.fail('stub — Plan 12-03 implements resolveVaultKind primary path');
  });

  it('getVaultCategory reverts, vaultUISchema responds → handler base-v2 (fallback)', () => {
    expect.fail('stub — Plan 12-03 implements fallback probe');
  });

  it('all probes revert → handler unknown, Sentry captureMessage with fingerprint fires', () => {
    expect.fail('stub — Plan 12-03 implements unknown fallback + D-16 alert');
  });
});
