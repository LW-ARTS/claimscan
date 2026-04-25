#!/usr/bin/env -S npx tsx --conditions react-server
// scripts/sanity-flap-backfill.ts
//
// Phase 12 Flap adapter, backfill gap sanity check (D-07).
// Samples N random 250K-block windows in the Portal's lifetime; for each,
// compares Bitquery event count vs viem getLogs event count; reports
// aggregate diff %. Purely read-only.
//
// Run locally after backfill-flap.ts completes:
//   BITQUERY_API_KEY=<key> BSC_RPC_URL=... npx tsx scripts/sanity-flap-backfill.ts
//
// Exit codes:
//   0: diff < 1% aggregate, OR 1-5% with warning
//   1: diff > 5% (HARD FAIL, investigate)

import 'dotenv/config';
import { createPublicClient, http, fallback, parseAbiItem } from 'viem';
import { bsc } from 'viem/chains';

const FLAP_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0'.toLowerCase();
const FLAP_PORTAL_DEPLOY_BLOCK = 39_980_228n;
const SCAN_WINDOW = 250_000n;
const SAMPLE_COUNT = parseInt(process.env.SAMPLE_COUNT ?? '10', 10);
const BITQUERY_ENDPOINT = 'https://streaming.bitquery.io/graphql';

const FLAP_TOKEN_CREATED_EVENT = parseAbiItem(
  'event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)',
);

// ═══════════════════════════════════════════════
// Env
// ═══════════════════════════════════════════════

function validateEnv(): void {
  const missing: string[] = [];
  const required = ['BITQUERY_API_KEY', 'BSC_RPC_URL'];
  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    console.error('MISSING env vars:');
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
}

validateEnv();

// ═══════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════

const bscLogsClient = createPublicClient({
  chain: bsc,
  transport: fallback(
    process.env.BSC_RPC_URL!.split(',').map((u) => http(u.trim(), { timeout: 15_000 })),
    { rank: true },
  ),
});

// ═══════════════════════════════════════════════
// Bitquery query (count only, lighter on points)
// ═══════════════════════════════════════════════

const COUNT_QUERY = `
query FlapTokenCreatedCount($portal: String!, $fromBlock: Int!, $toBlock: Int!) {
  EVM(dataset: combined, network: bsc) {
    Events(
      where: {
        LogHeader: { Address: { is: $portal } }
        Log: { Signature: { Name: { is: "TokenCreated" } } }
        Block: { Number: { ge: $fromBlock, le: $toBlock } }
      }
    ) {
      Block { Number }
    }
  }
}
`;

interface BitqueryCountResponse {
  data?: { EVM?: { Events?: Array<{ Block: { Number: string } }> } };
  errors?: Array<{ message: string }>;
}

async function countBitquery(
  fromBlock: bigint,
  toBlock: bigint,
  signal: AbortSignal,
): Promise<number> {
  const response = await fetch(BITQUERY_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.BITQUERY_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: COUNT_QUERY,
      variables: { portal: FLAP_PORTAL, fromBlock: Number(fromBlock), toBlock: Number(toBlock) },
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Bitquery HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const json = (await response.json()) as BitqueryCountResponse;
  if (json.errors) {
    throw new Error(`Bitquery errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data?.EVM?.Events?.length ?? 0;
}

async function countViem(fromBlock: bigint, toBlock: bigint): Promise<number> {
  const logs = await bscLogsClient.getLogs({
    address: FLAP_PORTAL as `0x${string}`,
    event: FLAP_TOKEN_CREATED_EVENT,
    fromBlock,
    toBlock,
  });
  return logs.length;
}

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════

async function runSanity(): Promise<void> {
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort());

  // For sampling we need the current head.
  const bscClient = createPublicClient({
    chain: bsc,
    transport: fallback(
      process.env.BSC_RPC_URL!.split(',').map((u) => http(u.trim(), { timeout: 15_000 })),
      { rank: true },
    ),
  });
  const head = await bscClient.getBlockNumber();

  const lifetime = head - FLAP_PORTAL_DEPLOY_BLOCK;
  const maxWindowStart = head - SCAN_WINDOW;
  console.log(
    `Sampling ${SAMPLE_COUNT} random 250K-block windows in Portal lifetime ${FLAP_PORTAL_DEPLOY_BLOCK}-${head} (${lifetime} blocks)\n`,
  );

  let totalBitquery = 0;
  let totalViem = 0;
  const diffs: Array<{ from: bigint; to: bigint; bq: number; vm: number; diffPct: number }> = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    if (controller.signal.aborted) process.exit(130);

    // Random start block within [DEPLOY_BLOCK, head - SCAN_WINDOW]
    const range = maxWindowStart - FLAP_PORTAL_DEPLOY_BLOCK;
    const randomOffset = BigInt(Math.floor(Math.random() * Number(range)));
    const from = FLAP_PORTAL_DEPLOY_BLOCK + randomOffset;
    const to = from + SCAN_WINDOW - 1n;

    const [bq, vm] = await Promise.all([
      countBitquery(from, to, controller.signal),
      countViem(from, to),
    ]);

    const max = Math.max(bq, vm);
    const diffPct = max === 0 ? 0 : (Math.abs(bq - vm) / max) * 100;
    diffs.push({ from, to, bq, vm, diffPct });
    totalBitquery += bq;
    totalViem += vm;

    const flag = diffPct > 5 ? ' WARN ' : '      ';
    console.log(
      `${flag}Window [${from}-${to}]: Bitquery=${bq}, viem=${vm}, diff=${diffPct.toFixed(2)}%`,
    );
  }

  const aggregateMax = Math.max(totalBitquery, totalViem);
  const aggregateDiff =
    aggregateMax === 0 ? 0 : (Math.abs(totalBitquery - totalViem) / aggregateMax) * 100;
  console.log(`\n=== Aggregate across ${SAMPLE_COUNT} windows ===`);
  console.log(`  Bitquery total: ${totalBitquery}`);
  console.log(`  viem total:     ${totalViem}`);
  console.log(`  Aggregate diff: ${aggregateDiff.toFixed(2)}%`);

  if (aggregateDiff > 5) {
    console.error(
      '\nHARD FAIL: aggregate diff > 5%, investigate Bitquery coverage before trusting backfill.',
    );
    process.exit(1);
  }
  if (aggregateDiff > 1) {
    console.warn(
      '\nSOFT WARN: aggregate diff > 1%, acceptable but worth reviewing per-window diffs above.',
    );
  } else {
    console.log('\nOK: aggregate diff < 1%, Bitquery backfill coverage is acceptable.');
  }
}

runSanity().catch((err) => {
  console.error('runSanity crashed:', err);
  process.exit(1);
});
