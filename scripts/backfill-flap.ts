#!/usr/bin/env -S npx tsx --conditions react-server
// scripts/backfill-flap.ts
//
// Phase 12 Flap adapter, one-shot historical backfill (D-01).
// Reads TokenCreated events from Bitquery GraphQL (10K signup bonus points),
// reads per-token ERC20 decimals from chain (D-10 locked mechanism, same
// shape as lib/chains/flap-reads.ts batchReadDecimals, duplicated inline
// because tsx doesn't resolve Next.js @/ path aliases by default), upserts
// into flap_tokens with source='bitquery_backfill' and decimals from chain
// (fallback to 18 on revert), then writes the final block into
// flap_indexer_state so the native cron resumes from there (D-03 warmup handoff).
//
// Run locally: BITQUERY_API_KEY=<key> npx tsx scripts/backfill-flap.ts
// NOT for production, D-06 locks this to .env local only.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, fallback } from 'viem';
import { bsc } from 'viem/chains';

// Avoid direct import from '@/lib/...' to keep script node-runnable without Next.js
// resolver. Instead, duplicate the minimum constants + helpers we need.
// This trade-off is acceptable for a one-shot script.

const FLAP_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0'.toLowerCase();
const FLAP_PORTAL_DEPLOY_BLOCK = 39_980_228n;
const SCAN_WINDOW = 250_000n;
const DECIMALS_BATCH_SIZE = 500;

const BITQUERY_ENDPOINT = 'https://streaming.bitquery.io/graphql';

// ERC20 decimals ABI, identical to lib/chains/flap-reads.ts batchReadDecimals
// internal constant, duplicated inline per D-10 mechanism.
const ERC20_DECIMALS_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

// ═══════════════════════════════════════════════
// Multicall result types (mirrors lib/chains/flap-reads.ts L142-144)
//
// Viem's heterogeneous multicall return shape doesn't infer well over
// `as never` contracts, so we re-type the result after the call.
// `allowFailure: true` preserves runtime safety.
// ═══════════════════════════════════════════════

type MulticallSuccess<T> = { status: 'success'; result: T };
type MulticallFailure = { status: 'failure'; error?: { message?: string } };
type RawMulticallResult<T> = MulticallSuccess<T> | MulticallFailure;

// ═══════════════════════════════════════════════
// Env validation
// ═══════════════════════════════════════════════

function validateEnv(): void {
  const missing: string[] = [];
  const required = [
    'BITQUERY_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BSC_RPC_URL',
  ];
  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    console.error('MISSING env vars:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      '\nBITQUERY_API_KEY: get one at https://bitquery.io (signup bonus gives 10K points).',
    );
    console.error('BSC_RPC_URL: reuse the production Alchemy endpoint or public BSC RPC.');
    process.exit(1);
  }
}

validateEnv();

// ═══════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const bscClient = createPublicClient({
  chain: bsc,
  transport: fallback(
    process.env.BSC_RPC_URL!.split(',').map((u) => http(u.trim(), { timeout: 15_000 })),
    { rank: true },
  ),
});

// ═══════════════════════════════════════════════
// D-10 helper: read ERC20.decimals() for many tokens in chunked multicall.
//
// Same shape as lib/chains/flap-reads.ts batchReadDecimals export (Plan 02).
// Duplicated inline because tsx doesn't resolve `@/lib/...` path aliases
// without Next.js config. Returns `(number | null)[]` parallel to input,
// null at any index where the decimals() call reverted or the contract
// doesn't implement ERC20.decimals. Caller falls back to 18 on null.
//
// Chunked at 500 per multicall to keep individual RPC payloads sane.
// ═══════════════════════════════════════════════

async function readDecimalsBatch(tokens: string[]): Promise<(number | null)[]> {
  if (tokens.length === 0) return [];

  const out: (number | null)[] = [];
  for (let i = 0; i < tokens.length; i += DECIMALS_BATCH_SIZE) {
    const slice = tokens.slice(i, i + DECIMALS_BATCH_SIZE);
    const chunkRaw = await bscClient.multicall({
      contracts: slice.map((token) => ({
        address: token as `0x${string}`,
        abi: ERC20_DECIMALS_ABI,
        functionName: 'decimals',
      })) as never,
      allowFailure: true,
    });
    const chunk = chunkRaw as Array<RawMulticallResult<number | bigint>>;
    for (const result of chunk) {
      if (result.status === 'success') {
        out.push(Number(result.result));
      } else {
        out.push(null);
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════
// Bitquery query
// ═══════════════════════════════════════════════

const BITQUERY_QUERY = `
query FlapTokenCreatedBackfill($portal: String!, $fromBlock: Int!, $toBlock: Int!) {
  EVM(dataset: combined, network: bsc) {
    Events(
      where: {
        LogHeader: { Address: { is: $portal } }
        Log: { Signature: { Name: { is: "TokenCreated" } } }
        Block: { Number: { ge: $fromBlock, le: $toBlock } }
      }
    ) {
      Block { Number Time }
      Transaction { Hash }
      Arguments {
        Name Type
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_Address_Value_Arg { address }
        }
      }
      Log { Signature { Name Signature } }
    }
  }
}
`;

// ═══════════════════════════════════════════════
// Types for Bitquery response
// ═══════════════════════════════════════════════

interface BitqueryArg {
  Name: string;
  Type: string;
  Value: {
    integer?: string;
    string?: string;
    address?: string;
  };
}

interface BitqueryEvent {
  Block: { Number: string; Time: string };
  Transaction: { Hash: string };
  Arguments: BitqueryArg[];
  Log: { Signature: { Name: string; Signature: string } };
}

interface BitqueryResponse {
  data?: { EVM?: { Events?: BitqueryEvent[] } };
  errors?: Array<{ message: string }>;
}

// ═══════════════════════════════════════════════
// Defensive argument parser (RESEARCH.md L522-526)
// ═══════════════════════════════════════════════

interface ParsedArgs {
  creator: string;
  tokenAddress: string;
  ts: number;
  nonce: string;
  name: string;
  symbol: string;
  meta: string;
}

function parseArgs(args: BitqueryArg[]): ParsedArgs | null {
  const byName = new Map(args.map((a) => [a.Name, a]));

  const creator = byName.get('creator')?.Value.address?.toLowerCase();
  const tokenAddress = byName.get('token')?.Value.address?.toLowerCase();
  const ts = byName.get('ts')?.Value.integer;
  const nonce = byName.get('nonce')?.Value.integer;
  const name = byName.get('name')?.Value.string ?? '';
  const symbol = byName.get('symbol')?.Value.string ?? '';
  const meta = byName.get('meta')?.Value.string ?? '';

  if (!creator || !/^0x[a-f0-9]{40}$/.test(creator)) return null;
  if (!tokenAddress || !/^0x[a-f0-9]{40}$/.test(tokenAddress)) return null;
  if (!ts || !nonce) return null;

  return {
    creator,
    tokenAddress,
    ts: parseInt(ts, 10),
    nonce,
    name,
    symbol,
    meta,
  };
}

// ═══════════════════════════════════════════════
// Fetch one window from Bitquery
// ═══════════════════════════════════════════════

async function fetchWindow(
  fromBlock: bigint,
  toBlock: bigint,
  signal: AbortSignal,
): Promise<BitqueryEvent[]> {
  const response = await fetch(BITQUERY_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.BITQUERY_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: BITQUERY_QUERY,
      variables: {
        portal: FLAP_PORTAL,
        fromBlock: Number(fromBlock),
        toBlock: Number(toBlock),
      },
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Bitquery HTTP ${response.status}: ${body.slice(0, 500)}`);
    process.exit(1);
  }

  const json = (await response.json()) as BitqueryResponse;
  if (json.errors && json.errors.length > 0) {
    console.error('Bitquery GraphQL errors:', json.errors);
    process.exit(1);
  }

  return json.data?.EVM?.Events ?? [];
}

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════

async function runBackfill(): Promise<void> {
  const controller = new AbortController();
  process.on('SIGINT', () => {
    console.log('\nSIGINT received, aborting.');
    controller.abort();
  });

  const head = await bscClient.getBlockNumber();
  let from = FLAP_PORTAL_DEPLOY_BLOCK;
  let totalEvents = 0;
  let skippedRows = 0;
  let decimalsFallbackCount = 0;
  let windowCount = 0;
  const startTime = Date.now();

  console.log(
    `Starting Flap backfill: ${from} -> ${head} (${head - from} blocks, ${SCAN_WINDOW}-block windows)`,
  );
  console.log(
    `Estimated window count: ${Math.ceil(Number(head - from) / Number(SCAN_WINDOW))}`,
  );

  while (from <= head) {
    if (controller.signal.aborted) {
      console.log('Aborted. Partial progress preserved in flap_indexer_state.');
      process.exit(130);
    }

    const to = from + SCAN_WINDOW - 1n > head ? head : from + SCAN_WINDOW - 1n;
    windowCount++;

    let events: BitqueryEvent[];
    try {
      events = await fetchWindow(from, to, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) process.exit(130);
      console.error(
        `Window ${from}-${to} fetch failed:`,
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    }

    if (events.length > 0) {
      // Parse defensively first (skip malformed rows without failing the batch).
      const parsedList: Array<{ parsed: ParsedArgs; block: string }> = [];
      for (const ev of events) {
        const parsed = parseArgs(ev.Arguments);
        if (!parsed) {
          skippedRows++;
          continue;
        }
        parsedList.push({ parsed, block: ev.Block.Number });
      }

      if (parsedList.length > 0) {
        // D-10: read per-token decimals from chain via multicall BEFORE upsert.
        const tokens = parsedList.map((p) => p.parsed.tokenAddress);
        const decimalsResults = await readDecimalsBatch(tokens);

        const rows = parsedList.map((p, i) => {
          const resolved = decimalsResults[i];
          if (resolved === null || resolved === undefined) {
            decimalsFallbackCount++;
            // D-10 observability: breadcrumb on fallback, never hard-fail.
            console.warn(
              `non-standard decimals, using fallback: token=${p.parsed.tokenAddress.slice(
                0,
                10,
              )} resolved_decimals=18 fallback=true`,
            );
          }
          return {
            token_address: p.parsed.tokenAddress,
            creator: p.parsed.creator,
            vault_address: null as string | null,
            vault_type: 'unknown' as const,
            decimals: resolved ?? 18,
            source: 'bitquery_backfill' as const,
            created_block: parseInt(p.block, 10),
            indexed_at: new Date().toISOString(),
          };
        });

        const { error } = await supabase
          .from('flap_tokens')
          .upsert(rows, { onConflict: 'token_address', ignoreDuplicates: true });

        if (error) {
          console.error(`Upsert failed window ${from}-${to}:`, error.message);
          process.exit(1);
        }

        totalEvents += rows.length;
      }
    }

    // Advance cursor AFTER successful upsert (D-03 handoff).
    const { error: cursorErr } = await supabase
      .from('flap_indexer_state')
      .upsert(
        { contract_address: FLAP_PORTAL, last_scanned_block: Number(to) },
        { onConflict: 'contract_address' },
      );
    if (cursorErr) {
      console.error(`Cursor advance failed window ${from}-${to}:`, cursorErr.message);
      process.exit(1);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `Window ${windowCount} [${from}-${to}]: ${events.length} events, upserted ${totalEvents}, skipped ${skippedRows}, decimals_fallback ${decimalsFallbackCount}, elapsed ${elapsed}s`,
    );

    from = to + 1n;
  }

  console.log('\nBackfill complete.');
  console.log(`  Total events upserted: ${totalEvents}`);
  console.log(`  Skipped (malformed): ${skippedRows}`);
  console.log(`  Decimals fallback count (resolved null -> 18): ${decimalsFallbackCount}`);
  console.log(`  Windows processed: ${windowCount}`);
  console.log(
    `  Cursor written: flap_indexer_state[${FLAP_PORTAL}].last_scanned_block = ${head}`,
  );
  console.log(
    `\nNext: the cron at /api/cron/index-flap will resume from ${head + 1n} at next run (*/10 * * * *).`,
  );
}

runBackfill().catch((err) => {
  console.error('runBackfill crashed:', err);
  process.exit(1);
});
