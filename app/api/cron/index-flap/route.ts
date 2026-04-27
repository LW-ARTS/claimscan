import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { bscClient } from '@/lib/chains/bsc';
import {
  scanTokenCreated,
  batchReadDecimals,
  assertDeployBlockNotPlaceholder,
} from '@/lib/chains/flap-reads';
import {
  resolveVaultKind,
  lookupVaultAddress,
  detectFundRecipient,
} from '@/lib/platforms/flap-vaults';
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

// 5K matches the safe BSC public-RPC eth_getLogs ceiling (Clanker uses the
// same in lib/chains/bsc.ts). 50K caused 65s timeouts on public RPCs.
//
// Trade-off: BSC mints ~28K blocks/day, so a 5K daily cron LAGS ~23K
// blocks/day until either (a) we move to chunked parallel getLogs (matches
// clanker-reads.ts pattern), or (b) we move to a paid archive RPC, or
// (c) Vercel Pro unlocks finer cron granularity. Until then, missed
// tokens get filled by backfill scripts when Bitquery quota refills.
const SCAN_WINDOW = 5_000n;
const LAG_WARNING_BLOCKS = 500_000n;
const WALLCLOCK_MS = 55_000;
// Set to 5 (was 50): each classification fires 2-3 RPC reads via Alchemy.
// 50 classifications × 3 reads × free-tier latency (1-3s) = blew the 60s budget.
// 5/run still drains the unknown-vault queue at ~1825/yr with daily cron;
// good enough until a paid RPC unlocks bigger batches.
const MAX_CLASSIFICATIONS_PER_RUN = 5;

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
    let fundRecipientMatched = 0;
    let dbErrors = 0;
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
            // Resolve vault via tryGetVault (struct-aware, fail-soft).
            // lookupVaultAddress returns null when token isn't registered in
            // current portal (legacy tokens minted before VaultPortal deploy).
            const vaultAddr = await lookupVaultAddress(
              FLAP_VAULT_PORTAL,
              row.token_address as BscAddress,
            );
            if (!vaultAddr) {
              // Phase 13 Wave 3: when no vault is registered, the token may
              // still be a fund-recipient launch (auto-forward fees as native
              // BNB to a recipient EOA via per-token TaxProcessor clones).
              // Probe-ladder runs 4 RPC reads (lookupVaultAddress + taxProcessor
              // + marketAddress + getCode); each guarded by try/catch returning
              // matched=false. RPC budget concern: detectFundRecipient internally
              // re-calls lookupVaultAddress (Step 1), so we pay that lookup
              // twice per still-unknown row — acceptable at MAX_CLASSIFICATIONS_PER_RUN=5
              // (~5 × 4 reads = 20 reads/run, fits Alchemy free tier).
              // Future optimization: thread the prior vaultAddr=null result
              // into detectFundRecipient as a hint to skip Step 1.
              const fr = await detectFundRecipient(
                row.token_address as `0x${string}`,
              );
              if (fr.matched && fr.marketAddress && fr.taxProcessor) {
                // Match: persist as fund-recipient. vault_address stays null
                // (no vault to point at). Row exits the pending-classify
                // query because vault_type='unknown' filter no longer matches —
                // no sentinel needed, no risk of re-probe loops.
                const { error: frErr } = await supabase
                  .from('flap_tokens')
                  .update({
                    vault_type: 'fund-recipient',
                    recipient_address: fr.marketAddress.toLowerCase(),
                    tax_processor_address: fr.taxProcessor.toLowerCase(),
                  })
                  .eq('token_address', row.token_address);
                if (frErr) {
                  childLog.warn('classify.fund_recipient_update_failed', {
                    token: row.token_address.slice(0, 10),
                    error: frErr.message,
                  });
                  Sentry.captureException(frErr, {
                    extra: { token: row.token_address.slice(0, 10), branch: 'fund-recipient' },
                  });
                  dbErrors = dbErrors + 1;
                  continue;
                }

                classifiedCount++;
                fundRecipientMatched++;
                childLog.info('classify.fund_recipient_matched', {
                  token: row.token_address.slice(0, 10),
                  recipient: fr.marketAddress.slice(0, 10),
                  taxProcessor: fr.taxProcessor.slice(0, 10),
                });
                continue;
              }

              // Not a fund-recipient either — truly unknown. Mark with sentinel
              // so we don't retry every run.
              const { error: sentinelErr } = await supabase
                .from('flap_tokens')
                .update({
                  vault_address: '0x0000000000000000000000000000000000000000',
                  vault_type: 'unknown',
                })
                .eq('token_address', row.token_address);
              if (sentinelErr) {
                childLog.warn('classify.sentinel_update_failed', {
                  token: row.token_address.slice(0, 10),
                  error: sentinelErr.message,
                });
                Sentry.captureException(sentinelErr, {
                  extra: { token: row.token_address.slice(0, 10), branch: 'sentinel' },
                });
                dbErrors = dbErrors + 1;
              }
              continue;
            }

            const kind = await resolveVaultKind(
              FLAP_VAULT_PORTAL,
              row.token_address as BscAddress,
              vaultAddr,
            );

            const { error: kindErr } = await supabase
              .from('flap_tokens')
              .update({
                vault_address: vaultAddr.toLowerCase(),
                vault_type: kind,
              })
              .eq('token_address', row.token_address);
            if (kindErr) {
              childLog.warn('classify.vault_kind_update_failed', {
                token: row.token_address.slice(0, 10),
                error: kindErr.message,
              });
              Sentry.captureException(kindErr, {
                extra: { token: row.token_address.slice(0, 10), branch: 'vault-kind' },
              });
              dbErrors = dbErrors + 1;
              continue;
            }

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
      fund_recipient_matched: fundRecipientMatched,
      db_errors: dbErrors,
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
