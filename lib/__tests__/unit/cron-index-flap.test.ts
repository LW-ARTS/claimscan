import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub for Plan 12-04. Implementation covers:
//  - bearer auth via verifyCronSecret (timingSafeEqual)
//  - wallclock guard stops loop before 55s of 60s budget
//  - FLAP_PORTAL_DEPLOY_BLOCK === 0n throws before any DB write
describe('FP-05: cron index-flap', () => {
  it('rejects request without Authorization: Bearer', () => {
    expect.fail('stub — Plan 12-04 implements cron route');
  });

  it('stops scanning after 55_000ms wallclock guard', () => {
    expect.fail('stub — Plan 12-04 implements wallclock guard');
  });

  it('throws immediately when FLAP_PORTAL_DEPLOY_BLOCK === 0n', () => {
    expect.fail('stub — Plan 12-04 implements deploy-block guard');
  });

  it('triggers Sentry warning when lag > 500_000n blocks', () => {
    expect.fail('stub — Plan 12-04 implements D-08 lag observability');
  });
});
