import 'server-only';
import { z } from 'zod';
import type { BaseAddress } from '@/lib/chains/types';
import type {
  FlaunchTokenListResponse,
  FlaunchTokenDetail,
  FlaunchApiError,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('flaunch-client');

const HEX40 = /^0x[a-fA-F0-9]{40}$/;

// ═══════════════════════════════════════════════
// Zod schemas (runtime validators at the external-API boundary)
// ═══════════════════════════════════════════════

const TokenListItemSchema = z.object({
  tokenAddress: z.string().regex(HEX40),
  symbol: z.string(),
  name: z.string(),
  marketCapETH: z.string(),
  createdAt: z.number(),
  positionManager: z.string().regex(HEX40).optional(),
});

const TokenListSchema = z.object({
  data: z.array(TokenListItemSchema),
  pagination: z.object({ limit: z.number(), offset: z.number() }),
});

const TokenDetailSchema = z.object({
  tokenAddress: z.string().regex(HEX40),
  symbol: z.string(),
  name: z.string(),
  image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  socials: z
    .object({
      website: z.string().optional(),
      twitter: z.string().optional(),
      telegram: z.string().optional(),
      discord: z.string().optional(),
      farcaster: z.string().optional(),
    })
    .optional(),
});

// ═══════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════

const FLAUNCH_API_BASE = process.env.FLAUNCH_API_BASE ?? 'https://dev-api.flayerlabs.xyz';
const MAX_RETRIES = 3;
const MIN_INTERVAL_MS = 150;
const REQUEST_TIMEOUT_MS = 10_000;

// ═══════════════════════════════════════════════
// Throttle state (module-local, process-scoped)
// ═══════════════════════════════════════════════

let lastCallAt = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

// ═══════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════

// Page limit matches what the upstream API returns per request. We loop until
// a page comes back short of the limit (signals last page) or we hit MAX_COINS
// as a safety cap for pathological creators. Takeover.fun has 130+ coins —
// single-page (limit=100) truncates them.
const PAGE_LIMIT = 100;
const MAX_COINS = 1000;

export async function fetchCoinsByCreator(
  owner: BaseAddress,
  signal?: AbortSignal,
): Promise<FlaunchTokenListResponse | FlaunchApiError> {
  const accumulated: FlaunchTokenListResponse['data'] = [];
  let offset = 0;
  let firstPageMeta: FlaunchTokenListResponse['pagination'] | null = null;

  while (accumulated.length < MAX_COINS) {
    const path = `/v1/base/tokens?ownerAddress=${owner}&limit=${PAGE_LIMIT}&offset=${offset}`;
    const page = await flaunchGet(path, TokenListSchema, signal);
    if ('kind' in page) return page;

    if (firstPageMeta === null) firstPageMeta = page.pagination;
    accumulated.push(...page.data);
    if (page.data.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return { data: accumulated, pagination: firstPageMeta ?? { limit: PAGE_LIMIT, offset: 0 } };
}

export async function fetchCoinDetail(
  coin: BaseAddress,
  signal?: AbortSignal,
): Promise<FlaunchTokenDetail | FlaunchApiError> {
  const path = `/v1/base/tokens/${coin}`;
  return flaunchGet(path, TokenDetailSchema, signal);
}

// ═══════════════════════════════════════════════
// Internal fetch with retry + throttle + abort
// ═══════════════════════════════════════════════

async function flaunchGet<T>(
  path: string,
  schema: z.ZodType<T>,
  externalSignal?: AbortSignal,
): Promise<T | FlaunchApiError> {
  let attempt = 0;
  let lastErrorMessage = 'unknown';

  while (attempt < MAX_RETRIES) {
    try {
      await throttle();
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted by caller', 'AbortError');
      }

      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
      const combinedSignal = externalSignal
        ? AbortSignal.any([externalSignal, timeoutController.signal])
        : timeoutController.signal;

      let res: Response;
      try {
        res = await fetch(`${FLAUNCH_API_BASE}${path}`, { signal: combinedSignal });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 404) return { kind: 'not_found' };

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('retry-after') ?? '1';
        const retryAfterSec = Number(retryAfterHeader);
        const retryAfterMs =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 1000;
        log.warn('rate_limited', { path, retryAfterMs, attempt });
        if (attempt + 1 >= MAX_RETRIES) {
          return { kind: 'rate_limited', retryAfterMs };
        }
        await sleep(retryAfterMs);
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Flaunch API ${res.status} for ${path}`);
      }

      const raw: unknown = await res.json();
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        log.warn('schema_drift', { path, issues: parsed.error.issues.slice(0, 3) });
        return { kind: 'schema_drift', rawBody: raw, path };
      }
      return parsed.data;
    } catch (err) {
      if (externalSignal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
      lastErrorMessage = err instanceof Error ? err.message : String(err);
      attempt++;
      if (attempt >= MAX_RETRIES) {
        log.warn('network_error_exhausted', {
          path,
          attempts: attempt,
          message: lastErrorMessage,
        });
        return { kind: 'network_error', message: lastErrorMessage, path };
      }
      await sleep(250 * Math.pow(2, attempt));
    }
  }

  return { kind: 'network_error', message: lastErrorMessage, path };
}
