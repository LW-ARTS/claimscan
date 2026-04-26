/**
 * Phase 12 follow-up — classify all flap_tokens rows where vault_type='unknown'.
 *
 * Why: the cron route (/api/cron/index-flap) is currently disabled on Hobby
 * because Vercel times out on the classification loop (each classification
 * does 2-3 Alchemy free-tier reads × MAX_CLASSIFICATIONS_PER_RUN = 50 → 60s
 * budget exhausted). Locally there is no 60s ceiling, so we run sequentially
 * and let it take however long it takes (~10-15 min for 1012 tokens).
 *
 * What it does (one-shot, idempotent):
 *   1. Read all rows where vault_type='unknown' AND vault_address IS NULL
 *   2. For each:
 *      a. VaultPortal.getVault(token) → vault address
 *      b. resolveVaultKind(portal, token, vault) → 'base-v1' | 'base-v2' | 'unknown'
 *      c. UPDATE flap_tokens SET vault_address=..., vault_type=...
 *   3. Idempotent: re-running only re-classifies rows where vault_address IS NULL.
 *
 * Run: BSC_RPC_URL=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *      npx tsx scripts/classify-flap.ts
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
// Load .env.local first (project convention), fall back to .env if .env.local
// is absent. Avoids needing a .env symlink (which breaks Vercel builds).
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

// ─── env validation ──────────────────────────────────────────────
const required = ['BSC_RPC_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`MISSING env var: ${k}`);
    console.error('\nRequired:');
    console.error('  BSC_RPC_URL: Alchemy BSC endpoint (vercel env pull)');
    console.error('  SUPABASE_SERVICE_ROLE_KEY: from .env.local');
    console.error('  NEXT_PUBLIC_SUPABASE_URL: from .env.local');
    process.exit(1);
  }
}

// ─── flap constants (mirrors lib/constants-evm.ts) ────────────────
const FLAP_VAULT_PORTAL = '0x90497450f2a706f1951b5bdda52B4E5d16f34C06' as Address;

// ─── ABIs (mirrors lib/platforms/flap-vaults/types.ts) ────────────
//
// PHASE 12.1 FIX: getVault(address) returns a `VaultInfo memory` STRUCT, not
// a bare address. The original ABI (returns address) decodes the response's
// 32-byte offset prefix (0x20) as the vault, returning a garbage address.
//
// We use `tryGetVault(address)` which returns `(bool found, VaultInfo info)`
// — fail-soft semantics. The struct's first field is `vault: address`.
// We decode just `(bool, address)` because viem allows ignoring trailing
// struct fields when the offset+head layout is preserved (verified via direct
// eth_call against fixture token 0x7372bf3b...7777 → vault 0x321354...).
const VAULT_PORTAL_ABI = parseAbi([
  'function getVaultCategory(address taxToken) view returns (uint8)',
]);
// Selector for `tryGetVault(address)` = 0xd493059b. Response layout:
//   bytes 0..32:   bool found
//   bytes 32..64:  offset to VaultInfo struct (= 0x40)
//   bytes 64..84:  address vault (12-byte left-pad + 20 bytes)
//   bytes 84..onward: remaining struct fields (factory, riskLevel, …)
const TRY_GET_VAULT_SELECTOR = '0xd493059b' as const;
const V2_PROBE_ABI = parseAbi([
  'function vaultUISchema() view returns (string)',
]);
const V1_PROBE_ABI = parseAbi([
  'function claimable(address user) view returns (uint256)',
]);

// VaultCategory enum from BscScan-verified IVaultPortal.sol — both currently
// defined values map to 'unknown' (orthogonal axis, see types.ts comments).
// Probe fallback handles v1/v2 discrimination at runtime.
const VAULT_CATEGORY_MAP: Record<number, 'base-v1' | 'base-v2' | 'unknown'> = {
  0: 'unknown',
  1: 'unknown',
};

// ─── BSC client (Alchemy via BSC_RPC_URL) ─────────────────────────
const RPC_URLS = process.env.BSC_RPC_URL!.split(',').map((u) => u.trim());
const bscClient = createPublicClient({
  chain: bsc,
  transport: RPC_URLS.length === 1
    ? http(RPC_URLS[0], { timeout: 15_000, retryCount: 2 })
    : fallback(RPC_URLS.map((u) => http(u, { timeout: 15_000 })), { rank: false }),
});

// ─── Supabase service client ──────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ─── classification logic (mirrors flap-vaults/index.ts:resolveVaultKind) ──
async function getVaultAddress(taxToken: Address): Promise<Address | null> {
  // Manual eth_call + raw decode to avoid viem's strict struct-decoder mismatch.
  // tryGetVault returns (bool found, VaultInfo info). We only need `found` and
  // the first struct field (vault address).
  const tokenPadded = taxToken.slice(2).toLowerCase().padStart(64, '0');
  const data = (TRY_GET_VAULT_SELECTOR + tokenPadded) as Hex;
  try {
    const result = await bscClient.call({
      to: FLAP_VAULT_PORTAL,
      data,
    });
    if (!result.data || result.data.length < 2 + 64 * 3) return null;
    // bytes 0..32 → bool found
    const [found] = decodeAbiParameters(
      [{ type: 'bool' }],
      ('0x' + result.data.slice(2, 2 + 64)) as Hex,
    ) as [boolean];
    if (!found) return null;
    // bytes 64..96 → vault address (slot of first struct field; address = last 20 bytes)
    const vaultSlot = result.data.slice(2 + 64 * 2, 2 + 64 * 3);
    const vault = ('0x' + vaultSlot.slice(24)) as Address; // strip 12-byte left-pad
    if (vault.toLowerCase() === '0x0000000000000000000000000000000000000000') return null;
    return vault;
  } catch {
    return null;
  }
}

async function resolveVaultKind(
  taxToken: Address,
  vaultAddress: Address,
): Promise<'base-v1' | 'base-v2' | 'unknown'> {
  // 1. Primary lookup
  try {
    const cat = await bscClient.readContract({
      address: FLAP_VAULT_PORTAL,
      abi: VAULT_PORTAL_ABI,
      functionName: 'getVaultCategory',
      args: [taxToken],
    });
    const mapped = VAULT_CATEGORY_MAP[Number(cat)];
    if (mapped && mapped !== 'unknown') return mapped;
  } catch {
    // primary reverted — proceed to probe
  }

  // 2. V2 probe
  try {
    await bscClient.readContract({
      address: vaultAddress,
      abi: V2_PROBE_ABI,
      functionName: 'vaultUISchema',
    });
    return 'base-v2';
  } catch {
    // continue to V1 probe
  }

  // 3. V1 probe
  try {
    await bscClient.readContract({
      address: vaultAddress,
      abi: V1_PROBE_ABI,
      functionName: 'claimable',
      args: ['0x0000000000000000000000000000000000000000'],
    });
    return 'base-v1';
  } catch {
    // all probes failed
  }

  return 'unknown';
}

// ─── main loop ────────────────────────────────────────────────────
async function main() {
  const sampleLimit = process.env.SAMPLE_LIMIT
    ? Number.parseInt(process.env.SAMPLE_LIMIT, 10)
    : null;
  if (sampleLimit !== null && (!Number.isFinite(sampleLimit) || sampleLimit <= 0)) {
    console.error(`Invalid SAMPLE_LIMIT: ${process.env.SAMPLE_LIMIT}`);
    process.exit(1);
  }

  const sampleFromBlock = process.env.SAMPLE_FROM_BLOCK
    ? Number.parseInt(process.env.SAMPLE_FROM_BLOCK, 10)
    : null;
  const sampleOrderDesc = process.env.SAMPLE_ORDER_DESC === '1';

  // Pull rows that need classification:
  //   - vault_type='unknown' AND vault_address NULL → never probed (legacy)
  //   - vault_type='unknown' AND vault_address set (from VaultPortal backfill)
  //     → vault address known, just need V1/V2 probe
  // Exclude rows pre-flagged with the sentinel '0x0' (no-vault) so we don't
  // hammer the chain re-confirming proven-empty rows.
  const NO_VAULT_SENTINEL = '0x0000000000000000000000000000000000000000';
  let query = supabase
    .from('flap_tokens')
    .select('token_address,vault_address,created_block')
    .eq('vault_type', 'unknown')
    .neq('vault_address', NO_VAULT_SENTINEL);
  if (sampleFromBlock !== null) query = query.gte('created_block', sampleFromBlock);
  if (sampleOrderDesc) query = query.order('created_block', { ascending: false });
  if (sampleLimit !== null) query = query.limit(sampleLimit);
  const { data: rows, error } = await query;

  if (error) {
    console.error('Failed to query flap_tokens:', error.message);
    process.exit(1);
  }

  const total = rows?.length ?? 0;
  console.log(`Classifying ${total} unclassified Flap tokens...`);
  if (total === 0) {
    console.log('Nothing to classify. Exiting.');
    return;
  }

  let classified = 0;
  let baseV1 = 0;
  let baseV2 = 0;
  let unknownCount = 0;
  let noVault = 0;
  let dbErrors = 0;
  const started = Date.now();

  for (let i = 0; i < total; i++) {
    const row = rows![i];
    const token = row.token_address as Address;
    const preknownVault = row.vault_address as Address | null;
    const startedAt = Date.now();

    try {
      // If the VaultPortal backfill already populated vault_address, trust it
      // and skip the tryGetVault round-trip. We still need the V1/V2 probe.
      const vaultAddress = preknownVault ?? (await getVaultAddress(token));
      if (!vaultAddress) {
        // Token has no vault on the portal (rare — abandoned/edge case).
        // Mark it 'unknown' with a sentinel vault_address so we don't re-process.
        const { error: upErr } = await supabase
          .from('flap_tokens')
          .update({
            vault_address: '0x0000000000000000000000000000000000000000',
            vault_type: 'unknown',
          })
          .eq('token_address', token);
        if (upErr) {
          dbErrors++;
          console.error(`[${i + 1}/${total}] ${token.slice(0, 10)} db error: ${upErr.message}`);
          continue;
        }
        noVault++;
      } else {
        const kind = await resolveVaultKind(token, vaultAddress as Address);
        const { error: upErr } = await supabase
          .from('flap_tokens')
          .update({
            vault_address: (vaultAddress as Address).toLowerCase(),
            vault_type: kind,
          })
          .eq('token_address', token);
        if (upErr) {
          dbErrors++;
          console.error(`[${i + 1}/${total}] ${token.slice(0, 10)} db error: ${upErr.message}`);
          continue;
        }
        if (kind === 'base-v1') baseV1++;
        else if (kind === 'base-v2') baseV2++;
        else unknownCount++;
      }
      classified++;
    } catch (err) {
      console.error(
        `[${i + 1}/${total}] ${token.slice(0, 10)} chain error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Progress every 25 rows + ETA.
    if ((i + 1) % 25 === 0 || i === total - 1) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = ((total - i - 1) / rate).toFixed(0);
      console.log(
        `[${i + 1}/${total}] v1=${baseV1} v2=${baseV2} unknown=${unknownCount} no-vault=${noVault} | ${rate.toFixed(1)}/s | ETA ${remaining}s`,
      );
    }

    // Throttle: 50ms between calls = 20/s — well under Alchemy free's 660 CU/s.
    const tookMs = Date.now() - startedAt;
    if (tookMs < 50) await new Promise((r) => setTimeout(r, 50 - tookMs));
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n─── Done ───');
  console.log(`Total time: ${elapsed}s`);
  console.log(`Classified: ${classified}/${total}`);
  console.log(`  base-v1: ${baseV1}`);
  console.log(`  base-v2: ${baseV2}`);
  console.log(`  unknown (probes failed): ${unknownCount}`);
  console.log(`  no-vault (sentinel 0x0): ${noVault}`);
  console.log(`DB errors: ${dbErrors}`);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
