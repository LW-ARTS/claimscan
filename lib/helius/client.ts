import 'server-only';
import { HELIUS_DAS_URL, HELIUS_REST_URL } from '@/lib/constants';

// ═══════════════════════════════════════════════
// Helius API Client
// Centralized client for DAS JSON-RPC and REST API calls.
// All methods return null on failure (graceful degradation).
// ═══════════════════════════════════════════════

const HELIUS_TIMEOUT_MS = 12_000;

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
    const res = await fetch(HELIUS_DAS_URL, {
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
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[helius] ${label} returned HTTP ${res.status}`);
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

  const separator = path.includes('?') ? '&' : '?';
  const url = `${HELIUS_REST_URL}${path}${separator}api-key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HELIUS_TIMEOUT_MS);
  const combinedSignal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(url, {
      ...options,
      signal: combinedSignal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[helius] ${label} returned HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[helius] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
