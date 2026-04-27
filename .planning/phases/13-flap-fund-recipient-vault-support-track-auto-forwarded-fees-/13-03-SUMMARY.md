---
phase: 13
plan: 03
subsystem: lib/platforms/flap-vaults
tags: [types, abi, supabase-schema, fund-recipient, wave-1]
requirements: [FR-01, FR-02]
dependency_graph:
  requires:
    - "Phase 12.1 FlapVaultKind base union (base-v1 | base-v2 | split-vault | unknown)"
    - "Phase 13-02 migration 036 applied to STAGING DB (flap_tokens.recipient_address + tax_processor_address columns)"
    - "RESEARCH §'Verified ABI Set' L235-265 (BscScan-verified ABIs for FlapTaxTokenV3 and TaxProcessor)"
  provides:
    - "FlapVaultKind union extended with 'fund-recipient' (5 values)"
    - "FLAP_TAX_TOKEN_V3_ABI export (taxProcessor / dividendContract / mainPool reads)"
    - "TAX_PROCESSOR_ABI export (5 reads + setReceivers/owner documented for D-09)"
    - "flap_tokens.recipient_address: string | null on Row/Insert/Update"
    - "flap_tokens.tax_processor_address: string | null on Row/Insert/Update"
    - "HANDLERS Record exhaustiveness preserved via 'fund-recipient': unknownHandler safety stub"
  affects:
    - "Wave 2 (Plan 13-04): handler implementation can import TAX_PROCESSOR_ABI + FlapVaultKind"
    - "Wave 3 (Plan 13-05): cron can write recipient_address + tax_processor_address columns"
    - "Wave 4 (Plan 13-06): adapter can read new columns + dispatch fund-recipient via direct import"
    - "TokenFee.vaultType union widened to accept 'fund-recipient' (Rule 3 propagation fix)"
tech-stack:
  added: []
  patterns:
    - "parseAbi-checked ABI const blocks with BscScan verification citation header (Phase 12.1 precedent)"
    - "Triplet Row/Insert/Update extension pattern (Supabase Database type)"
    - "Record<FlapVaultKind, FlapVaultHandler> exhaustiveness via documented safety-stub assignment"
key-files:
  created: []
  modified:
    - "lib/platforms/flap-vaults/types.ts"
    - "lib/platforms/flap-vaults/index.ts"
    - "lib/supabase/types.ts"
    - "lib/platforms/types.ts (Rule 3 fix — propagation of FlapVaultKind widening to TokenFee.vaultType union)"
decisions:
  - "Append-only ABI extension pattern: new ABIs added at the END of types.ts to preserve existing line numbers cited by other plans (PATTERNS.md L101-126 references)"
  - "HANDLERS map gets 'fund-recipient': unknownHandler safety stub (option (b) from PATTERNS.md L155) — minimum diff, defense-in-depth fallback if a future caller accidentally routes fund-recipient through resolveHandler"
  - "Did NOT extend VAULT_CATEGORY_MAP — fund-recipient bypasses VaultPortal entirely per RESEARCH §'Critical Architectural Deviation'; documentary comment added in lieu of code change"
  - "TokenFee.vaultType in lib/platforms/types.ts widened as Rule 3 (blocking issue) — without it, the FlapVaultKind extension would break Wave 4 adapter compile (lib/platforms/flap.ts:154 assigns row.vault_type to TokenFee.vaultType field)"
metrics:
  duration_min: 6
  completed: "2026-04-27T04:59:21Z"
  tasks_total: 3
  tasks_completed: 3
  files_modified: 4
  files_created: 0
  red_test_failures_intentional: 3
---

# Phase 13 Plan 03: Wave 1 — Type Extensions for Fund-Recipient Summary

Extended TypeScript type definitions so Waves 2-4 (handler / cron / adapter) can compile against the Phase 13 fund-recipient vault classification and the two new `flap_tokens` columns (`recipient_address`, `tax_processor_address`) introduced by migration 036.

## Tasks Executed

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Extend `FlapVaultKind` union + add `FLAP_TAX_TOKEN_V3_ABI` + `TAX_PROCESSOR_ABI` | `lib/platforms/flap-vaults/types.ts` | DONE |
| 2 | Resolve HANDLERS `Record` exhaustiveness via `'fund-recipient': unknownHandler` safety stub | `lib/platforms/flap-vaults/index.ts` | DONE |
| 3 | Extend `flap_tokens` Row/Insert/Update with `recipient_address` + `tax_processor_address` (literal union for `vault_type` widened with `'fund-recipient'`) | `lib/supabase/types.ts` | DONE |

## Verification Results

### TypeScript (`npx tsc --noEmit`)
Only the 3 expected RED test stub errors from Plan 13-01 remain (intentional — they will be resolved in Wave 2 when `lib/platforms/flap-vaults/fund-recipient.ts` is implemented):

```
lib/__tests__/integration/fund-recipient.test.ts(3,38): error TS2307: Cannot find module '@/lib/platforms/flap-vaults/fund-recipient' or its corresponding type declarations.
lib/__tests__/integration/fund-recipient.test.ts(4,10): error TS2305: Module '"@/lib/platforms/flap-vaults"' has no exported member 'detectFundRecipient'.
lib/__tests__/unit/flap-vaults.test.ts(43,10): error TS2305: Module '"@/lib/platforms/flap-vaults"' has no exported member 'detectFundRecipient'.
```

Pre-stash `tsc --noEmit` output was identical (same 3 errors, no others) — confirming our diff did NOT introduce any new type errors.

### Grep Presence Checks (all PASS)

```
PASS: 'fund-recipient' in flap-vaults/types.ts
PASS: FLAP_TAX_TOKEN_V3_ABI
PASS: TAX_PROCESSOR_ABI
PASS: totalQuoteSentToMarketing
PASS: marketAddress
PASS: HANDLERS fund-recipient stub
PASS: comment marker
PASS: Row recipient_address
PASS: Row tax_processor_address
PASS: Insert/Update recipient_address
PASS: Insert/Update tax_processor_address
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Widened `TokenFee.vaultType` union in `lib/platforms/types.ts`**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `lib/platforms/flap.ts:154` assigns `row.vault_type` (`FlapVaultKind`) to `TokenFee.vaultType` (a literal union). After Task 1 added `'fund-recipient'` to `FlapVaultKind`, this assignment failed with `TS2322: Type 'FlapVaultKind' is not assignable to type '"unknown" | "base-v1" | "base-v2" | "split-vault" | undefined'`.
- **Fix:** Added `'fund-recipient'` to the `vaultType?:` literal union in `lib/platforms/types.ts:59`. Updated the JSDoc comment to document the new value's semantics (Phase 13 token-level fund-recipient case, no VaultPortal registration; auto-forwarded native BNB tracked via TaxProcessor accumulator).
- **Files modified:** `lib/platforms/types.ts`
- **Why this is Rule 3:** The widening propagation is a direct consequence of this plan's `FlapVaultKind` extension. Without it, the Phase 13 Wave 4 adapter (`lib/platforms/flap.ts`) would not compile when the adapter is later modified to dispatch fund-recipient rows. The fix preserves the planner's design intent (UI badge routing on `vaultType`) and matches the pattern Phase 12.1 used when adding `'split-vault'` to the same union.

### Architectural Decisions

**HANDLERS Record exhaustiveness — chose option (b) per PATTERNS.md L155:**
The map gets a `'fund-recipient': unknownHandler` entry as a documented safety stub. Comment block above the map clearly states the adapter (Wave 4) will dispatch fund-recipient rows OUTSIDE the registry by importing `fundRecipientHandler` directly, and that this entry exists ONLY as a defense-in-depth fallback in case a future caller accidentally routes a fund-recipient row through `resolveHandler()`. This satisfies `Record<FlapVaultKind, FlapVaultHandler>` exhaustiveness without coupling the registry to the fund-recipient handler's incompatible signature (`readCumulative(taxProcessor)` vs the registry's `readClaimable(vault, user)`).

**VAULT_CATEGORY_MAP not extended:**
Per RESEARCH §"Critical Architectural Deviation", fund-recipient tokens have NO VaultPortal registration → `lookupVaultAddress(...) === null` → `getVaultCategory` is never reached for them. Detection happens at token-level via `detectFundRecipient()` (Wave 3). A documentary comment block was added above the existing map definition explaining the intentional absence.

**Append-only ABI placement:**
The two new ABI const blocks (`FLAP_TAX_TOKEN_V3_ABI`, `TAX_PROCESSOR_ABI`) were appended at the END of `lib/platforms/flap-vaults/types.ts`, after `SPLITVAULT_USERBALANCES_ABI`, to preserve the line-number citations used in PATTERNS.md (L101-126) and to mirror the Phase 12.1 precedent (SplitVault ABI was also appended at file bottom rather than inserted alphabetically).

## Authentication Gates
None.

## Known Stubs
None — this plan was strictly additive type-only work. All new ABI consts, type members, and column fields are referenced (or will be referenced) by Waves 2-4 implementations. The only "stubs" in tree are the intentional RED test failures from Plan 13-01 documented above.

## TDD Gate Compliance
The plan declared `tdd="true"` on all 3 tasks but provided no `<test>` blocks — verification was satisfied by `tsc --noEmit` + grep presence checks per the `<verify>` blocks. No new test files were created. The Plan 13-01 RED tests for `detectFundRecipient` + `lib/platforms/flap-vaults/fund-recipient.ts` (Wave 2 module) remain intentionally failing and will be turned GREEN by Wave 2's implementation.

## Self-Check: PASSED

- File `lib/platforms/flap-vaults/types.ts` modified — `'fund-recipient'` literal present, both ABI consts present, all required ABI methods present
- File `lib/platforms/flap-vaults/index.ts` modified — HANDLERS map exhaustiveness restored
- File `lib/supabase/types.ts` modified — Row/Insert/Update extended with both new columns + vault_type union widened
- File `lib/platforms/types.ts` modified — TokenFee.vaultType union widened (Rule 3 fix)
- Commit will be created with message `feat(13-03): wave 1 — type extensions for fund-recipient` covering all 4 source files + this SUMMARY (force-added)
