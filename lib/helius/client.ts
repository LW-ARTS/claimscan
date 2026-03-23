import 'server-only';
import { HELIUS_DAS_URL, HELIUS_REST_URL } from '@/lib/constants';

// ═══════════════════════════════════════════════
// Helius API Client
// Centralized client for DAS JSON-RPC and REST API calls.
// All methods return null on failure (graceful degradation).
// ═══════════════════════════════════════════════

const HELIUS_TIMEOUT_MS = 12_000;
const MAX_429_RETRIES = 2;
const BACKOFF_BASE_MS = 1_000;

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a fetch with automatic retry on HTTP 429 (rate-limited).
 * Parses `Retry-After` header when present; otherwise uses exponential
 * backoff (1s, 2s). Returns the successful Response or null after all
 * retries are exhausted.
 */
async function fetchWith429Retry(
  input: RequestInfo | URL,
  init: RequestInit,
  label: string
): Promise<Response | null> {
  let lastRes: Response | undefined;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429) return res;

    lastRes = res;
    if (attempt === MAX_429_RETRIES) break;

    const retryAfter = res.headers.get('Retry-After');
    const delayMs = retryAfter && !Number.isNaN(Number(retryAfter))
      ? Math.min(Number(retryAfter) * 1000, 10_000)
      : BACKOFF_BASE_MS * Math.pow(2, attempt);

    console.warn(
      `[helius] ${label} got 429 — retry ${attempt + 1}/${MAX_429_RETRIES} after ${delayMs}ms`
    );
    await sleep(delayMs);
  }

  console.warn(`[helius] ${label} returned HTTP 429 after ${MAX_429_RETRIES} retries`);
  return null;
}

export function getHeliusApiKey(): string | null {
  return process.env.HELIUS_API_KEY ?? null;
}

export function isHeliusAvailable(): boolean {
  return !!getHeliusApiKey();
}

/**
 * Execute a DAS JSON-RPC method against Helius.
 * Uses Bearer token auth matching the existing pattern in solana-metadata.ts.
 */
export async function heliusDasRpc<T>(
  method: string,
  params: Record<string, unknown>,
  label: string,
  externalSignal?: AbortSignal
): Promise<T | null> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HELIUS_TIMEOUT_MS);
  const combinedSignal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal;

  try {
    const res = await fetchWith429Retry(
      HELIUS_DAS_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `claimscan-${label}`,
          method,
          params,
        }),
        signal: combinedSignal,
      },
      label
    );
    clearTimeout(timeout);

    if (!res || !res.ok) {
      if (res && (res.status === 401 || res.status === 403)) {
        console.error(`[helius] ${label} AUTH FAILURE (HTTP ${res.status}) — check HELIUS_API_KEY`);
      } else if (res) {
        console.warn(`[helius] ${label} returned HTTP ${res.status}`);
      }
      return null;
    }

    const data = await res.json();
    if (data.error) {
      console.warn(`[helius] ${label} RPC error:`, data.error);
      return null;
    }

    return data.result as T;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[helius] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Execute a Helius REST API call (Enhanced Transactions, webhooks, etc.).
 * Uses api-key query param for auth (Helius REST convention).
 */
export async function heliusRestApi<T>(
  path: string,
  options: RequestInit = {},
  label: string,
  externalSignal?: AbortSignal
): Promise<T | null> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return null;

  // Helius REST API accepts api-key as query param, not Bearer auth
  const separator = path.includes('?') ? '&' : '?';
  const url = `${HELIUS_REST_URL}${path}${separator}api-key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HELIUS_TIMEOUT_MS);
  const combinedSignal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal;

  try {
    const existingHeaders = options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : (options.headers as Record<string, string>) ?? {};
    const res = await fetchWith429Retry(
      url,
      {
        ...options,
        headers: { ...existingHeaders },
        signal: combinedSignal,
      },
      label
    );
    clearTimeout(timeout);

    if (!res || !res.ok) {
      if (res && (res.status === 401 || res.status === 403)) {
        console.error(`[helius] ${label} AUTH FAILURE (HTTP ${res.status}) — check HELIUS_API_KEY`);
      } else if (res) {
        console.warn(`[helius] ${label} returned HTTP ${res.status}`);
      }
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[helius] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
