import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// server-only is a Next.js build-time marker; mock it so Node's vitest runner
// can import client.ts without crashing (same pattern used across fee-math,
// distributed-lock, fee-sync, claim-hmac unit tests).
vi.mock('server-only', () => ({}));

import { fetchCoinsByCreator, fetchCoinDetail } from '@/lib/flaunch/client';
import { asBaseAddress } from '@/lib/chains/types';

// The client reads lastCallAt at module scope; reset between tests so throttle
// timings are deterministic. We can't un-import, so each test that cares about
// throttle accounts for the 150ms floor.
function mockFetchResponse(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}): Response {
  const status = init.status ?? 200;
  return new Response(init.body === undefined ? null : JSON.stringify(init.body), {
    status,
    headers: init.headers,
  });
}

const SAMPLE_OWNER = asBaseAddress('0x0000000000000000000000000000000000000001');
const SAMPLE_COIN = asBaseAddress('0x0000000000000000000000000000000000000002');

const VALID_LIST_BODY = {
  data: [
    {
      tokenAddress: '0x1111111111111111111111111111111111111111',
      symbol: 'FLN',
      name: 'Flaunch Test',
      marketCapETH: '0.42',
      createdAt: 1712345678,
    },
  ],
  pagination: { limit: 100, offset: 0 },
};

const VALID_DETAIL_BODY = {
  tokenAddress: '0x1111111111111111111111111111111111111111',
  symbol: 'FLN',
  name: 'Flaunch Test',
  image: null,
  description: null,
};

describe('fetchCoinsByCreator', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed list on 200', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ body: VALID_LIST_BODY }));
    const result = await fetchCoinsByCreator(SAMPLE_OWNER);
    expect('kind' in result).toBe(false);
    if (!('kind' in result)) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].symbol).toBe('FLN');
    }
  });

  it('returns { kind: "not_found" } on 404 without retry', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ status: 404 }));
    const result = await fetchCoinsByCreator(SAMPLE_OWNER);
    expect(result).toMatchObject({ kind: 'not_found' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns { kind: "schema_drift" } when response shape is unexpected', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({ body: { unexpected: true, shape: 'wrong' } }),
    );
    const result = await fetchCoinsByCreator(SAMPLE_OWNER);
    expect(result).toMatchObject({ kind: 'schema_drift' });
    if ('kind' in result && result.kind === 'schema_drift') {
      expect(result.path).toContain('/v1/base/tokens');
    }
  });

  it('retries on 429 with retry-after header', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockFetchResponse({ status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(mockFetchResponse({ body: VALID_LIST_BODY }));

    const started = Date.now();
    const result = await fetchCoinsByCreator(SAMPLE_OWNER);
    const elapsed = Date.now() - started;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(950); // allow 50ms jitter
    expect('kind' in result).toBe(false);
  }, 10_000);

  it('returns { kind: "rate_limited" } after retries exhausted', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse({ status: 429, headers: { 'retry-after': '0' } }),
    );
    const result = await fetchCoinsByCreator(SAMPLE_OWNER);
    expect(result).toMatchObject({ kind: 'rate_limited' });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  }, 10_000);

  it('forwards AbortSignal — aborted call rejects', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const promise = fetchCoinsByCreator(SAMPLE_OWNER, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toThrow(/Aborted/);
  });

  it('throttles consecutive calls to at least 150ms apart', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse({ body: VALID_LIST_BODY }));
    // Warm the throttle clock so the first call returns immediately.
    await fetchCoinsByCreator(SAMPLE_OWNER);
    const firstCallAt = Date.now();
    await fetchCoinsByCreator(SAMPLE_OWNER);
    const secondCallAt = Date.now();
    const gap = secondCallAt - firstCallAt;
    expect(gap).toBeGreaterThanOrEqual(140); // allow 10ms scheduler jitter
  }, 5_000);
});

describe('fetchCoinDetail', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed detail on 200', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ body: VALID_DETAIL_BODY }));
    const result = await fetchCoinDetail(SAMPLE_COIN);
    expect('kind' in result).toBe(false);
    if (!('kind' in result)) {
      expect(result.symbol).toBe('FLN');
      expect(result.image).toBeNull();
    }
  });

  it('handles optional socials field', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        body: { ...VALID_DETAIL_BODY, socials: { twitter: '@flauncher' } },
      }),
    );
    const result = await fetchCoinDetail(SAMPLE_COIN);
    expect('kind' in result).toBe(false);
    if (!('kind' in result)) {
      expect(result.socials?.twitter).toBe('@flauncher');
    }
  });
});
