import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// server-only is a Next.js build-time marker; mock it so Node's vitest runner
// can import the route handler without crashing (same pattern used across
// flap-vaults, flaunch-client, distributed-lock unit tests).
vi.mock('server-only', () => ({}));

// Hoisted mocks — use vi.hoisted so the fn refs are initialized before the
// vi.mock factories run (vi.mock is hoisted to the top of the file).
const mocks = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  getBlockNumberMock: vi.fn(),
  readContractMock: vi.fn(),
  scanTokenCreatedMock: vi.fn(),
  batchReadDecimalsMock: vi.fn(),
  assertDeployBlockNotPlaceholderMock: vi.fn(),
  verifyCronSecretMock: vi.fn(),
  resolveVaultKindMock: vi.fn(),
  // Supabase stub callables captured so tests can assert / drive them.
  supabaseMaybeSingleMock: vi.fn(),
  supabaseUpsertMock: vi.fn(),
  supabaseUpdateMock: vi.fn(),
  supabasePendingSelectMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.captureMessageMock,
  addBreadcrumb: mocks.addBreadcrumbMock,
  captureException: mocks.captureExceptionMock,
}));

vi.mock('@/lib/chains/bsc', () => ({
  bscClient: {
    getBlockNumber: mocks.getBlockNumberMock,
    readContract: mocks.readContractMock,
  },
}));

vi.mock('@/lib/chains/flap-reads', () => ({
  scanTokenCreated: mocks.scanTokenCreatedMock,
  batchReadDecimals: mocks.batchReadDecimalsMock,
  assertDeployBlockNotPlaceholder: mocks.assertDeployBlockNotPlaceholderMock,
}));

vi.mock('@/lib/supabase/service', () => ({
  verifyCronSecret: mocks.verifyCronSecretMock,
  createServiceClient: () => buildSupabaseStub(),
}));

vi.mock('@/lib/platforms/flap-vaults', () => ({
  resolveVaultKind: mocks.resolveVaultKindMock,
}));

import { GET } from '@/app/api/cron/index-flap/route';

// ═══════════════════════════════════════════════
// Supabase stub — minimal chainable mock covering the operations the route uses
//
// - .from('flap_indexer_state').select('last_scanned_block').eq(...).maybeSingle()
// - .from('flap_tokens').upsert(rows, {...})
// - .from('flap_indexer_state').upsert({...}, {...})
// - .from('flap_tokens').select('token_address').eq(...).is(...).limit(n)  (pending query)
// - .from('flap_tokens').update({...}).eq(...)  (classification update)
// ═══════════════════════════════════════════════

function buildSupabaseStub() {
  const pendingSelectChain = {
    eq: () => ({
      is: () => ({
        limit: (n: number) => mocks.supabasePendingSelectMock(n),
      }),
    }),
  };

  const cursorSelectChain = {
    eq: () => ({
      maybeSingle: () => mocks.supabaseMaybeSingleMock(),
    }),
  };

  const updateChain = {
    eq: (_col: string, _val: unknown) => mocks.supabaseUpdateMock(),
  };

  return {
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === 'flap_indexer_state' && cols === 'last_scanned_block') {
          return cursorSelectChain;
        }
        if (table === 'flap_tokens' && cols === 'token_address') {
          return pendingSelectChain;
        }
        return cursorSelectChain;
      },
      upsert: (rows: unknown, opts: unknown) =>
        mocks.supabaseUpsertMock(table, rows, opts),
      update: (patch: unknown) => {
        mocks.supabaseUpdateMock.mockImplementationOnce?.(() => patch);
        return updateChain;
      },
    }),
  };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function buildRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['authorization'] = authHeader;
  }
  return new Request('http://localhost/api/cron/index-flap', { headers });
}

function resetAllMocks() {
  for (const m of Object.values(mocks)) {
    if (typeof (m as { mockReset?: () => void }).mockReset === 'function') {
      (m as { mockReset: () => void }).mockReset();
    }
  }
}

function wireDefaultHappyPath() {
  mocks.verifyCronSecretMock.mockReturnValue(true);
  mocks.assertDeployBlockNotPlaceholderMock.mockImplementation(() => {
    // no-op (not a placeholder in this test)
  });
  mocks.supabaseMaybeSingleMock.mockResolvedValue({ data: null });
  mocks.supabaseUpsertMock.mockResolvedValue({ error: null });
  mocks.supabaseUpdateMock.mockResolvedValue({ error: null });
  mocks.supabasePendingSelectMock.mockResolvedValue({
    data: [],
    error: null,
  });
  mocks.scanTokenCreatedMock.mockResolvedValue([]);
  mocks.batchReadDecimalsMock.mockResolvedValue([]);
  mocks.resolveVaultKindMock.mockResolvedValue('unknown');
}

describe('FP-05: cron index-flap', () => {
  beforeEach(() => {
    resetAllMocks();
    wireDefaultHappyPath();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects request without Authorization: Bearer', async () => {
    mocks.verifyCronSecretMock.mockReturnValue(false);
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
    // verifyCronSecret failure must SHORT-CIRCUIT — no DB client, no deploy-block guard.
    expect(mocks.assertDeployBlockNotPlaceholderMock).not.toHaveBeenCalled();
    expect(mocks.getBlockNumberMock).not.toHaveBeenCalled();
  });

  it('throws immediately when FLAP_PORTAL_DEPLOY_BLOCK === 0n', async () => {
    // assertDeployBlockNotPlaceholder (from lib/chains/flap-reads.ts) throws
    // synchronously when the constant is a placeholder 0n. The route's outer
    // try/catch catches and returns 500 with the actual error message.
    mocks.assertDeployBlockNotPlaceholderMock.mockImplementation(() => {
      throw new Error(
        'FLAP_PORTAL_DEPLOY_BLOCK is placeholder (0n) — refusing to run indexer.',
      );
    });
    const res = await GET(buildRequest('Bearer secret'));
    // Deploy-block guard runs OUTSIDE the try/catch in our implementation —
    // verify the call happened and no DB work was performed.
    expect(mocks.assertDeployBlockNotPlaceholderMock).toHaveBeenCalledTimes(1);
    expect(mocks.getBlockNumberMock).not.toHaveBeenCalled();
    expect(mocks.scanTokenCreatedMock).not.toHaveBeenCalled();
    // The throw bubbles — route returns a 500 via outer catch-all since the
    // guard is called inside the route body (post-auth).
    expect(res.status).toBe(500);
  });

  it('stops scanning after 55_000ms wallclock guard', async () => {
    // Head is way ahead so the loop would normally iterate many times.
    // We force Date.now() to jump past WALLCLOCK_MS after the FIRST scan call,
    // proving the guard stops the loop.
    const FLAP_DEPLOY = 39_980_228n;
    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY - 1n) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY + 10_000_000n);
    mocks.scanTokenCreatedMock.mockResolvedValue([]);

    // Advance the clock so the second loop iteration fails the wallclock check.
    const realNow = Date.now.bind(Date);
    const start = realNow();
    let calls = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => {
      calls++;
      // First few calls: normal; after N calls simulate 60s elapsed so the
      // wallclock guard (Date.now() - started < 55_000) becomes false.
      if (calls > 5) return start + 60_000;
      return start;
    });

    const res = await GET(buildRequest('Bearer secret'));
    spy.mockRestore();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // With a 10M-block gap the loop would normally run 40 iterations (at 250K
    // per window). The wallclock guard must keep it well below that.
    expect(mocks.scanTokenCreatedMock.mock.calls.length).toBeLessThan(5);
  });

  it('triggers Sentry warning when lag > 500_000n blocks', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    // Cursor at last_scanned = FLAP_DEPLOY; head is FLAP_DEPLOY + 600_000 → lag = 600_000 > 500_000.
    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY + 600_000n);
    mocks.scanTokenCreatedMock.mockResolvedValue([]);

    await GET(buildRequest('Bearer secret'));

    // At least one captureMessage call, and the first one must be the lag warning.
    expect(mocks.captureMessageMock).toHaveBeenCalled();
    const [msg, options] = mocks.captureMessageMock.mock.calls[0];
    expect(msg).toBe('Flap indexer lag high');
    expect(options).toMatchObject({
      level: 'warning',
      extra: expect.objectContaining({
        lag_blocks: '600000',
        threshold_blocks: '500000',
      }),
    });
  });

  it('batchReadDecimals returning [18, null] upserts decimals: 18 for both rows + logs D-10 breadcrumb', async () => {
    // Cursor bootstrap via null; head set so one window runs.
    const FLAP_DEPLOY = 39_980_228n;
    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY - 1n) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY + 100n);

    // Two mock TokenCreated logs — the first will resolve decimals=18, the
    // second will resolve null (non-standard token) and must fallback to 18.
    const t1 = '0x1111111111111111111111111111111111111111';
    const t2 = '0x2222222222222222222222222222222222222222';
    const creator = '0x3333333333333333333333333333333333333333';
    mocks.scanTokenCreatedMock.mockResolvedValue([
      {
        ts: 0n,
        creator,
        nonce: 0n,
        tokenAddress: t1,
        name: 'A',
        symbol: 'A',
        meta: '',
        block: FLAP_DEPLOY,
        txHash: '0x0',
      },
      {
        ts: 0n,
        creator,
        nonce: 1n,
        tokenAddress: t2,
        name: 'B',
        symbol: 'B',
        meta: '',
        block: FLAP_DEPLOY + 1n,
        txHash: '0x0',
      },
    ]);
    mocks.batchReadDecimalsMock.mockResolvedValue([18, null]);

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Assert: upsert to flap_tokens was called with rows where BOTH decimals === 18.
    const flapTokensUpsertCall = mocks.supabaseUpsertMock.mock.calls.find(
      ([table]) => table === 'flap_tokens',
    );
    expect(flapTokensUpsertCall).toBeDefined();
    const rows = flapTokensUpsertCall![1] as Array<{ decimals: number; token_address: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].decimals).toBe(18);
    expect(rows[1].decimals).toBe(18);

    // Assert: D-10 observability — decimals_fallback_count reflects the null index.
    expect(body.decimals_fallback_count).toBe(1);

    // Assert: breadcrumb log emitted for the null fallback. The logger sends
    // warn-level to Sentry.addBreadcrumb (see lib/logger.ts L63-70).
    expect(mocks.addBreadcrumbMock).toHaveBeenCalled();
    const breadcrumbCall = mocks.addBreadcrumbMock.mock.calls.find(
      ([args]) => args?.message === 'non-standard decimals, using fallback',
    );
    expect(breadcrumbCall).toBeDefined();
    expect(breadcrumbCall![0]).toMatchObject({
      level: 'warning',
      message: 'non-standard decimals, using fallback',
      data: expect.objectContaining({
        resolvedDecimals: 18,
        fallback: true,
      }),
    });
  });
});
