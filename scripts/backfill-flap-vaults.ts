#!/usr/bin/env -S npx tsx --conditions react-server
// scripts/backfill-flap-vaults.ts
//
// Phase 12 follow-up — pivot scan target from Portal.TokenCreated to
// VaultPortal.FlapTaxVaultTokenCreated.
//
// Why: Portal emits TokenCreated for ALL token creation paths (legacy + new).
// Most are NOT registered with the current VaultPortal (sample showed 400/400
// no-vault). The only tokens that have claimable vaults are the ones the
// VaultPortal itself emitted FlapTaxVaultTokenCreated for. This script scans
// THAT signal directly and annotates the existing flap_tokens rows with the
// vault_address pulled straight from the event arg (no on-chain probe needed
// for that piece).
//
// Strategy:
//   1. eth_getLogs against public BSC RPCs (publicnode caps at 50K blocks per
//      call, free Alchemy at 10) for FlapTaxVaultTokenCreated emitted by
//      VAULT_PORTAL across [78,134,022 .. head] in 50K-block windows.
//      Bitquery is not used here — the prior backfill exhausted the free
//      quota, and getLogs against publicnode is unmetered.
//   2. For each event, extract (token, vault, factory). All non-indexed.
//   3. UPDATE flap_tokens SET vault_address=<from event> WHERE token_address
//      matches AND vault_address IS NULL (idempotent).
//   4. Track unmatched events (= vault token whose Portal.TokenCreated wasn't
//      caught by our prior 90M+ backfill — likely in 78.1M-90M range). Surface
//      orphan count so caller can decide on extending the Portal scan.
//   5. Does NOT touch the indexer cursor (side-channel, not primary scan).
//   6. Does NOT delete anything. Wipe of no-vault rows is a separate decision.
//
// Run locally: npx tsx scripts/backfill-flap-vaults.ts

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) loadEnv({ path: '.env.local' });
else loadEnv();
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  http,
  fallback,
  parseAbiItem,
  type Address,
} from 'viem';
import { bsc } from 'viem/chains';

const VAULT_PORTAL = '0x90497450f2a706f1951b5bdda52B4E5d16f34C06' as Address;
const VAULT_PORTAL_DEPLOY_BLOCK = 78_134_022n;
// PublicNode caps at 50K block range. Binance dataseed caps below this.
// Using 50K as the safe public-RPC ceiling.
const SCAN_WINDOW = 50_000n;

// BSC archive-capable public RPCs. OnFinality public confirmed to return
// historical logs (block 78M+) and accept 50K-block windows without an API
// key. Other free public RPCs (publicnode, binance dataseed) prune state
// older than ~7-10 days; Alchemy free caps at 10 blocks.
const BSC_LOGS_RPCS = [
  'https://bnb.api.onfinality.io/public',
];

// Required env (no Bitquery, no BSC_RPC_URL Alchemy needed for log scan).
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`MISSING env var: ${k}`);
    process.exit(1);
  }
}

const bscClient = createPublicClient({
  chain: bsc,
  transport: fallback(
    BSC_LOGS_RPCS.map((u) => http(u, { timeout: 30_000, retryCount: 2 })),
    { rank: false },
  ),
});

// All 3 args are indexed (verified empirically: real logs have topics[1..3]
// populated and `data: 0x`). BscScan's UI listed them without `indexed`,
// which was wrong — trust the wire format.
const FLAP_VAULT_CREATED_EVENT = parseAbiItem(
  'event FlapTaxVaultTokenCreated(address indexed token, address indexed vault, address indexed vaultFactory)',
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

interface ParsedVault {
  token: string;
  vault: string;
  factory: string;
  block: number;
}

async function fetchWindow(
  fromBlock: bigint,
  toBlock: bigint,
): Promise<ParsedVault[]> {
  // Retry loop: public RPCs occasionally rate-limit or transiently fail.
  // viem's fallback transport handles RPC fallback; we retry the whole call
  // a few times with exponential backoff for hard errors.
  let lastErr: unknown;
  // OnFinality public allows ~3 fast bursts then aggressively rate-limits;
  // longer backoff (up to 60s) lets the bucket refill before giving up.
  const backoffMs = [1_000, 5_000, 15_000, 30_000, 60_000];
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    try {
      const logs = await bscClient.getLogs({
        address: VAULT_PORTAL,
        event: FLAP_VAULT_CREATED_EVENT,
        fromBlock,
        toBlock,
      });
      const out: ParsedVault[] = [];
      for (const log of logs) {
        const args = log.args as {
          token?: Address;
          vault?: Address;
          vaultFactory?: Address;
        };
        const token = args.token?.toLowerCase();
        const vault = args.vault?.toLowerCase();
        const factory = args.vaultFactory?.toLowerCase();
        if (!token || !vault || !factory) continue;
        if (!log.blockNumber) continue;
        out.push({
          token,
          vault,
          factory,
          block: Number(log.blockNumber),
        });
      }
      return out;
    } catch (err) {
      lastErr = err;
      const wait = backoffMs[attempt];
      console.warn(
        `getLogs ${fromBlock}-${toBlock} attempt ${attempt + 1} failed: ${
          err instanceof Error ? err.message.slice(0, 120) : String(err)
        }; retrying in ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const controller = new AbortController();
  process.on('SIGINT', () => {
    console.log('\nSIGINT received, aborting.');
    controller.abort();
  });

  const head = await bscClient.getBlockNumber();
  const fromOverride = process.env.BACKFILL_FROM_BLOCK
    ? BigInt(process.env.BACKFILL_FROM_BLOCK)
    : null;
  let from = fromOverride ?? VAULT_PORTAL_DEPLOY_BLOCK;

  let totalEvents = 0;
  let totalParsed = 0;
  let totalMatched = 0;
  let totalOrphans = 0;
  let windowCount = 0;
  const orphans: ParsedVault[] = [];
  const startTime = Date.now();

  console.log(
    `Scanning VaultPortal FlapTaxVaultTokenCreated: ${from} -> ${head} ` +
      `(${head - from} blocks, ${SCAN_WINDOW}-block windows)`,
  );
  console.log(
    `Estimated window count: ${Math.ceil(Number(head - from) / Number(SCAN_WINDOW))}\n`,
  );

  while (from <= head) {
    if (controller.signal.aborted) process.exit(130);

    const to = from + SCAN_WINDOW - 1n > head ? head : from + SCAN_WINDOW - 1n;
    windowCount++;

    let parsed: ParsedVault[];
    try {
      parsed = await fetchWindow(from, to);
    } catch (err) {
      console.error(
        `Window ${from}-${to} failed after retries:`,
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    }
    totalEvents += parsed.length;
    totalParsed += parsed.length;

    if (parsed.length > 0) {
      // For each parsed event, UPDATE flap_tokens SET vault_address.
      // We use individual updates (vs a single bulk operation) because
      // PostgREST doesn't support multi-row UPDATE-with-different-values
      // in one call. The volume is small (~600-2000 total over the whole
      // run), so per-row is fine.
      for (const v of parsed) {
        // Event is authoritative: overwrite any prior vault_address (including
        // the '0x0' sentinel from classify-flap's no-vault path, which can
        // appear if the token was classified before the event was indexed).
        // vault_type is reset to 'unknown' so the next classify-flap pass picks
        // it up via probes.
        const { data, error } = await supabase
          .from('flap_tokens')
          .update({ vault_address: v.vault, vault_type: 'unknown' })
          .eq('token_address', v.token)
          .select('token_address');

        if (error) {
          console.error(`Update failed for token ${v.token.slice(0, 10)}: ${error.message}`);
          continue;
        }
        if (data && data.length > 0) {
          totalMatched++;
        } else {
          // No rows updated → token isn't in flap_tokens. Genuine orphan
          // (likely created in 78.1M-90M, before the prior Portal backfill
          // range). Track for reporting.
          orphans.push(v);
          totalOrphans++;
        }
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `Window ${windowCount} [${from}-${to}]: ` +
        `events=${parsed.length} ` +
        `matched_total=${totalMatched} orphans_total=${totalOrphans} elapsed=${elapsed}s`,
    );

    from = to + 1n;
    // Throttle: OnFinality public rate-limits aggressively (≈3 burst, then
    // 429s for ~30s). Pacing at 4s keeps us under the per-minute bucket.
    if (from <= head) await new Promise((r) => setTimeout(r, 4_000));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n─── VaultPortal scan complete ───');
  console.log(`Windows: ${windowCount}`);
  console.log(`Total events: ${totalEvents}`);
  console.log(`Parsed (valid args): ${totalParsed}`);
  console.log(`Matched existing flap_tokens rows: ${totalMatched}`);
  console.log(`Orphans (vault token not in flap_tokens): ${totalOrphans}`);
  console.log(`Elapsed: ${elapsed}s`);
  if (orphans.length > 0) {
    console.log('\nOrphan tokens (first 10):');
    for (const o of orphans.slice(0, 10)) {
      console.log(`  block=${o.block} token=${o.token} vault=${o.vault}`);
    }
    console.log(
      '\nOrphans likely live in blocks 78.1M-90M (before the prior backfill range).',
    );
    console.log(
      'To recover them: re-run scripts/backfill-flap.ts with BACKFILL_FROM_BLOCK=78134022 to extend Portal.TokenCreated coverage backward.',
    );
  }
  console.log('\nNext: run `npx tsx scripts/classify-flap.ts` to set vault_type via probes.');
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
