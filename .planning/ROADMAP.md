# ClaimScan Launchpad Expansion — Roadmap

**Milestone:** Launchpad Expansion v1.1
**Granularity:** coarse (2 phases)
**Generated:** 2026-04-20
**Blueprint:** `/Users/lowellmuniz/.claude/plans/entre-na-pasta-do-playful-steele.md`
**Prior:** Quality & Testing v1 (10 phases, 18 reqs) parkeado em `.planning/backlog/milestones/quality-testing-v1/`

---

## Phase 11: Flaunch.gg Adapter (Base)

**Goal:** Shippar adapter Flaunch display-only em Base, expandindo cobertura de 9 pra 10 launchpads via REST pública + on-chain read do `RevenueManager.balances`, emitindo synthetic token ID agregado.
**Requirements:** SF-01, SF-02, SF-03, SF-04, SF-05, FL-01, FL-02, FL-03, FL-04, FL-05, FL-06, FL-07, FL-08, FL-09
**Depends on:** none (shared foundation SF-* entra aqui pra destravar Phase 12)
**UI hint:** yes (adiciona tab em PlatformBreakdown + branch display-only em TokenFeeTable)
**Plans:** 5/5 plans complete

Plans:
- [x] 11-01-PLAN.md — Shared foundation: migration 032, Platform union, branded types, TokenFeeTable display-only branch, PlatformIcon assets (SF-01..05)
- [x] 11-02-PLAN.md — Flaunch HTTP client + types + Zod validation + unit tests (FL-02, FL-03)
- [x] 11-03-PLAN.md — Flaunch constants in constants-evm.ts + readFlaunchBalances helper (FL-01, FL-04)
- [x] 11-04-PLAN.md — flaunchAdapter implementation + registry registration (FL-05, FL-06)
- [x] 11-05-PLAN.md — Integration test + fixture wallet + .env.example + CLAUDE.md bump (FL-07, FL-08, FL-09)

### Success Criteria

1. Migration `032_add_flap_flaunch.sql` aplicada em staging: `SELECT unnest(enum_range(NULL::platform_type))` retorna 11 valores incluindo `'flaunch'` e `'flap'`.
2. Perfil `/0x<known-flaunch-holder>` exibe tab "Flaunch" com 1 row synthetic (`BASE:flaunch-revenue`, symbol `ETH`), sem botão Claim, com link externo pro flaunch.gg; invariante Total Unclaimed stat == soma USD visível mantida.
3. Integration test `npm run test:integration -- flaunch` passa contra API real retornando `totalUnclaimed` que bate numericamente com `baseClient.readContract` direto do mesmo wallet (sanity).
4. Cron `/api/cron/index-fees` trigado manualmente persiste rows em `fee_records` com `platform='flaunch'`, `token_address='BASE:flaunch-revenue'`.
5. `CLAUDE.md` atualizado para "10 launchpads" e synthetic ID documentado na mesma seção de Pump.

---

## Phase 12: Flap.sh Adapter (BSC)

**Goal:** Shippar adapter Flap display-only em BSC com indexer próprio + vault handler registry polimórfico, completando cobertura em 11 launchpads sem deps externas pagas.
**Requirements:** FP-01, FP-02, FP-03, FP-04, FP-05, FP-06, FP-07, FP-08
**Depends on:** 11 (shared enum migration, branded types, display-only UI branch já em prod)
**UI hint:** yes (adiciona tab em PlatformBreakdown via registry, reusa branch display-only da Phase 11)

### Success Criteria

1. Migration `034_add_flap_tokens.sql` aplicada: tabelas `flap_tokens` e `flap_indexer_state` criadas, RLS ativo, índices em `creator` e `vault_address` (partial WHERE NOT NULL) presentes.
2. Cron `/api/cron/index-flap` trigado 3x consecutivas avança `flap_indexer_state.last_scanned_block`, upserts idempotentes em `flap_tokens` (ON CONFLICT ignoreDuplicates), janela de 250K blocos respeitada, wallclock guard 55s.
3. Vault handler registry probe classifica corretamente VaultBase e VaultBaseV2, cacheia `vault_type` em `flap_tokens`; vault desconhecido cai em handler `unknown` com `vaultType: 'unknown'` no TokenFee (D-04 badge).
4. Perfil `/0x<known-flap-creator>` exibe tab "Flap" com ≥1 row per-vault, claim values consistentes com leitura direta de `VaultBase.claimable(wallet)` via bscClient.
5. Integration test `npm run test:integration -- flap` passa; event decoder descarta log onde `log.address !== FLAP_PORTAL` (event spoof protection verificada em teste unit).
6. `CLAUDE.md` atualizado para "11 launchpads" com seção do cron `index-flap` nas convenções.

**Plans:** 7/7 plans complete

Plans:
- [x] 12-01-PLAN.md — Migration 034 (flap_tokens + flap_indexer_state + fee_records.vault_type) + Wave 0 test stubs + BLOCKING schema push (FP-02)
- [x] 12-02-PLAN.md — Flap BSC constants (constants-evm.ts) + flap-reads.ts with spoof-protected event decoder + batchVaultClaimable multicall (FP-01, FP-03)
- [x] 12-03-PLAN.md — Vault handler registry (lib/platforms/flap-vaults/*): 4 files + shared types with extracted VaultCategory enum (FP-04)
- [x] 12-04-PLAN.md — Cron /api/cron/index-flap (scan + classify + D-08 lag observability) + vercel.json schedule (FP-05)
- [x] 12-05-PLAN.md — TokenFee.vaultType field + FeeRecord type + persistFees wiring + PlatformBreakdown merge + flapAdapter + registry + SHIPPED_LAUNCHPAD_COUNT=11 (FP-06, FP-07, FP-08)
- [x] 12-06-PLAN.md — D-04 badge in TokenFeeTable + CLAUDE.md bump to 11 launchpads + .env.example BITQUERY note (FP-06, FP-08)
- [x] 12-07-PLAN.md — Bitquery one-shot backfill + sanity script + live-BSC integration test (FP-07)

---

## Post-Milestone

**Ao completar Phase 12:** rodar `/gsd-complete-milestone`, depois promover Quality & Testing v1 do backlog via `/gsd-review-backlog` (ou move manual de `.planning/backlog/milestones/quality-testing-v1/` de volta pra raiz `.planning/`).
