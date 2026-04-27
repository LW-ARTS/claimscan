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
  lookupVaultAddressMock: vi.fn(),
  detectFundRecipientMock: vi.fn(),
  // Supabase stub callables captured so tests can assert / drive them.
  supabaseMaybeSingleMock: vi.fn(),
  supabaseUpsertMock: vi.fn(),
  // supabaseUpdateMock: controls the resolved value returned from .eq() in update chains.
  supabaseUpdateMock: vi.fn(),
  // supabaseUpdatePatchMock: captures the patch object passed to .update(patch) without
  // mutating the resolved value. Tests assert via supabaseUpdatePatchMock.mock.calls[i][0].
  supabaseUpdatePatchMock: vi.fn(),
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
  lookupVaultAddress: mocks.lookupVaultAddressMock,
  detectFundRecipient: mocks.detectFundRecipientMock,
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
      // update(patch): capture patch via supabaseUpdatePatchMock (for assertions),
      // then return a chain whose .eq() resolves via supabaseUpdateMock (for error control).
      // This keeps patch recording and resolved-value control fully independent.
      update: (patch: unknown) => {
        mocks.supabaseUpdatePatchMock(patch);
        return {
          eq: (_col: string, _val: unknown) => mocks.supabaseUpdateMock(),
        };
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
  // Default: every token has a vault — classify path never reaches fund-recipient.
  mocks.lookupVaultAddressMock.mockResolvedValue(
    '0x321354e6f01e765f220eb275f315d1d79ee24a33',
  );
  mocks.detectFundRecipientMock.mockResolvedValue({ matched: false });
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

  // ═══════════════════════════════════════════════
  // Classify path tests (HI-12-02)
  // ═══════════════════════════════════════════════

  it('classify: fund-recipient path — UPDATE called with vault_type fund-recipient when lookupVaultAddress=null + detectFundRecipient matched', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    const token = '0xaaaa000000000000000000000000000000000001';
    const marketAddr = '0xbbbb000000000000000000000000000000000002';
    const taxProcessorAddr = '0xcccc000000000000000000000000000000000003';

    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY); // no new blocks → no scan loop
    mocks.supabasePendingSelectMock.mockResolvedValue({
      data: [{ token_address: token }],
      error: null,
    });

    // lookupVaultAddress returns null → fund-recipient probe triggered
    mocks.lookupVaultAddressMock.mockResolvedValue(null);
    mocks.detectFundRecipientMock.mockResolvedValue({
      matched: true,
      marketAddress: marketAddr,
      taxProcessor: taxProcessorAddr,
    });

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.classified_count).toBe(1);
    expect(body.fund_recipient_matched).toBe(1);
    expect(body.db_errors).toBe(0);

    // Assert UPDATE was called with the fund-recipient patch
    expect(mocks.supabaseUpdatePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vault_type: 'fund-recipient',
        recipient_address: marketAddr.toLowerCase(),
        tax_processor_address: taxProcessorAddr.toLowerCase(),
      }),
    );
  });

  it('classify: sentinel path — UPDATE called with zero-address sentinel when lookupVaultAddress=null + detectFundRecipient not matched', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    const token = '0xaaaa000000000000000000000000000000000004';

    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY);
    mocks.supabasePendingSelectMock.mockResolvedValue({
      data: [{ token_address: token }],
      error: null,
    });

    mocks.lookupVaultAddressMock.mockResolvedValue(null);
    mocks.detectFundRecipientMock.mockResolvedValue({ matched: false });

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Sentinel path does NOT increment classifiedCount
    expect(body.classified_count).toBe(0);
    expect(body.fund_recipient_matched).toBe(0);
    expect(body.db_errors).toBe(0);

    // Assert UPDATE was called with sentinel patch
    expect(mocks.supabaseUpdatePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vault_address: '0x0000000000000000000000000000000000000000',
        vault_type: 'unknown',
      }),
    );
  });

  it('classify: vault-kind path — UPDATE called with vault_address + vault_type when lookupVaultAddress returns address', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    const token = '0xaaaa000000000000000000000000000000000005';
    const vaultAddr = '0x321354e6f01e765f220eb275f315d1d79ee24a33';

    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY);
    mocks.supabasePendingSelectMock.mockResolvedValue({
      data: [{ token_address: token }],
      error: null,
    });

    mocks.lookupVaultAddressMock.mockResolvedValue(vaultAddr);
    mocks.resolveVaultKindMock.mockResolvedValue('base-v2');

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.classified_count).toBe(1);
    expect(body.fund_recipient_matched).toBe(0);
    expect(body.db_errors).toBe(0);

    // Assert UPDATE was called with the vault-kind patch
    expect(mocks.supabaseUpdatePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vault_address: vaultAddr.toLowerCase(),
        vault_type: 'base-v2',
      }),
    );
  });

  it('classify: fund-recipient UPDATE returns error → classifiedCount NOT incremented, db_errors increments', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    const token = '0xaaaa000000000000000000000000000000000006';

    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY);
    mocks.supabasePendingSelectMock.mockResolvedValue({
      data: [{ token_address: token }],
      error: null,
    });

    mocks.lookupVaultAddressMock.mockResolvedValue(null);
    mocks.detectFundRecipientMock.mockResolvedValue({
      matched: true,
      marketAddress: '0xbbbb000000000000000000000000000000000007',
      taxProcessor: '0xcccc000000000000000000000000000000000008',
    });
    // DB write fails
    mocks.supabaseUpdateMock.mockResolvedValueOnce({
      error: { message: 'constraint violation' },
    });

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // classifiedCount must NOT increment when write fails
    expect(body.classified_count).toBe(0);
    expect(body.fund_recipient_matched).toBe(0);
    expect(body.db_errors).toBe(1);
  });

  it('classify: vault-kind UPDATE returns error → classifiedCount NOT incremented, db_errors increments', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    const token = '0xaaaa000000000000000000000000000000000009';
    const vaultAddr = '0x321354e6f01e765f220eb275f315d1d79ee24a33';

    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY);
    mocks.supabasePendingSelectMock.mockResolvedValue({
      data: [{ token_address: token }],
      error: null,
    });

    mocks.lookupVaultAddressMock.mockResolvedValue(vaultAddr);
    mocks.resolveVaultKindMock.mockResolvedValue('base-v1');
    // DB write fails
    mocks.supabaseUpdateMock.mockResolvedValueOnce({
      error: { message: 'network error' },
    });

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.classified_count).toBe(0);
    expect(body.db_errors).toBe(1);
  });

  it('classify: 3 unknown rows processed in single run — each takes a different branch', async () => {
    const FLAP_DEPLOY = 39_980_228n;
    const tokenFundRecipient = '0xaaaa000000000000000000000000000000000010';
    const tokenSentinel = '0xaaaa000000000000000000000000000000000011';
    const tokenVaultKind = '0xaaaa000000000000000000000000000000000012';
    const vaultAddr = '0x321354e6f01e765f220eb275f315d1d79ee24a33';
    const marketAddr = '0xbbbb000000000000000000000000000000000013';
    const taxProcessorAddr = '0xcccc000000000000000000000000000000000014';

    mocks.supabaseMaybeSingleMock.mockResolvedValue({
      data: { last_scanned_block: Number(FLAP_DEPLOY) },
    });
    mocks.getBlockNumberMock.mockResolvedValue(FLAP_DEPLOY);
    mocks.supabasePendingSelectMock.mockResolvedValue({
      data: [
        { token_address: tokenFundRecipient },
        { token_address: tokenSentinel },
        { token_address: tokenVaultKind },
      ],
      error: null,
    });

    // Row 1: fund-recipient (lookupVaultAddress=null, detectFundRecipient matched)
    mocks.lookupVaultAddressMock.mockResolvedValueOnce(null);
    mocks.detectFundRecipientMock.mockResolvedValueOnce({
      matched: true,
      marketAddress: marketAddr,
      taxProcessor: taxProcessorAddr,
    });

    // Row 2: sentinel (lookupVaultAddress=null, detectFundRecipient not matched)
    mocks.lookupVaultAddressMock.mockResolvedValueOnce(null);
    mocks.detectFundRecipientMock.mockResolvedValueOnce({ matched: false });

    // Row 3: vault-kind (lookupVaultAddress returns address)
    mocks.lookupVaultAddressMock.mockResolvedValueOnce(vaultAddr);
    mocks.resolveVaultKindMock.mockResolvedValueOnce('split-vault');

    const res = await GET(buildRequest('Bearer secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // fund-recipient + vault-kind both increment classifiedCount; sentinel does not
    expect(body.classified_count).toBe(2);
    expect(body.fund_recipient_matched).toBe(1);
    expect(body.db_errors).toBe(0);

    // Three UPDATE calls were made (one per row)
    expect(mocks.supabaseUpdatePatchMock).toHaveBeenCalledTimes(3);
    expect(mocks.supabaseUpdatePatchMock.mock.calls[0][0]).toMatchObject({
      vault_type: 'fund-recipient',
    });
    expect(mocks.supabaseUpdatePatchMock.mock.calls[1][0]).toMatchObject({
      vault_address: '0x0000000000000000000000000000000000000000',
    });
    expect(mocks.supabaseUpdatePatchMock.mock.calls[2][0]).toMatchObject({
      vault_type: 'split-vault',
    });
  });
});
