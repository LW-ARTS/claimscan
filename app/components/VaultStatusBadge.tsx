import { AlertTriangle, CheckCircle2 } from 'lucide-react';

type VaultStatusBadgeProps = {
  vaultType: string | null | undefined;
};

/**
 * Shared badge component keyed by Flap vault_type (D-13).
 *
 * - 'fund-recipient' → emerald "Auto-forwarded" pill (Phase 13). Communicates that fees
 *   already arrived in the wallet via swap-time auto-forwarding; no claim action exists.
 * - 'unknown' → amber "Claim method unknown" pill (refactored from Phase 12 inline badge
 *   in TokenFeeTable.tsx). DOM shape preserved 1:1 from the original inline.
 * - 'base-v1' / 'base-v2' / 'split-vault' / null / undefined → returns null (no badge).
 *
 * Presentational server component (no client directive) — runs in either environment, mirrors ClaimStatusBadge.
 */
export function VaultStatusBadge({ vaultType }: VaultStatusBadgeProps) {
  if (vaultType === 'fund-recipient') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400"
        aria-label="Auto-forwarded fees"
        title="Fees auto-forwarded to your wallet on each swap, no claim needed"
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Auto-forwarded
      </span>
    );
  }
  if (vaultType === 'unknown') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400"
        aria-label="Claim method unknown"
        title="Vault ABI not recognized by ClaimScan. Go to flap.sh to claim"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Claim method unknown
      </span>
    );
  }
  return null;
}
