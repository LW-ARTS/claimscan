import 'server-only';
import type {
  PlatformAdapter,
  TokenFee,
  CreatorToken,
  ResolvedWallet,
} from './types';
import type { IdentityProvider } from '@/lib/supabase/types';
import { createServiceClient } from '@/lib/supabase/service';
import { asBscAddress } from '@/lib/chains/types';
import { resolveHandler, fundRecipientHandler } from './flap-vaults';
import type { FlapVaultKind } from './flap-vaults/types';
import { createLogger } from '@/lib/logger';
import { sanitizeTokenSymbol, sanitizeTokenName } from '@/lib/utils';

const log = createLogger('flap');

function isEvmAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

// Shape of a row read from flap_tokens (service client bypasses RLS).
// Mirrors migration 034 column list, extended in Phase 13 (migration 036) with
// fund-recipient columns. NULL on non-fund-recipient rows.
interface FlapTokenRow {
  token_address: string;
  creator: string;
  vault_address: string | null;
  vault_type: FlapVaultKind;
  decimals: number;
  source: string;
  created_block: number;
  // Phase 13: fund-recipient extension columns. NULL for non-fund-recipient rows.
  recipient_address: string | null;
  tax_processor_address: string | null;
}

export const flapAdapter: PlatformAdapter = {
  platform: 'flap',
  chain: 'bsc',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,
  // getHistoricalFees does the live on-chain multicall per row, so cached + live
  // are the same shape. Orchestrator skips getLiveUnclaimedFees round-trip.
  historicalCoversLive: true,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider,
  ): Promise<ResolvedWallet[]> {
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isEvmAddress(wallet)) return [];
    const lower = wallet.toLowerCase();

    try {
      const supabase = createServiceClient();
      // Phase 13 D-03/D-04: dual-axis WHERE clause. A wallet can be the deployer
      // (creator) of vault-having tokens AND/OR the recipient (recipient_address)
      // of fund-recipient tokens. The two branches are mutually exclusive on
      // vault_type, so a wallet that's both deployer and recipient of the same
      // token only matches via the second branch (no row duplication).
      // `lower` is regex-validated as 0x[a-f0-9]{40} above (isEvmAddress) — no
      // PostgREST injection vector even with raw template-literal interpolation.
      const { data, error } = await supabase
        .from('flap_tokens')
        .select('token_address, vault_type, recipient_address, tax_processor_address')
        .or(
          `and(creator.eq.${lower},vault_type.neq.fund-recipient),and(vault_type.eq.fund-recipient,recipient_address.eq.${lower})`,
        );

      if (error) {
        log.warn('getCreatorTokens.db_error', {
          wallet: lower.slice(0, 10),
          error: error.message,
        });
        return [];
      }
      if (!data || data.length === 0) return [];

      return data.map((row) => ({
        tokenAddress: row.token_address,
        chain: 'bsc' as const,
        platform: 'flap' as const,
        symbol: null,     // v1: no metadata cache; badge-row UI is sufficient
        name: null,
        imageUrl: null,
      }));
    } catch (err) {
      log.warn('getCreatorTokens.crashed', {
        wallet: lower.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  },

  async getHistoricalFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
    if (!isEvmAddress(wallet)) return [];
    const lower = wallet.toLowerCase();
    const userBranded = asBscAddress(wallet);

    let rows: FlapTokenRow[] = [];
    try {
      const supabase = createServiceClient();
      // Phase 13 D-03/D-04: dual-axis WHERE clause. Same OR clause as
      // getCreatorTokens above; SELECT widens to include the new fund-recipient
      // columns (recipient_address, tax_processor_address) for the dispatch loop.
      const { data, error } = await supabase
        .from('flap_tokens')
        .select(
          'token_address, creator, recipient_address, tax_processor_address, vault_address, vault_type, decimals, source, created_block',
        )
        .or(
          `and(creator.eq.${lower},vault_type.neq.fund-recipient),and(vault_type.eq.fund-recipient,recipient_address.eq.${lower})`,
        );

      if (error) {
        log.warn('getHistoricalFees.db_error', {
          wallet: lower.slice(0, 10),
          error: error.message,
        });
        return [];
      }
      rows = (data as FlapTokenRow[] | null) ?? [];
    } catch (err) {
      log.warn('getHistoricalFees.crashed', {
        wallet: lower.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    if (rows.length === 0) return [];

    // Phase 13: split rows by axis. Fund-recipient rows have NULL vault_address
    // by design (no VaultPortal registration — see RESEARCH §"Critical
    // Architectural Deviation") and must skip the vault_address-null filter
    // that drops unclassified vault-having rows.
    //
    // - fundRecipientRows: vault_type='fund-recipient' AND recipient + tax
    //   processor both populated (D-05 null-recipient skip + defensive guard
    //   on tax_processor_address — should not happen per migration 036
    //   invariant but cheap defense).
    // - vaultHavingRows: vault_type != 'fund-recipient' AND vault_address
    //   classified (existing Phase 12 filter — drops unclassified rows that
    //   would render zero balance with no badge, confusing UX).
    const fundRecipientRows = rows.filter(
      (r) =>
        r.vault_type === 'fund-recipient' &&
        r.recipient_address !== null &&
        r.tax_processor_address !== null,
    );
    const vaultHavingRows = rows.filter(
      (r) => r.vault_type !== 'fund-recipient' && r.vault_address !== null,
    );
    if (fundRecipientRows.length === 0 && vaultHavingRows.length === 0) return [];

    // Both dispatch loops push into the same `fees` accumulator.
    const fees: TokenFee[] = [];

    // Phase 13: fund-recipient path. Direct dispatch (NOT through HANDLERS
    // registry) because fundRecipientHandler.readCumulative(taxProcessor) has
    // a different signature from FlapVaultHandler.readClaimable(vault, user).
    // totalUnclaimed=0 because fees are already in the recipient's wallet
    // (auto-forwarded on each swap, no claim action needed).
    //
    // CLAUDE.md "Stat card vs filter invariant" holds: the Unclaimed filter
    // (`totalUnclaimed > 0`) correctly drops fund-recipient rows; recipient
    // profile still sees them in the all-rows view via the "Auto-forwarded"
    // badge (D-12). totalEarned = totalClaimed = cumulative WBNB forwarded
    // (= native BNB 1:1 post-unwrap, per RESEARCH §"Verified ABI Set").
    for (const row of fundRecipientRows) {
      if (signal?.aborted) break;
      try {
        const taxProcessorBranded = asBscAddress(
          row.tax_processor_address! as `0x${string}`,
        );
        const cumulative = await fundRecipientHandler.readCumulative(
          taxProcessorBranded,
          signal,
        );
        // D-12: skip zero-balance rows to reduce visual noise (consistent
        // with vault-having path). Fund-recipient rows with cumulative===0
        // have never received an auto-forward — surface them only after
        // first dispatch.
        if (cumulative === 0n) continue;
        const cumulativeStr = cumulative.toString();
        fees.push({
          tokenAddress: row.token_address,
          tokenSymbol: null,        // v1: no symbol cache; UI shows address prefix
          chain: 'bsc',
          platform: 'flap',
          totalEarned: cumulativeStr,
          totalClaimed: cumulativeStr,
          totalUnclaimed: '0',
          totalEarnedUsd: null,     // D-11: no spot price reads (flash-loan risk)
          royaltyBps: null,
          vaultType: 'fund-recipient',
        });
      } catch (err) {
        log.warn('flap.fund_recipient_dispatch_failed', {
          token: row.token_address.slice(0, 10),
          taxProcessor: row.tax_processor_address?.slice(0, 10) ?? null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Existing vault-having path — unchanged dispatch body, only the
    // iteration source variable is renamed (classified → vaultHavingRows).
    // Each handler already catches errors internally and returns 0n on
    // failure — we don't need to wrap in Promise.allSettled here because
    // individual failures become 0n and get filtered by the D-12
    // zero-balance filter below.
    for (const row of vaultHavingRows) {
      if (signal?.aborted) break;
      const handler = resolveHandler(row.vault_type);
      const vaultBranded = asBscAddress(row.vault_address! as `0x${string}`);
      const claimable = await handler.readClaimable(vaultBranded, userBranded, signal);

      // D-12: skip zero-balance rows to reduce visual noise for big creators.
      if (claimable === 0n) continue;

      fees.push({
        tokenAddress: row.token_address,
        tokenSymbol: null,          // v1: no symbol cache; UI shows address prefix
        chain: 'bsc',
        platform: 'flap',
        totalEarned: claimable.toString(),
        totalClaimed: '0',          // BSC scan window insufficient for Claimed history (out of scope v1)
        totalUnclaimed: claimable.toString(),
        totalEarnedUsd: null,       // D-11: no spot price reads (flash-loan risk)
        royaltyBps: null,
        vaultType: row.vault_type,  // D-04: badge routing
      });
    }

    log.info('getHistoricalFees.ok', {
      wallet: lower.slice(0, 10),
      total_rows: rows.length,
      fund_recipient_rows: fundRecipientRows.length,
      vault_having_rows: vaultHavingRows.length,
      non_zero: fees.length,
    });

    return fees;
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
    const fees = await flapAdapter.getHistoricalFees(wallet, signal);
    return fees.filter((f) => BigInt(f.totalUnclaimed) > 0n);
  },
};

// Suppress unused-import warnings for helpers we're saving for future expansion:
// sanitizeTokenSymbol / sanitizeTokenName are wired for when backfill script
// populates token_symbol / token_name columns (out of scope v1).
void sanitizeTokenSymbol;
void sanitizeTokenName;
