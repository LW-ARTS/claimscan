import type { BscAddress } from '@/lib/chains/types';
import { parseAbi } from 'viem';

// ═══════════════════════════════════════════════
// FlapVaultKind
//
// String union MUST match the CHECK constraint in migration 034:
//   CHECK (vault_type IN ('base-v1', 'base-v2', 'unknown'))
// If you add a new kind, update the migration and re-run migration 034 or write
// migration 035 to relax/extend the constraint.
// ═══════════════════════════════════════════════

export type FlapVaultKind = 'base-v1' | 'base-v2' | 'unknown';

// ═══════════════════════════════════════════════
// FlapVaultHandler
//
// Each vault-kind ships a handler that knows how to read `claimable(user)` from
// that kind's ABI. Unknown handler returns 0n + fires Sentry warning.
// ═══════════════════════════════════════════════

export interface FlapVaultHandler {
  readonly kind: FlapVaultKind;
  readClaimable(
    vault: BscAddress,
    user: BscAddress,
    signal?: AbortSignal,
  ): Promise<bigint>;
}

// ═══════════════════════════════════════════════
// VaultPortal ABI — just what we call
//
// Source: BscScan verified impl at
//   https://bscscan.com/address/0x5f54c5ea7bf1c63e765e8406253fb02473d115a1#code
// Extracted 2026-04-24 from `File 1 of 28 : VaultPortal.sol` and
// `File 8 of 28 : IVaultPortal.sol` (line references below).
//
// getVaultCategory(taxToken) returns a uint8 encoding of `enum VaultCategory`
// defined in `IVaultPortal.sol` (see VAULT_CATEGORY_MAP below).
// ═══════════════════════════════════════════════

// NOTE: getVault(address) is intentionally OMITTED — it returns a VaultInfo
// struct (not a bare address), so viem's strict decoder mis-decodes. Use
// lookupVaultAddress() in flap-vaults/index.ts instead, which calls
// tryGetVault(address) and decodes the struct's first field manually.
export const VAULT_PORTAL_ABI = parseAbi([
  'function getVaultCategory(address taxToken) view returns (uint8)',
]);

// ═══════════════════════════════════════════════
// VaultCategory uint8 → FlapVaultKind map
//
// EXTRACTION: Opened https://bscscan.com/address/0x5f54c5ea7bf1c63e765e8406253fb02473d115a1#code
// on 2026-04-24. File `IVaultPortal.sol` (File 8 of 28) line ~4745 defines the
// enum verbatim:
//
//   /// @notice Category classification for vaults (8 bits)
//   /// @dev Used to categorize vaults by their type or functionality
//   enum VaultCategory {
//       NONE,                   // 0 - Not in any category (default)
//       TYPE_AI_ORACLE_POWERED  // 1 - AI Oracle powered vaults
//   }
//
// IMPORTANT SEMANTIC NOTE (deviation from research assumption):
//
// The `VaultCategory` axis is NOT a v1/v2/v3 discriminator. It is an ORTHOGONAL
// flag classifying vaults as oracle-powered vs default. The v1/v2/v3 distinction
// that this handler registry dispatches on is an interface-generation axis,
// captured at runtime by the method-probe fallback in `resolveVaultKind()`:
//
//   - `vaultUISchema()` responds      → base-v2 (new-interface marker)
//   - `claimable(0x0)` responds       → base-v1 (legacy-interface marker)
//   - both revert                     → unknown (handler fires Sentry D-16)
//
// As a result, BOTH currently-defined `VaultCategory` values map to `'unknown'`,
// which the `resolveVaultKind` implementation treats as "primary signal did not
// resolve — fall through to method-probe". This preserves the primary-signal
// contract (we DO call `getVaultCategory` first on every classification) while
// routing v1/v2 discrimination through the probe. If Flap later ships a V3
// interface under a NEW `VaultCategory` variant (e.g. 2: TYPE_V3_BOUNTY), add
// that mapping here and — if appropriate — a `'base-v3'` member to
// `FlapVaultKind`.
//
// MANDATORY: At least one numeric-keyed entry MUST exist. Empty `{}` is not
// shippable per Plan 03's Task 2 checkpoint. Two entries below satisfy that.
// ═══════════════════════════════════════════════

export const VAULT_CATEGORY_MAP: Record<number, FlapVaultKind> = {
  0: 'unknown', // NONE — default factory category; probe resolves v1 vs v2
  1: 'unknown', // TYPE_AI_ORACLE_POWERED — orthogonal oracle flag, probe still
                // resolves the interface generation; if probe also fails, the
                // unknown handler + D-16 Sentry warning is the correct outcome
                // for an unsupported vault shape.
};

// ═══════════════════════════════════════════════
// CLAIMABLE_ABI — shared by v1 + v2 handlers
//
// [ASSUMED] signature from RESEARCH.md L259-270. Primary vault impl
// TraitorBountyVault at 0xd5051e83100d57e8148230b1e8b429c7c1477f9f is
// UNVERIFIED on BscScan — no source to confirm. Standard VaultBase pattern
// uses this signature. If wrong, integration test (Plan 07) fails loudly;
// runtime degrades gracefully via unknown handler fallback.
// ═══════════════════════════════════════════════

export const CLAIMABLE_ABI = parseAbi([
  'function claimable(address user) view returns (uint256)',
]);

// ═══════════════════════════════════════════════
// V2_PROBE_ABI — minimal marker for fallback classification
//
// `vaultUISchema()` is assumed to be exposed only by VaultBaseV2 per
// RESEARCH.md L222. If V2 doesn't expose it, fallback falls through to
// 'unknown' which is survivable (display-only badge kicks in).
// ═══════════════════════════════════════════════

export const V2_PROBE_ABI = parseAbi([
  'function vaultUISchema() view returns (string)',
]);
