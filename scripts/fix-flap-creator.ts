#!/usr/bin/env -S npx tsx --conditions react-server
// scripts/fix-flap-creator.ts
//
// Phase 12.1 follow-up — repair flap_tokens.creator integrity bug.
//
// Bug (audit 2026-04-26): backfill-flap.ts populated `creator` from the
// TokenCreated event arg `creator`. On FLAP_PORTAL that arg is the IMMEDIATE
// CALLER-CONTRACT (FLAP_VAULT_PORTAL = 0x90497450... in the standard flow),
// not the user EOA. Adapter (`lib/platforms/flap.ts`) joins flap_tokens by
// `creator`, so every row was orphaned from the real wallet — users saw zero
// Flap rows on their profiles even after Phase 12.1 reclassification.
//
// Fix is to use `tx.from` (the EOA that signed the create transaction).
// Production code paths (cron + Bitquery backfill) are corrected in
// lib/chains/flap-reads.ts + scripts/backfill-flap.ts. This one-shot script
// repairs the existing ~6791 rows in the DB.
//
// Strategy:
//   1. Query flap_tokens for all rows where creator = FLAP_VAULT_PORTAL
//      (= the bad-creator sentinel — every bitquery_backfill row).
//   2. Sort by created_block ASC.
//   3. For each block scan FLAP_PORTAL TokenCreated logs at that single block,
//      decode each log to extract (token, txHash). Build map: token → txHash.
//   4. For each unique txHash, fetch tx.from. Build map: txHash → from.
//   5. UPDATE flap_tokens SET creator = from WHERE token_address = token.
//   6. Throttled per-row (50ms between RPC bursts) to stay under Alchemy free
//      660 CU/sec budget.
//
// Idempotent: if a row's creator is already corrected, the SELECT in step 1
// won't pick it up, so re-running is safe.
//
// Run locally: npx tsx scripts/fix-flap-creator.ts
//   Optional env: SAMPLE_LIMIT=N (default: no limit, processes all bad rows)

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) loadEnv({ path: '.env.local' });
else loadEnv();
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
} from 'viem';
import { bsc } from 'viem/chains';

const FLAP_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0' as Address;
const FLAP_VAULT_PORTAL = '0x90497450f2a706f1951b5bdda52b4e5d16f34c06' as Address;
const TOKEN_CREATED_EVENT = parseAbiItem(
  'event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)',
);

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BSC_RPC_URL'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`MISSING env var: ${k}`);
    process.exit(1);
  }
}

const bscClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL!.split(',')[0].trim(), {
    timeout: 30_000,
    retryCount: 3,
    retryDelay: 500,
  }),
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main(): Promise<void> {
  const sampleLimit = process.env.SAMPLE_LIMIT
    ? Number.parseInt(process.env.SAMPLE_LIMIT, 10)
    : null;

  // 1. Fetch rows needing fix. The Supabase JS client caps at 1000 rows per
  //    SELECT by default; loop with .range() pagination so a single run
  //    drains the queue (typically ~6791 rows).
  console.log(`Fetching rows with creator=${FLAP_VAULT_PORTAL} ...`);
  const allRows: Array<{ token_address: string; created_block: number }> = [];
  const PAGE = 1000;
  let pageStart = 0;
  while (true) {
    const { data, error } = await supabase
      .from('flap_tokens')
      .select('token_address, created_block')
      .eq('creator', FLAP_VAULT_PORTAL)
      .order('created_block', { ascending: true })
      .range(pageStart, pageStart + PAGE - 1);
    if (error) {
      console.error('Failed to query flap_tokens:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    pageStart += PAGE;
    if (sampleLimit !== null && allRows.length >= sampleLimit) {
      allRows.length = sampleLimit;
      break;
    }
  }

  const total = allRows.length;
  console.log(`Found ${total} rows needing creator fix.`);
  if (total === 0) {
    console.log('Nothing to fix. Exiting.');
    return;
  }

  // 2. Group by block for efficient log scans (multiple tokens often share
  //    a tx, multiple txs often share a block — fetching logs at exact block
  //    is cheap on Alchemy).
  const tokensByBlock = new Map<number, string[]>();
  for (const row of allRows) {
    const arr = tokensByBlock.get(row.created_block) ?? [];
    arr.push(row.token_address.toLowerCase());
    tokensByBlock.set(row.created_block, arr);
  }
  const blocks = Array.from(tokensByBlock.keys()).sort((a, b) => a - b);
  console.log(`Tokens span ${blocks.length} unique blocks.`);

  // 3. Walk each block: getLogs → decode → tokenToTxHash, then getTransaction
  //    → txHash → from. UPDATE row by row.
  let processed = 0;
  let updated = 0;
  let dbErrors = 0;
  let scanErrors = 0;
  let skippedNoMatch = 0;
  const txFromCache = new Map<string, string>();
  const started = Date.now();

  for (const block of blocks) {
    const expectedTokens = new Set(tokensByBlock.get(block)!);
    const startedAt = Date.now();
    let logs;
    try {
      logs = await bscClient.getLogs({
        address: FLAP_PORTAL,
        event: TOKEN_CREATED_EVENT,
        fromBlock: BigInt(block),
        toBlock: BigInt(block),
      });
    } catch (err) {
      scanErrors++;
      console.error(
        `getLogs block=${block} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }

    // tokenLower → txHash
    const tokenToTx = new Map<string, `0x${string}`>();
    for (const log of logs) {
      const tokenArg = (log.args as { token?: Address }).token?.toLowerCase();
      if (!tokenArg || !expectedTokens.has(tokenArg)) continue;
      if (!log.transactionHash) continue;
      tokenToTx.set(tokenArg, log.transactionHash);
    }

    // Resolve tx.from for each unique tx
    const uniqTxHashes = Array.from(new Set(tokenToTx.values()));
    for (const txHash of uniqTxHashes) {
      if (txFromCache.has(txHash)) continue;
      try {
        const tx = await bscClient.getTransaction({ hash: txHash });
        txFromCache.set(txHash, tx.from.toLowerCase());
      } catch (err) {
        scanErrors++;
        console.error(
          `getTransaction ${txHash.slice(0, 10)} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // UPDATE rows
    for (const token of expectedTokens) {
      processed++;
      const txHash = tokenToTx.get(token);
      if (!txHash) {
        skippedNoMatch++;
        continue;
      }
      const from = txFromCache.get(txHash);
      if (!from) continue;
      const { error: upErr } = await supabase
        .from('flap_tokens')
        .update({ creator: from })
        .eq('token_address', token);
      if (upErr) {
        dbErrors++;
        console.error(
          `UPDATE ${token.slice(0, 10)} -> ${from.slice(0, 10)} failed: ${upErr.message}`,
        );
        continue;
      }
      updated++;
    }

    if (processed % 200 === 0 || processed === total) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = processed / elapsed;
      const remaining = ((total - processed) / Math.max(rate, 0.01)).toFixed(0);
      console.log(
        `[${processed}/${total}] updated=${updated} no_match=${skippedNoMatch} ` +
          `db_err=${dbErrors} scan_err=${scanErrors} | ${rate.toFixed(1)}/s | ETA ${remaining}s`,
      );
    }

    // Throttle: 50ms between block scans matches classify-flap pattern.
    const tookMs = Date.now() - startedAt;
    if (tookMs < 50) await new Promise((r) => setTimeout(r, 50 - tookMs));
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n─── Done ───');
  console.log(`Total time: ${elapsed}s`);
  console.log(`Processed: ${processed}/${total}`);
  console.log(`Updated:   ${updated}`);
  console.log(`No-match:  ${skippedNoMatch} (token not found in block logs — orphan)`);
  console.log(`Scan errors: ${scanErrors}`);
  console.log(`DB errors: ${dbErrors}`);
  console.log(`Unique txs cached: ${txFromCache.size}`);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
