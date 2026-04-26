---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
last_updated: "2026-04-26T04:50:00.000Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 20
  completed_plans: 19
  percent: 95
---

# ClaimScan — Project State

## Project

- **Name:** ClaimScan Launchpad Expansion
- **Milestone:** Launchpad Expansion (v1.1)

## Current Position

Phase: 12.1 (splitvault-handler) — EXECUTING
Plan: 08 (in progress — classify-flap.ts loop drains remaining ~5769 unknown rows)

- **Phase:** 12.1
- **Active Phase:** 12.1
- **Status:** Plans 01-07 complete (code shipped to local main). Plan 08 task 1 done (migration applied via Supabase MCP). Plan 08 task 2 in progress (classify-flap loop). Plan 08 task 3 pending.
- **Resume file:** `.planning/phases/12.1-splitvault-handler-implement-third-flap-vault-type-3979-inst/12.1-HANDOFF.md`

## Last Activity

- **Date:** 2026-04-26
- **Action:** Phase 12.1 autonomous overnight execution — Migration 035 applied via MCP, executor agent shipped 6 code commits (test stubs, type widening, handler, probe ladder, script mirror, integration test) + migration commit, all 210 tests GREEN, tsc clean. classify-flap batch 1 done (641 split-vault, 310 base-v2, 49 unknown-failed in 1000 rows). Loop running for remaining 5769 unknowns (~70 min). User must `git push origin main` in morning to deploy 9 unpushed commits via Vercel.

## Accumulated Context

- Blueprint do milestone: `/Users/lowellmuniz/.claude/plans/entre-na-pasta-do-playful-steele.md` — contém decisões travadas, type design, security hardening, task breakdown F1-F4 (Phase 11) e P1-P6 (Phase 12), contract addresses Base confirmados, API endpoints reais.
- Branch ativo: `milestone/launchpad-expansion-v1`.
- WIP stashed: `bot/src/index.ts` (Wave 3 webhook work pausado por DNS Hostinger), stash msg `pre-milestone: bot/src/index.ts wip`.
- Decisão de override: PROJECT.md original tinha "Novos launchpads" em Out of Scope; override explícito do fundador em 2026-04-20 moveu pra Active. Q&T milestone parkeado, não descartado.
- Chave técnica Flaunch: `RevenueManager.balances(wallet)` é agregado (não per-coin), daí o synthetic token ID `BASE:flaunch-revenue` seguindo pattern Pump.
- Chave técnica Flap: indexer próprio + one-shot Bitquery backfill do bonus signup (descartável), vault handler registry polimórfico com fallback `unknown` (badge UI "Claim method unknown"), event spoof protection via `log.address === FLAP_PORTAL`.

### Roadmap Evolution

- Phase 12.1 inserted after Phase 12: SplitVault handler — third Flap vault type discovered post-Phase 12 verification (3979/6792 = 58.6% of vault tokens use SplitVault implementation `0xd6a92acc...`, only 1 token uses canonical V2 `0xd5051e83...`). Existing v1/v2/unknown trichotomy too coarse; pivoting backfill from Portal.TokenCreated to VaultPortal.FlapTaxVaultTokenCreated mapped the universe. (URGENT — adapter currently shows "Claim method unknown" for the 58.6%)

## Blockers

_(none)_

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-1eg | Fix e2e CI test assertions + add Supabase service role placeholder | 2026-04-21 | caf6bc3 | [260421-1eg-fix-e2e-ci-test-assertions-and-add-supab](./quick/260421-1eg-fix-e2e-ci-test-assertions-and-add-supab/) |

## Open Tópics pra Revisitar

- ~~Hybrid Bitquery backfill one-shot~~ — **resolvido 2026-04-24** (Phase 12 D-01): `scripts/backfill-flap.ts` faz one-shot, `scripts/sanity-flap-backfill.ts` valida gaps, coluna `source` em `flap_tokens` audit trail.
- ~~Wallet fixture pública Base~~ — resolvido na Phase 11 (já shipped 2026-04-21).
- Wallet fixture BSC com token Flap + claimable > 0 para Phase 12 integration test — delegado ao researcher agent durante `/gsd-plan-phase 12` (Phase 12 D-09).
- Endereços Flap BSC (`FLAP_PORTAL`, `FLAP_VAULT_PORTAL`, `FLAP_PORTAL_DEPLOY_BLOCK`) — delegado ao researcher agent via `docs.flap.sh` + BscScan (Phase 12 D-05).
