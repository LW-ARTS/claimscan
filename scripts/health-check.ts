#!/usr/bin/env -S npx tsx --conditions react-server
// scripts/health-check.ts

import { getAllAdapters } from '@/lib/platforms/index';
import { getFixture } from '@/lib/__tests__/fixtures/wallets';

type ProbeMethod = 'getCreatorTokens' | 'getHistoricalFees' | 'getLiveUnclaimedFees';

interface ProbeResult {
  adapterName: string;
  methodName: ProbeMethod;
  durationMs: number;
  resultCount: number;
  error?: string;
}

const PROBE_TIMEOUT_MS = 15_000;

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
    'BSC_RPC_URL',
    'ZORA_API_KEY',
    'BANKR_API_KEY',
    'HELIUS_API_KEY',
  ];

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

  // Raw output — Phase 6 will replace this with a formatted table
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => r.error);
  console.log(`\nProbe summary: ${results.length} total, ${failed.length} failed.`);
}

runProbes().catch((err) => {
  console.error('runProbes crashed:', err);
  process.exit(1);
});
