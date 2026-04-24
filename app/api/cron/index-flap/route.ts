import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { bscClient } from '@/lib/chains/bsc';
import {
  scanTokenCreated,
  batchReadDecimals,
  assertDeployBlockNotPlaceholder,
} from '@/lib/chains/flap-reads';
import { resolveVaultKind } from '@/lib/platforms/flap-vaults';
import { VAULT_PORTAL_ABI } from '@/lib/platforms/flap-vaults/types';
import {
  FLAP_PORTAL,
  FLAP_VAULT_PORTAL,
  FLAP_PORTAL_DEPLOY_BLOCK,
} from '@/lib/constants-evm';
import type { BscAddress } from '@/lib/chains/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron:index-flap');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ═══════════════════════════════════════════════
// Tunables — values match RESEARCH.md L321-358 under corrected BSC block time (~1.06s post-Lorentz).
// 250K blocks ≈ ~3 days of BSC history per run.
// 500K block lag ≈ ~6 days (Interpretation A: alert when >2× scan window behind).
// 55_000ms wallclock leaves 5s headroom under Vercel Hobby 60s hard limit.
// ═══════════════════════════════════════════════

const SCAN_WINDOW = 250_000n;
const LAG_WARNING_BLOCKS = 500_000n;
const WALLCLOCK_MS = 55_000;
const MAX_CLASSIFICATIONS_PER_RUN = 50;

export async function GET(request: Request) {
  // 1. Bearer auth (timingSafeEqual)
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createServiceClient();
  const portalLower = FLAP_PORTAL.toLowerCase();

  // Abort signal propagated into batchReadDecimals so long multicalls can
  // yield early near the wallclock limit. We never actually fire abort() in
  // this request flow, but the signal plumbing keeps the primitive honest.
  const abortCtl = new AbortController();

  try {
    // 2. Runtime guard: refuse to do any work with placeholder constant.
    //    Runs AFTER verifyCronSecret so unauthorized callers get 401, not a
    //    500 leaking internals. Inside the try/catch so the throw is caught
    //    by the outer handler and returned as 500 with the actual error
    //    message — developer sees "FLAP_PORTAL_DEPLOY_BLOCK is placeholder"
    //    in the response body.
    assertDeployBlockNotPlaceholder();

    // 3. Read cursor (bootstrap at deploy block).
    //    maybeSingle() is used (not .single()) because first run has no cursor
    //    row — maybeSingle() returns {data: null} for empty result, .single()
    //    would error.
    const { data: state } = await supabase
      .from('flap_indexer_state')
      .select('last_scanned_block')
      .eq('contract_address', portalLower)
      .maybeSingle();

    const lastScanned = state
      ? BigInt(state.last_scanned_block)
      : FLAP_PORTAL_DEPLOY_BLOCK - 1n;
    const head = await bscClient.getBlockNumber();
    let from = lastScanned + 1n;

    // 4. Observability: compute lag + optional Sentry warning (D-08).
    const lag = head - lastScanned;
    const childLog = log.child({
      lag_blocks: String(lag),
      last_scanned: String(lastScanned),
      head: String(head),
    });
    childLog.info('indexer.run_start');
    if (lag > LAG_WARNING_BLOCKS) {
      Sentry.captureMessage('Flap indexer lag high', {
        level: 'warning',
        extra: {
          lag_blocks: String(lag),
          last_scanned: String(lastScanned),
          head: String(head),
          threshold_blocks: String(LAG_WARNING_BLOCKS),
        },
      });
    }

    // 5. Scan loop (serial windows, wallclock-guarded).
    let windowsProcessed = 0;
    let tokensDiscovered = 0;
    let decimalsFallbackCount = 0;
    while (from <= head && Date.now() - started < WALLCLOCK_MS) {
      const to =
        from + SCAN_WINDOW - 1n > head ? head : from + SCAN_WINDOW - 1n;

      const logs = await scanTokenCreated({
        portal: FLAP_PORTAL,
        fromBlock: from,
        toBlock: to,
      });

      if (logs.length > 0) {
        // D-10: read decimals from chain BEFORE upserting. batchReadDecimals
        // uses allowFailure: true internally so individual reverts return null;
        // we fallback to 18 per-row with a breadcrumb log for observability.
        const tokensToRead: BscAddress[] = logs.map((l) => l.tokenAddress);
        const decimalsResults = await batchReadDecimals(tokensToRead, {
          signal: abortCtl.signal,
        });

        const rows = logs.map((l, i) => {
          const resolved = decimalsResults[i];
          if (resolved === null || resolved === undefined) {
            decimalsFallbackCount++;
            childLog.warn('non-standard decimals, using fallback', {
              token: l.tokenAddress.slice(0, 10),
              resolvedDecimals: 18,
              fallback: true,
            });
          }
          return {
            token_address: l.tokenAddress.toLowerCase(),
            creator: l.creator.toLowerCase(),
            vault_address: null as string | null,
            vault_type: 'unknown' as const,
            decimals: resolved ?? 18,
            source: 'native_indexer' as const,
            created_block: Number(l.block),
            indexed_at: new Date().toISOString(),
          };
        });

        const { error: upsertError } = await supabase
          .from('flap_tokens')
          .upsert(rows, {
            onConflict: 'token_address',
            ignoreDuplicates: true,
          });

        if (upsertError) {
          childLog.error('upsert_flap_tokens_failed', {
            from: String(from),
            to: String(to),
            row_count: rows.length,
            error: upsertError.message,
          });
          // Do NOT advance cursor — next run will retry the same window.
          return NextResponse.json(
            {
              ok: false,
              error: 'upsert_failed',
              from: String(from),
              to: String(to),
            },
            { status: 500 },
          );
        }

        tokensDiscovered += rows.length;
      }

      // Advance cursor even when zero logs — empty ranges are legitimate.
      // Cursor is advanced AFTER upsert succeeds — at-least-once guarantee.
      // If upsert succeeds but cursor write fails, next run re-scans the
      // window; idempotent upsert (ignoreDuplicates: true) handles the dupe.
      const { error: cursorError } = await supabase
        .from('flap_indexer_state')
        .upsert(
          {
            contract_address: portalLower,
            last_scanned_block: Number(to),
          },
          { onConflict: 'contract_address' },
        );
      if (cursorError) {
        childLog.error('cursor_advance_failed', {
          to: String(to),
          error: cursorError.message,
        });
        return NextResponse.json(
          { ok: false, error: 'cursor_advance_failed', to: String(to) },
          { status: 500 },
        );
      }

      childLog.info('indexer.window_scanned', {
        from: String(from),
        to: String(to),
        found: logs.length,
      });
      from = to + 1n;
      windowsProcessed++;
    }

    // 6. Classify pending unknowns (as many as we can in remaining wallclock).
    //    Bounded by MAX_CLASSIFICATIONS_PER_RUN AND remaining wallclock. Rows
    //    left unresolved stay `vault_type='unknown'` and get picked up next run.
    let classifiedCount = 0;
    if (Date.now() - started < WALLCLOCK_MS) {
      const { data: pending, error: pendingErr } = await supabase
        .from('flap_tokens')
        .select('token_address')
        .eq('vault_type', 'unknown')
        .is('vault_address', null)
        .limit(MAX_CLASSIFICATIONS_PER_RUN);

      if (pendingErr) {
        childLog.warn('classify_query_failed', {
          error: pendingErr.message,
        });
      } else if (pending && pending.length > 0) {
        for (const row of pending) {
          if (Date.now() - started >= WALLCLOCK_MS) break;

          try {
            // Resolve vault address first via VaultPortal.getVault(taxToken).
            const vaultAddr = (await bscClient.readContract({
              address: FLAP_VAULT_PORTAL as `0x${string}`,
              abi: VAULT_PORTAL_ABI,
              functionName: 'getVault',
              args: [row.token_address as `0x${string}`],
            })) as `0x${string}`;

            // Skip if vault address is zero — token was emitted but no vault
            // has been created yet (rare but possible at atomic launch path).
            if (vaultAddr === '0x0000000000000000000000000000000000000000') {
              continue;
            }

            const kind = await resolveVaultKind(
              FLAP_VAULT_PORTAL,
              row.token_address as BscAddress,
              vaultAddr as BscAddress,
            );

            await supabase
              .from('flap_tokens')
              .update({
                vault_address: vaultAddr.toLowerCase(),
                vault_type: kind,
              })
              .eq('token_address', row.token_address);

            classifiedCount++;
          } catch (err) {
            childLog.warn('classify_one_failed', {
              token: row.token_address.slice(0, 10),
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      head_block: String(head),
      last_scanned: String(from - 1n),
      windows_processed: windowsProcessed,
      tokens_discovered: tokensDiscovered,
      decimals_fallback_count: decimalsFallbackCount,
      classified_count: classifiedCount,
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    log.error('indexer.run_crashed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
