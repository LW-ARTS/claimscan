# ClaimScan

## What This Is

Plataforma de rastreamento e claim de fees de tokens cross-chain (Solana, Base, ETH, BSC). Agrega fees de 9 launchpads (Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium) com live SSE updates, leaderboard publico, e API v2 paga via x402. V2.5 live em producao com endorsement publico do FINN/Bags.

## Core Value

Mostrar aos creators de tokens quanto dinheiro eles tem parado em fees nao-claimadas, de forma precisa e em tempo real, cobrindo todos os launchpads relevantes.

## Current Milestone: v1.1 Launchpad Expansion

**Goal:** Expandir cobertura de 9 para 11 launchpads adicionando Flaunch.gg (Base) e Flap.sh (BSC), em modo display-only (sem botão de claim em v1).

**Target features:**
- Adapter Flaunch.gg lendo REST `dev-api.flayerlabs.xyz` + `RevenueManager.balances()` on-chain, emitindo synthetic token ID `BASE:flaunch-revenue`
- Adapter Flap.sh via indexer próprio em Supabase (tabela `flap_tokens` + cron incremental), com vault handler registry polimórfico (VaultBase, VaultBaseV2, unknown fallback)
- UI display-only: tabs novos em `PlatformBreakdown`, link externo em vez de CTA de claim nas rows

## Requirements

### Validated

- ✓ Fee tracking across 9 launchpads (Pump, Bags, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium) -- V2.5
- ✓ Cross-chain support (Solana, Base, ETH, BSC) -- V2.5
- ✓ Identity resolution (Twitter, GitHub, Farcaster, wallet address) -- V2.0
- ✓ Real-time SSE live fee updates on profile page -- V2.5
- ✓ Public leaderboard ranking creators by unclaimed fees -- V2.5
- ✓ Bags.fm claim flow (sign + confirm) -- V2.0
- ✓ API v2 monetized via x402 protocol -- V2.5
- ✓ Cron-based fee indexing and price refresh -- V2.0
- ✓ Mobile-first responsive design -- V2.5
- ✓ Security hardening (proxy.ts, rate limiting, HMAC, request signing, honeypot) -- V2.5

### Active

- [ ] **Flaunch.gg adapter (Base)** — discovery via REST + claimable via `RevenueManager.balances`, synthetic token ID, display-only
- [ ] **Flap.sh adapter (BSC)** — indexer próprio + vault handler registry polimórfico, display-only
- [ ] **Shared enum migration** — estender `platform_type` no Supabase com `'flaunch'` e `'flap'`
- [ ] **Shared UI** — branch display-only em `TokenFeeTable` + ícones em `PlatformIcon`
- [ ] **Branded types EVM** — `BaseAddress` / `BscAddress` pra segurança cross-chain

### Parked (Backlog)

Requirements do milestone Quality & Testing v1 ficaram archived em `.planning/backlog/milestones/quality-testing-v1/`. Continuam válidos e devem ser promovidos depois de Launchpad Expansion fechar. Inclui CI unit wiring, adapter health check, integration tests, benchmark suite, fixtures hardcoded.

### Out of Scope (Launchpad Expansion v1.1)

- **Claim button em Flaunch/Flap** -- depende de migração Reown AppKit (TODO arquitetural documentado), fica pra v2 do milestone
- **Flaunch Groups (staking rewards)** -- cobrir Memestream owner revenue primeiro, groups viram futura expansão se houver demanda
- **Flap vaults customizados** -- v1 suporta só VaultBase e VaultBaseV2 oficiais, custom vaults caem no handler `unknown` (balance display only)
- **Per-coin breakdown do Flaunch** -- `balances()` é agregado por wallet; per-coin exige scan de eventos `TotalFeesReceived`, fica pra v2
- **Historical claim events** -- `Claimed` event scan em BSC window 250K blocos é insuficiente, confia em `claim_events` indo pra frente

### Out of Scope (permanente)

- **Bitquery API paga como dep primária** -- trial tier não é sustentável, híbrido com backfill one-shot fica como idea parqueada
- **Adapter tests em PR gates** -- muito lento, só nightly via Q&T quando esse milestone entrar

## Context

ClaimScan V2.5 shipped em 2026-04-07 com visual redesign, real-time fees, leaderboard, e hardening sweep. Metricas: $1.7M+ fees tracked, 397+ wallets scanned, ~40% unclaimed. FINN (founder Bags) deu endorsement publico.

**Pivot 2026-04-20:** Decisão original do v1 era estabilizar os 9 adapters antes de adicionar mais (via milestone Quality & Testing). Override acionado após pesquisa de feasibility mostrar que Flaunch.gg tem REST pública (`dev-api.flayerlabs.xyz`) + SDK com addresses confirmados, viabilizando integração de 1 a 2 dias com zero API key e synthetic token ID pattern já usado pra Pump.fun. Flap.sh é 3 a 5 dias de trabalho por causa do indexer próprio e vault polimórfico, mas zero deps externas pagas.

**Hoje:** 9 adapters padronizados em `PlatformAdapter` interface. Clanker é o template canônico pra novos EVM adapters (REST + viem multicall). Pump tem precedent pro synthetic token ID pattern (`SOL:pump`). Cron `index-fees` ja faz loop em todos adapters do registry, então novos adapters entram grátis.

## Constraints

- **Infra**: Vercel Hobby (maxDuration=60s, SSE 10s cap)
- **APIs externas**: Flaunch tem rate limit sugerido de 100-200ms entre requests; BSC RPC scan window é 250K blocos (~8.7 dias)
- **Wallets de teste**: Usar wallets publicas de creators conhecidos (hardcoded)
- **CI budget**: GitHub Actions free tier (2000 min/mes)
- **Claim signing**: zero em v1 para ambos (display-only); evita depender de Reown AppKit migration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Override "Novos launchpads out of scope" | Oportunidade de mercado + viability confirmada em research 2026-04-20 | -- Pending |
| Flaunch via REST pública, não @flaunch/sdk | SDK traz Uniswap V4 writes que não precisamos; REST + viem read bate com padrão Clanker | -- Pending |
| Flaunch synthetic token ID `BASE:flaunch-revenue` | `balances()` é agregado por wallet; per-coin breakdown fica pra v2 | -- Pending |
| Flap indexer próprio, sem Bitquery | Free tier não renova mensalmente, Commercial tier sem preço público | -- Pending |
| Display-only em ambos, sem Claim button | Evita forçar migração Reown AppKit que é escopo muito maior | -- Pending |
| Branded types BaseAddress/BscAddress | Checksum EIP-55 não diferencia chain, branded type previne cross-chain mix | -- Pending |
| Vault handler registry polimórfico pra Flap | Flap vaults têm 2 ABIs oficiais + custom; fallback `unknown` é seguro (balance only) | -- Pending |
| Q&T milestone parkeado (não descartado) | Quality ainda é prioridade, mas Launchpad Expansion tem janela curta | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? Move to Out of Scope with reason
2. Requirements validated? Move to Validated with phase reference
3. New requirements emerged? Add to Active
4. Decisions to log? Add to Key Decisions
5. "What This Is" still accurate? Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-20 -- pivoted from Quality & Testing to Launchpad Expansion v1.1*
