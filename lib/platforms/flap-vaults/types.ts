import type { BscAddress } from '@/lib/chains/types';
import { parseAbi } from 'viem';

// ═══════════════════════════════════════════════
// FlapVaultKind
//
// String union MUST match the CHECK constraint applied by migrations 035 + 036:
//   CHECK (vault_type IN ('base-v1', 'base-v2', 'split-vault', 'fund-recipient', 'unknown'))
// (originally introduced by migration 034 with the first three values; extended
// in 12.1 to include 'split-vault' — the third Flap vault kind, EIP-1167 minimal
// proxy of impl 0xd6a92acc... which exposes userBalances(address) -> (uint128
// accumulated, uint128 claimed) instead of claimable(address) -> uint256;
// extended in Phase 13 (migration 036) to include 'fund-recipient' — tokens
// that bypass VaultPortal entirely and auto-forward fees as native BNB to a
// recipient EOA via per-token TaxProcessor clones.)
// If you add a new kind, write a new migration extending the CHECK constraint.
// ═══════════════════════════════════════════════

// Phase 13: 'fund-recipient' added — tokens with no VaultPortal registration that
// auto-forward fees as native BNB to a recipient EOA via per-token TaxProcessor.
// See RESEARCH §"Critical Architectural Deviation". Migration 036 extends the
// flap_tokens.vault_type and fee_records.vault_type CHECK constraints with this value.
export type FlapVaultKind = 'base-v1' | 'base-v2' | 'split-vault' | 'fund-recipient' | 'unknown';

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

// Phase 13 note: 'fund-recipient' is intentionally absent from this map. The
// VaultPortal does not register fund-recipient tokens (lookupVaultAddress returns
// found=false), so getVaultCategory is never reached for them. Detection happens
// at token-level in detectFundRecipient() — see lib/platforms/flap-vaults/index.ts
// (Wave 3) and RESEARCH §"Revised Architecture".
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

// ═══════════════════════════════════════════════
// SPLITVAULT_USERBALANCES_ABI — Phase 12.1 SplitVault detection + read
//
// [VERIFIED: BscScan source at impl 0xd6a92acc0a5fd685c1cb3a464d44410dc90c5d25,
//  Solidity 0.8.24+commit.e11b9ed9.] struct UserBalance { uint128 accumulated;
//  uint128 claimed; }. Public mapping(address => UserBalance) compiles to:
//    function userBalances(address) view returns (uint128, uint128);
//
// Used as both (1) probe marker in resolveVaultKind() — SplitVault clones respond,
// V1/V2 vaults revert (mutual exclusion empirically verified, RESEARCH §"Probe
// Order Mutual Exclusion" L566-588); (2) read ABI in splitVaultHandler for
// claimable computation: accumulated - claimed (BNB native, 18 decimals).
// ═══════════════════════════════════════════════

export const SPLITVAULT_USERBALANCES_ABI = parseAbi([
  'function userBalances(address user) view returns (uint128 accumulated, uint128 claimed)',
]);

// ═══════════════════════════════════════════════
// FLAP_TAX_TOKEN_V3_ABI — Phase 13 token-level introspection
//
// FlapTaxTokenV3 is the impl behind every Flap-deployed tax token (EIP-1167 minimal
// proxy). The single method we need is `taxProcessor()` to reach the per-token
// TaxProcessor clone where recipient + accumulator live.
//
// [VERIFIED: bscscan.com/address/0x024f18294970b5c76c0691b87f138a0317156422 — verified 2026-04-26 #code]
// [VERIFIED: live RPC read on fixture 0x5f28b56a2f6e396a69fc912aec8d42d8afa17777]
// ═══════════════════════════════════════════════

export const FLAP_TAX_TOKEN_V3_ABI = parseAbi([
  'function taxProcessor() view returns (address)',
  'function dividendContract() view returns (address)',
  'function mainPool() view returns (address)',
]);

// ═══════════════════════════════════════════════
// TAX_PROCESSOR_ABI — Phase 13 fund-recipient detection + cumulative read
//
// The TaxProcessor is a per-token clone (impl 0x802b5888...). For fund-recipient
// tokens, marketAddress() is an EOA (the recipient) and totalQuoteSentToMarketing()
// is the monotonic uint256 accumulator of WBNB forwarded (= native BNB 1:1 post-unwrap).
//
// setReceivers() is documented (NOT called by ClaimScan) for D-09 mutability awareness.
// owner() is documented for the same reason. Recipient IS mutable; v1 escape hatch is
// `scripts/classify-flap.ts --token <addr>` for manual reclassification.
//
// [VERIFIED: bscscan.com/address/0x802b58885f7c25d9292f2dd2cbe3c332e2e14672 — verified 2026-04-26 #code]
// [VERIFIED: live RPC read on per-token clone 0xf9113d169a093E174b29776049638A6684F2C9a7]
// ═══════════════════════════════════════════════

export const TAX_PROCESSOR_ABI = parseAbi([
  // Read paths used by Phase 13:
  'function marketAddress() view returns (address)',
  'function totalQuoteSentToMarketing() view returns (uint256)',
  'function getQuoteToken() view returns (address)',
  'function feeReceiver() view returns (address)',
  'function dividendAddress() view returns (address)',
  // Write paths (NOT called by ClaimScan, documented for mutability awareness — D-09):
  'function setReceivers(address feeReceiver_, address marketAddress_, address dividendAddress_)',
  'function owner() view returns (address)',
]);
