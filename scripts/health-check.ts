#!/usr/bin/env -S npx tsx --conditions react-server
// scripts/health-check.ts

import 'dotenv/config';
import pc from 'picocolors';
import { getAllAdapters } from '@/lib/platforms/index';
import { getFixture } from '@/lib/__tests__/fixtures/wallets';

type ProbeMethod = 'getCreatorTokens' | 'getHistoricalFees' | 'getLiveUnclaimedFees';

type ErrorCategory =
  | 'timeout'
  | 'auth_failure'
  | 'rate_limit'
  | 'parse_error'
  | 'network_error'
  | 'empty_result';

type ProbeStatus = 'ok' | 'fail' | 'timeout';

interface ProbeResult {
  adapterName: string;
  methodName: ProbeMethod;
  durationMs: number;
  resultCount: number;
  error?: string;
}

function categorizeError(error: string, resultCount: number): ErrorCategory {
  const msg = error.toLowerCase();
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('etimedout')) {
    return 'timeout';
  }
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid key')
  ) {
    return 'auth_failure';
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'rate_limit';
  }
  if (
    msg.includes('json') ||
    msg.includes('parse') ||
    msg.includes('unexpected token') ||
    msg.includes('syntax')
  ) {
    return 'parse_error';
  }
  if (
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('network error')
  ) {
    return 'network_error';
  }
  if (resultCount === 0) {
    return 'empty_result';
  }
  return 'network_error';
}

function deriveStatus(result: ProbeResult): ProbeStatus {
  if (!result.error) return 'ok';
  const category = categorizeError(result.error, result.resultCount);
  return category === 'timeout' ? 'timeout' : 'fail';
}

function deriveErrorDisplay(result: ProbeResult): string {
  if (!result.error && result.resultCount === 0) return 'empty_result';
  if (!result.error) return '';
  return categorizeError(result.error, result.resultCount);
}

function colorStatus(status: ProbeStatus): string {
  if (status === 'ok') return pc.green(status);
  if (status === 'timeout') return pc.yellow(status);
  return pc.red(status);
}

function renderTable(results: ProbeResult[]): void {
  // Column widths (content only, padding added separately)
  const COL = {
    adapter: 14,
    method: 24,
    status: 9,
    time: 10,
    count: 7,
    error: 20,
  };

  const pad = (s: string, n: number) => s.padEnd(n);
  const header =
    pad('Adapter', COL.adapter) +
    pad('Method', COL.method) +
    pad('Status', COL.status) +
    pad('Time (ms)', COL.time) +
    pad('Count', COL.count) +
    'Error';
  const separator = '-'.repeat(
    COL.adapter + COL.method + COL.status + COL.time + COL.count + COL.error,
  );

  console.log('');
  console.log(pc.bold(header));
  console.log(separator);

  for (const r of results) {
    const status = deriveStatus(r);
    const errorDisplay = deriveErrorDisplay(r);
    const statusColored = colorStatus(status);
    // padEnd on the raw status string (not colored) to keep alignment
    const statusPadded = statusColored + ' '.repeat(Math.max(0, COL.status - status.length));

    const row =
      pad(r.adapterName, COL.adapter) +
      pad(r.methodName, COL.method) +
      statusPadded +
      pad(String(r.durationMs), COL.time) +
      pad(String(r.resultCount), COL.count) +
      errorDisplay;

    console.log(row);
  }

  console.log(separator);
}

const PROBE_TIMEOUT_MS = 30_000;

async function probeMethod(
  adapterName: string,
  methodName: ProbeMethod,
  fn: () => Promise<unknown[]>,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const start = performance.now();

  try {
    // For getLiveUnclaimedFees the signal is passed by the caller via `fn` closure.
    // For getCreatorTokens and getHistoricalFees we race against a timeout rejection.
    const timeoutPromise = new Promise<never>((_, reject) =>
      controller.signal.addEventListener('abort', () =>
        reject(new Error(`timeout after ${PROBE_TIMEOUT_MS}ms`)),
      ),
    );
    const result = await Promise.race([fn(), timeoutPromise]);
    const durationMs = Math.round(performance.now() - start);
    return { adapterName, methodName, durationMs, resultCount: result.length };
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const error = err instanceof Error ? err.message : String(err);
    return { adapterName, methodName, durationMs, resultCount: 0, error };
  } finally {
    clearTimeout(timer);
  }
}

function validateEnv(): void {
  const missing: string[] = [];

  const required = [
    'SOLANA_RPC_URL',
    'BASE_RPC_URL',
    'ETH_RPC_URL',
    'ZORA_API_KEY',
    'BANKR_API_KEY',
    'HELIUS_API_KEY',
  ];

  // Optional: BSC_RPC_URL (Clanker BSC falls back to public RPC)
  if (!process.env.BSC_RPC_URL) {
    console.warn('WARN: BSC_RPC_URL not set, Clanker BSC will use public fallback');
  }

  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }

  // Bags: either BAGS_API_KEYS or BAGS_API_KEY must be set
  if (!process.env.BAGS_API_KEYS && !process.env.BAGS_API_KEY) {
    missing.push('BAGS_API_KEYS (or BAGS_API_KEY)');
  }

  if (missing.length > 0) {
    for (const m of missing) console.error(`MISSING: ${m}`);
    process.exit(1);
  }
}

validateEnv();

console.log('Env OK — all required vars present. Starting probes...');

async function runProbes(): Promise<void> {
  const adapters = getAllAdapters();
  const results: ProbeResult[] = [];

  for (const adapter of adapters) {
    // Join: getAllAdapters() returns objects with .platform; getFixture() keys by Platform
    const fixture = getFixture(adapter.platform);
    const wallet = fixture.walletAddress;

    // 1. getCreatorTokens
    results.push(
      await probeMethod(adapter.platform, 'getCreatorTokens', () =>
        adapter.getCreatorTokens(wallet),
      ),
    );

    // 2. getHistoricalFees
    results.push(
      await probeMethod(adapter.platform, 'getHistoricalFees', () =>
        adapter.getHistoricalFees(wallet),
      ),
    );

    // 3. getLiveUnclaimedFees — pass AbortSignal directly via closure
    const liveController = new AbortController();
    const liveTimer = setTimeout(() => liveController.abort(), PROBE_TIMEOUT_MS);
    const liveStart = performance.now();
    try {
      const liveResult = await adapter.getLiveUnclaimedFees(wallet, liveController.signal);
      results.push({
        adapterName: adapter.platform,
        methodName: 'getLiveUnclaimedFees',
        durationMs: Math.round(performance.now() - liveStart),
        resultCount: liveResult.length,
      });
    } catch (err: unknown) {
      results.push({
        adapterName: adapter.platform,
        methodName: 'getLiveUnclaimedFees',
        durationMs: Math.round(performance.now() - liveStart),
        resultCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(liveTimer);
    }
  }

  renderTable(results);

  const okCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error && categorizeError(r.error, r.resultCount) !== 'timeout').length;
  const timeoutCount = results.filter((r) => r.error && categorizeError(r.error, r.resultCount) === 'timeout').length;

  console.log(
    `\nSummary: ${results.length} probes — ` +
    `${pc.green(String(okCount) + ' ok')}, ` +
    `${pc.red(String(failCount) + ' fail')}, ` +
    `${pc.yellow(String(timeoutCount) + ' timeout')}`,
  );
}

runProbes().catch((err) => {
  console.error('runProbes crashed:', err);
  process.exit(1);
});
