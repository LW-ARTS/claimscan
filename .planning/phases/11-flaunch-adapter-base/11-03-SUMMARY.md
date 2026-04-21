---
phase: 11-flaunch-adapter-base
plan: 03
subsystem: flaunch-adapter
tags: [evm, base, flaunch, on-chain-reads, constants]
requires:
  - lib/chains/types.ts (BaseAddress, asBaseAddress from Plan 11-01)
provides:
  - FLAUNCH_REVENUE_MANAGER (BaseAddress)
  - FLAUNCH_POSITION_MANAGER (BaseAddress)
  - FLAUNCH_NFT_FACTORY (BaseAddress)
  - FLAUNCH_STAKING_MANAGER (BaseAddress)
  - FLAUNCH_BUYBACK_MANAGER (BaseAddress)
  - FLAUNCH_FEE_ESCROW (BaseAddress)
  - FLETH (BaseAddress)
  - readFlaunchBalances(recipient: BaseAddress) -> Promise<bigint>
affects:
  - lib/constants-evm.ts (extended)
  - lib/chains/flaunch-reads.ts (new)
tech_stack:
  added: []
  patterns:
    - "Branded BaseAddress type for cross-chain safety"
    - "parseAbi + baseClient.readContract pattern (matches lib/chains/base.ts)"
    - "Error-swallowing helper returning 0n (matches getZoraProtocolRewardsBalance)"
key_files:
  created:
    - lib/chains/flaunch-reads.ts
    - lib/chains/types.ts (stub, will merge cleanly with Plan 11-01)
  modified:
    - lib/constants-evm.ts
decisions:
  - "All 7 Flaunch addresses use asBaseAddress (not getAddress + cast) per plan spec"
  - "readFlaunchBalances swallows errors, returns 0n + log.warn (degrade gracefully)"
  - "Narrow scope: only RevenueManager.balances, per-coin events deferred to v2"
metrics:
  completed: "2026-04-20"
  duration: "~7 minutes"
  tasks: 3
  files: 3
---

# Phase 11 Plan 03: Flaunch Constants + On-Chain Reads Summary

Added 7 Flaunch Base mainnet contract addresses to `lib/constants-evm.ts` (all typed as `BaseAddress`, EIP-55 checksummed via `asBaseAddress`) and created the on-chain read helper `lib/chains/flaunch-reads.ts` exposing `readFlaunchBalances(recipient: BaseAddress) -> Promise<bigint>` that calls `RevenueManager.balances(address)` via `baseClient.readContract`.

## What Was Built

### 1. `lib/chains/types.ts` (stub — Rule 3 deviation)
Created the branded address types module locally because Plan 11-01 (which is the canonical owner of this file) runs in a parallel worktree and its artifacts are not visible here. Content matches Plan 11-01 Task 3 spec byte-for-byte so the worktree merge treats it as "both added, identical content" = clean auto-resolve.

Exports: `EvmAddress`, `BaseAddress`, `BscAddress`, `asBaseAddress`, `asBscAddress`.

### 2. `lib/constants-evm.ts` (extended)
Appended 7 Flaunch constants AFTER the existing BSC section. Existing Clanker/Zora/BSC lines are unchanged.

```ts
import { asBaseAddress, type BaseAddress } from '@/lib/chains/types';

// Flaunch.gg — Base mainnet
// Source: flayerlabs/flaunch-sdk addresses.ts (confirmed 2026-04-20)
export const FLAUNCH_REVENUE_MANAGER: BaseAddress = asBaseAddress('0xc8d4B2Ca8eD6868eE768beAb1f932d7eecCc1b50');
export const FLAUNCH_POSITION_MANAGER: BaseAddress = asBaseAddress('0x51Bba15255406Cfe7099a42183302640ba7dAFDC');
export const FLAUNCH_NFT_FACTORY: BaseAddress = asBaseAddress('0xCc7A4A00072ccbeEEbd999edc812C0ce498Fb63B');
export const FLAUNCH_STAKING_MANAGER: BaseAddress = asBaseAddress('0xec0069F8DBbbC94058dc895000dd38ef40b3125d');
export const FLAUNCH_BUYBACK_MANAGER: BaseAddress = asBaseAddress('0x3AAF3b1D8cD5b61C77f99bA7cdf41E9eC0Ba8a3f');
export const FLAUNCH_FEE_ESCROW: BaseAddress = asBaseAddress('0x72e6f7948b1B1A343B477F39aAbd2E35E6D27dde');
export const FLETH: BaseAddress = asBaseAddress('0x000000000D564D5be76f7f0d28fE52605afC7Cf8');
```

### 3. `lib/chains/flaunch-reads.ts` (new)
New module providing the canonical read path for the synthetic `BASE:flaunch-revenue` TokenFee row. The ABI is minimal (only `balances(address recipient) view returns (uint256)`) because Phase 11 v1 is display-only and does not need per-coin event scans. The helper catches all errors and returns `0n` so an RPC blip degrades to "no fees this cycle" instead of tanking the cron.

## Basescan Verification (Task 1 Checkpoint)

**Auto-approved under auto-mode.** Per the active auto-mode gate, `checkpoint:human-verify` tasks auto-approve and continue. The 7 addresses came from `flayerlabs/flaunch-sdk/addresses.ts` (the official Flaunch SDK), which is the source of truth for Flaunch on-chain addresses on Base mainnet. The planner confirmed the blueprint on 2026-04-20.

Operational risk is accepted per the threat model (T-11.03-02): if Flaunch upgrades a proxy between auto-approval and deploy, we would read a new implementation. Flaunch controls the implementation; we trust them operationally. A follow-up human Basescan sweep can be queued for the deployment gate.

## How It Fits

| Plan | Relationship | Status |
|------|-------------|--------|
| 11-01 (foundation) | Provides `BaseAddress` / `asBaseAddress` that this plan imports. Worktree stub ensures local tsc passes. | Running in parallel worktree |
| 11-04 (adapter) | Consumes `FLAUNCH_REVENUE_MANAGER`, `readFlaunchBalances` exclusively. No other reads needed. | Downstream |
| 11-02 (REST client) | Independent — different module tree. | Parallel |

## Verification

| Check | Result |
|-------|--------|
| `test -f lib/chains/flaunch-reads.ts` | PASS |
| `grep -c "FLAUNCH_" lib/constants-evm.ts` | 6 (exactly as expected — 6 FLAUNCH_ prefixed + FLETH) |
| `grep -c "FLETH" lib/constants-evm.ts` | 1 |
| `grep "asBaseAddress" lib/constants-evm.ts` | 7 usages + 1 import |
| `grep "import 'server-only'" lib/chains/flaunch-reads.ts` | PASS |
| `grep "function balances(address recipient) view returns (uint256)" lib/chains/flaunch-reads.ts` | PASS |
| `grep "baseClient.readContract" lib/chains/flaunch-reads.ts` | PASS |
| `grep "recipient: BaseAddress" lib/chains/flaunch-reads.ts` | PASS |
| `grep "Promise<bigint>" lib/chains/flaunch-reads.ts` | PASS |
| `npx tsc --noEmit` | exits 0 (clean) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Dependency] Created `lib/chains/types.ts` locally**
- **Found during:** Pre-Task 2 setup
- **Issue:** Plan 11-03 imports `asBaseAddress` and `BaseAddress` from `@/lib/chains/types`, which is the artifact of Plan 11-01 Task 3. Plan 11-01 runs in a parallel worktree; its artifacts are not visible in this worktree. Without `types.ts`, `tsc --noEmit` fails and Task 2's acceptance criteria cannot pass.
- **Fix:** Created `lib/chains/types.ts` with byte-for-byte content from Plan 11-01 Task 3 spec so a future git merge resolves cleanly ("both added, identical content").
- **Files modified:** `lib/chains/types.ts` (new, 29 lines)
- **Commit:** `e6f1157` — chore(11-03): add lib/chains/types.ts stub to unblock parallel execution
- **Risk:** If Plan 11-01 writes `types.ts` with any variation (extra comments, different brand symbol names, additional exports), the merge becomes a real conflict. Mitigated by copying the 11-01 spec literally.

### Auth Gates / Checkpoint Auto-Approvals

**Task 1 (checkpoint:human-verify — BLOCKING):** Auto-approved under auto-mode. Rationale: auto-mode is the active gate, and the 7 addresses originate from flayerlabs/flaunch-sdk (the Flaunch team's own repo). Deferred human Basescan verification to the deployment checkpoint. Logged as `⚡ Auto-approved: 7 Flaunch Base addresses verification (source: flayerlabs/flaunch-sdk)`.

## Known Stubs

None. All exports have real implementations.

## Commits

| Commit | Message |
|--------|---------|
| `e6f1157` | chore(11-03): add lib/chains/types.ts stub to unblock parallel execution |
| `2135952` | feat(11-03): add 7 Flaunch Base mainnet addresses to constants-evm.ts |
| `de1ab34` | feat(11-03): add readFlaunchBalances helper for RevenueManager.balances |

## Self-Check: PASSED

- `lib/chains/types.ts`: FOUND
- `lib/constants-evm.ts`: FOUND (modified)
- `lib/chains/flaunch-reads.ts`: FOUND
- Commit `e6f1157`: FOUND
- Commit `2135952`: FOUND
- Commit `de1ab34`: FOUND
- `npx tsc --noEmit`: exits 0
