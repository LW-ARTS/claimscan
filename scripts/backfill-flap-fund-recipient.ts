#!/usr/bin/env -S npx tsx --conditions react-server
/**
 * scripts/backfill-flap-fund-recipient.ts
 *
 * Phase 13 — Bitquery one-shot enumeration of fund-recipient launches as a
 * completeness safety net (D-08).
 *
 * What it does (one-shot, idempotent):
 *   1. Pulls Portal.TokenCreated events from Bitquery (same query family + windowed
 *      shape as scripts/backfill-flap.ts, mirroring Phase 12 D-06).
 *   2. For each token, runs the 4-step fund-recipient probe inline
 *      (lookupVaultAddress null + token.taxProcessor() ok + taxProcessor.marketAddress() ok
 *      + getCode marketAddress is empty/EOA).
 *   3. Upserts matched tokens with vault_type='fund-recipient' + recipient_address +
 *      tax_processor_address (lowercased) + source='bitquery_backfill'.
 *
 * Local-only (BITQUERY_API_KEY in .env.local). Descartável after one run.
 *
 * Run: BITQUERY_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *      BSC_RPC_URL=... npx tsx scripts/backfill-flap-fund-recipient.ts
 *
 * NOT for production — D-06/D-08 lock BITQUERY_API_KEY to .env.local only.
 *
 * UPSERT semantics divergence from Phase 12 backfill-flap.ts:
 *   Phase 12 uses `ignoreDuplicates: true` (skip already-indexed). Phase 13 uses
 *   `onConflict: 'token_address'` WITHOUT ignoreDuplicates → authoritative overwrite.
 *   Rationale: this script's whole point is to write the fund-recipient verdict +
 *   recipient/taxProcessor addresses. Re-running must be authoritative for those
 *   columns; for already-correct rows the upsert is a no-op write.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
// Load .env.local first (project convention), fall back to .env if absent.
if (existsSync('.env.local')) loadEnv({ path: '.env.local' });
else loadEnv();

import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  fallback,
  http,
  parseAbi,
  decodeAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { bsc } from 'viem/chains';
import { z } from 'zod';

// ═══════════════════════════════════════════════
// Inline constants — mirrors lib/constants-evm.ts + lib/platforms/flap-vaults/types.ts
//
// tsx doesn't resolve `@/lib/...` aliases without Next.js config. This trade-off is
// acceptable for a one-shot script. Same pattern as scripts/backfill-flap.ts.
// ═══════════════════════════════════════════════

const FLAP_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0'.toLowerCase();
const FLAP_VAULT_PORTAL = '0x90497450f2a706f1951b5bdda52B4E5d16f34C06' as Address;
const FLAP_PORTAL_DEPLOY_BLOCK = 39_980_228n;
const SCAN_WINDOW = 250_000n;

const BITQUERY_ENDPOINT = 'https://streaming.bitquery.io/graphql';

// ABIs duplicated inline (mirrors lib/platforms/flap-vaults/types.ts FLAP_TAX_TOKEN_V3_ABI + TAX_PROCESSOR_ABI)
const FLAP_TAX_TOKEN_V3_ABI = parseAbi([
  'function taxProcessor() view returns (address)',
]);

const TAX_PROCESSOR_ABI = parseAbi([
  'function marketAddress() view returns (address)',
  'function totalQuoteSentToMarketing() view returns (uint256)',
]);

// VaultPortal.tryGetVault selector (mirrors scripts/classify-flap.ts L75 + lib/platforms/flap-vaults/vault-portal.ts).
// Returns (bool found, VaultInfo info). For fund-recipient tokens: found=false.
const TRY_GET_VAULT_SELECTOR = '0xd493059b' as const;

// ═══════════════════════════════════════════════
// Env validation (mirrors scripts/backfill-flap.ts validateEnv)
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
    console.error('Missing env vars:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      '\nBITQUERY_API_KEY: get one at https://bitquery.io (signup bonus gives 10K points).',
    );
    console.error('BSC_RPC_URL: reuse the production Alchemy endpoint or public BSC RPC.');
    console.error('Set in .env.local — see .env.example for shape.');
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

const RPC_URLS = process.env.BSC_RPC_URL!.split(',').map((u) => u.trim());
const bscClient = createPublicClient({
  chain: bsc,
  transport: RPC_URLS.length === 1
    ? http(RPC_URLS[0], { timeout: 15_000, retryCount: 2 })
    : fallback(RPC_URLS.map((u) => http(u, { timeout: 15_000 })), { rank: false }),
});

// ═══════════════════════════════════════════════
// Bitquery query — IDENTICAL filter shape to scripts/backfill-flap.ts L150-178.
//
// Uses LogHeader.Address + Log.Signature.Name (NOT Log.SmartContract — that path
// is wrong for streaming.bitquery.io/graphql per Phase 12 verified shape).
// ═══════════════════════════════════════════════

const BITQUERY_QUERY = `
query FlapTokenCreatedFundRecipientBackfill($portal: String!, $fromBlock: String!, $toBlock: String!) {
  EVM(dataset: combined, network: bsc) {
    Events(
      where: {
        LogHeader: { Address: { is: $portal } }
        Log: { Signature: { Name: { is: "TokenCreated" } } }
        Block: { Number: { ge: $fromBlock, le: $toBlock } }
      }
    ) {
      Block { Number Time }
      Transaction { Hash From }
      Arguments {
        Name Type
        Value {
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
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
// Zod schema — T-13-22 (Bitquery response spoof) mitigation per RESEARCH §Security Domain.
//
// Validates each Bitquery record before processing. Any record failing validation
// increments `skipped` counter, never persisted.
// ═══════════════════════════════════════════════

const BitqueryArgValueSchema = z.object({
  bigInteger: z.string().optional(),
  integer: z.string().optional(),
  string: z.string().optional(),
  address: z.string().optional(),
});

const BitqueryArgSchema = z.object({
  Name: z.string(),
  Type: z.string().optional(),
  Value: BitqueryArgValueSchema,
});

const BitqueryRecordSchema = z.object({
  Block: z.object({
    Number: z.string(),
    Time: z.string().optional(),
  }),
  Transaction: z.object({
    Hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    From: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
  Arguments: z.array(BitqueryArgSchema),
  Log: z.object({
    Signature: z.object({
      Name: z.string(),
      Signature: z.string().optional(),
    }),
  }).optional(),
});

type BitqueryRecord = z.infer<typeof BitqueryRecordSchema>;

interface BitqueryResponse {
  data?: { EVM?: { Events?: unknown[] } };
  errors?: Array<{ message: string }>;
}

// ═══════════════════════════════════════════════
// Fetch one window from Bitquery (mirrors scripts/backfill-flap.ts fetchWindow L262-303)
// ═══════════════════════════════════════════════

async function fetchWindow(
  fromBlock: bigint,
  toBlock: bigint,
  signal: AbortSignal,
): Promise<unknown[]> {
  const response = await fetch(BITQUERY_ENDPOINT, {
    method: 'POST',
    headers: {
      // Bitquery v2 (streaming.bitquery.io) accepts both auth methods:
      // - OAuth bearer token (ory_at_*) — Authorization: Bearer <token>
      // - Legacy API key — X-API-KEY: <key>
      ...(process.env.BITQUERY_API_KEY!.startsWith('ory_at_')
        ? { Authorization: `Bearer ${process.env.BITQUERY_API_KEY!}` }
        : { 'X-API-KEY': process.env.BITQUERY_API_KEY! }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: BITQUERY_QUERY,
      variables: {
        portal: FLAP_PORTAL,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
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
// Inline lookupVaultAddress (mirrors scripts/classify-flap.ts getVaultAddress L107-134)
//
// Manual eth_call + raw decode to avoid viem's strict struct-decoder mismatch on
// VaultPortal.tryGetVault's VaultInfo struct return shape.
// ═══════════════════════════════════════════════

async function lookupVaultAddress(taxToken: Address): Promise<Address | null> {
  const tokenPadded = taxToken.slice(2).toLowerCase().padStart(64, '0');
  const data = (TRY_GET_VAULT_SELECTOR + tokenPadded) as Hex;
  try {
    const result = await bscClient.call({
      to: FLAP_VAULT_PORTAL,
      data,
    });
    if (!result.data || result.data.length < 2 + 64 * 3) return null;
    const [found] = decodeAbiParameters(
      [{ type: 'bool' }],
      ('0x' + result.data.slice(2, 2 + 64)) as Hex,
    ) as [boolean];
    if (!found) return null;
    const vaultSlot = result.data.slice(2 + 64 * 2, 2 + 64 * 3);
    const vault = ('0x' + vaultSlot.slice(24)) as Address;
    if (vault.toLowerCase() === '0x0000000000000000000000000000000000000000') return null;
    return vault;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Inline detectFundRecipient (mirrors lib/platforms/flap-vaults/fund-recipient.ts)
//
// 4-step probe:
//   1. lookupVaultAddress(taxToken) === null   (no vault registered)
//   2. taxToken.taxProcessor() succeeds         (Flap tax token)
//   3. taxProcessor.marketAddress() succeeds    (TaxProcessor wired)
//   4. bscClient.getCode(marketAddress) is empty / '0x'  (recipient is EOA)
// ═══════════════════════════════════════════════

interface FundRecipientResult {
  matched: boolean;
  taxProcessor?: Address;
  marketAddress?: Address;
}

async function detectFundRecipient(taxToken: Address): Promise<FundRecipientResult> {
  // Step 1: must NOT be a vault-having token.
  const vault = await lookupVaultAddress(taxToken);
  if (vault !== null) return { matched: false };

  // Step 2: token must expose taxProcessor().
  let taxProcessor: Address;
  try {
    const raw = (await bscClient.readContract({
      address: taxToken,
      abi: FLAP_TAX_TOKEN_V3_ABI,
      functionName: 'taxProcessor',
    })) as Address;
    taxProcessor = raw;
  } catch {
    return { matched: false };
  }

  // Step 3: TaxProcessor must expose marketAddress().
  let marketAddress: Address;
  try {
    const raw = (await bscClient.readContract({
      address: taxProcessor,
      abi: TAX_PROCESSOR_ABI,
      functionName: 'marketAddress',
    })) as Address;
    marketAddress = raw;
  } catch {
    return { matched: false };
  }

  // Zero-address guard: reject before getCode to avoid ghost fund-recipient rows.
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  if (marketAddress.toLowerCase() === ZERO_ADDRESS) {
    return { matched: false };
  }

  // Step 4: marketAddress must be EOA (no bytecode).
  let code: `0x${string}` | undefined;
  try {
    code = await bscClient.getCode({ address: marketAddress });
  } catch {
    return { matched: false };
  }
  const isEOA = !code || code === '0x';
  if (!isEOA) return { matched: false };

  return { matched: true, taxProcessor, marketAddress };
}

// ═══════════════════════════════════════════════
// Argument parser — mirrors scripts/backfill-flap.ts parseArgs L229-256.
// Uses EXACT name 'token' (NOT a heuristic regex) — verified Phase 12 arg name.
// ═══════════════════════════════════════════════

interface ParsedToken {
  tokenAddress: string;
  txFrom: string;
  block: number;
}

function parseRecord(rec: BitqueryRecord): ParsedToken | null {
  const byName = new Map(rec.Arguments.map((a) => [a.Name, a]));
  const tokenArg = byName.get('token');
  const tokenAddress = tokenArg?.Value.address?.toLowerCase();
  if (!tokenAddress || !/^0x[a-f0-9]{40}$/.test(tokenAddress)) return null;

  // Transaction.From is the user EOA that signed the create tx (= tx.from).
  // The event arg `creator` is the immediate caller-contract (FLAP_VAULT_PORTAL
  // in the standard flow), so we MUST use From here — adapter joins flap_tokens
  // by `creator` and would otherwise orphan rows from the real wallet (audit
  // 2026-04-26, mirrors backfill-flap.ts L196-208 + L376-381).
  const txFrom = rec.Transaction.From.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(txFrom)) return null;

  const block = parseInt(rec.Block.Number, 10);
  if (!Number.isFinite(block) || block <= 0) return null;

  return { tokenAddress, txFrom, block };
}

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════

async function main(): Promise<void> {
  const controller = new AbortController();
  process.on('SIGINT', () => {
    console.log('\nSIGINT received, aborting.');
    controller.abort();
  });

  const startedMs = Date.now();
  let fetched = 0;
  let matched = 0;
  let upserted = 0;
  let skipped = 0;

  // Allow scoping the backfill via env to skip dead historical ranges.
  const fromOverride = process.env.BACKFILL_FROM_BLOCK
    ? BigInt(process.env.BACKFILL_FROM_BLOCK)
    : null;

  const head = await bscClient.getBlockNumber();
  let from = fromOverride ?? FLAP_PORTAL_DEPLOY_BLOCK;
  let windowCount = 0;

  console.log(
    `Starting Flap fund-recipient backfill: ${from} → ${head} (${head - from} blocks, ${SCAN_WINDOW}-block windows)`,
  );
  console.log(
    `Estimated window count: ${Math.ceil(Number(head - from) / Number(SCAN_WINDOW))}`,
  );

  while (from <= head) {
    if (controller.signal.aborted) {
      console.log('Aborted. No cursor advance — re-run resumes from FLAP_PORTAL_DEPLOY_BLOCK.');
      process.exit(130);
    }

    const to = from + SCAN_WINDOW - 1n > head ? head : from + SCAN_WINDOW - 1n;
    windowCount++;

    let events: unknown[];
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

    fetched += events.length;

    if (events.length > 0) {
      // Validate + parse each record (Zod first, then arg extraction).
      for (const ev of events) {
        const parsed = BitqueryRecordSchema.safeParse(ev);
        if (!parsed.success) {
          skipped++;
          continue;
        }
        const tk = parseRecord(parsed.data);
        if (!tk) {
          skipped++;
          continue;
        }

        // Run the 4-step fund-recipient probe.
        const fr = await detectFundRecipient(tk.tokenAddress as Address);
        if (!fr.matched) {
          // Not a fund-recipient token — skip silently (intended: ~96.6% per RESEARCH §Universe Sizing).
          continue;
        }
        matched++;

        // Authoritative upsert (NOT ignoreDuplicates — see file header comment).
        const { error: upErr } = await supabase
          .from('flap_tokens')
          .upsert(
            {
              token_address: tk.tokenAddress,
              creator: tk.txFrom,
              vault_address: null,
              vault_type: 'fund-recipient' as const,
              recipient_address: (fr.marketAddress as Address).toLowerCase(),
              tax_processor_address: (fr.taxProcessor as Address).toLowerCase(),
              source: 'bitquery_backfill' as const,
              created_block: tk.block,
              indexed_at: new Date().toISOString(),
            },
            { onConflict: 'token_address' },
          );
        if (upErr) {
          console.error(`Upsert failed for ${tk.tokenAddress}: ${upErr.message}`);
          skipped++;
          continue;
        }
        upserted++;
      }
    }

    const elapsed = Math.round((Date.now() - startedMs) / 1000);
    console.log(
      `Window ${windowCount} [${from}-${to}]: ${events.length} events, matched ${matched}, upserted ${upserted}, skipped ${skipped}, elapsed ${elapsed}s`,
    );

    from = to + 1n;
  }

  const elapsed_ms = Date.now() - startedMs;
  console.log('\n─── Done ───');
  console.log(`Windows processed: ${windowCount}`);
  console.log(`Events fetched:    ${fetched}`);
  console.log(`Matched FR:        ${matched}`);
  console.log(`Upserted:          ${upserted}`);
  console.log(`Skipped:           ${skipped}`);
  console.log(`Elapsed:           ${(elapsed_ms / 1000).toFixed(1)}s`);

  // D-18 structured single-line JSON for log aggregator parsing.
  console.log(JSON.stringify({
    event: 'fund_recipient_backfill_complete',
    fetched,
    matched,
    upserted,
    skipped,
    elapsed_ms,
  }));
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
