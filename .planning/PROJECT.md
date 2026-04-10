# ClaimScan

## What This Is

Plataforma de rastreamento e claim de fees de tokens cross-chain (Solana, Base, ETH, BSC). Agrega fees de 9 launchpads (Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium) com live SSE updates, leaderboard publico, e API v2 paga via x402. V2.5 live em producao com endorsement publico do FINN/Bags.

## Core Value

Mostrar aos creators de tokens quanto dinheiro eles tem parado em fees nao-claimadas, de forma precisa e em tempo real, cobrindo todos os launchpads relevantes.

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

- [ ] Adapter health check script (all 9 adapters, known wallets, status/response time/results)
- [ ] Vitest integration test suite for all adapter methods
- [ ] Adapter benchmark suite (p50/p95 latency, error rates, timeout frequency)
- [ ] CI pipeline (GitHub Actions) running adapter tests on push/PR
- [ ] Error handling hardening (circuit breakers, structured error types)
- [ ] Cron job reliability improvements (retry logic, failure reporting)

### Out of Scope

- Dashboard de status publico -- desnecessario agora, pode ser v2 do quality milestone
- Alertas Telegram/Discord -- skip por agora, CI coverage primeiro
- Novas features de usuario -- foco exclusivo em quality/testing/hardening
- Novos launchpads -- estabilizar os 9 existentes antes de adicionar mais
- Claims EVM (Clanker/Zora/Bankr) -- requer migracao Reown AppKit, milestone separado

## Context

ClaimScan V2.5 shipped em 2026-04-07 com visual redesign, real-time fees, leaderboard, e hardening sweep. Metricas: $1.7M+ fees tracked, 397+ wallets scanned, ~40% unclaimed. FINN (founder Bags) deu endorsement publico.

O codebase tem 9 adapters com interfaces padronizadas (PlatformAdapter), mas zero testes de integracao nos adapters em si. Os testes existentes cobrem utils/fee-math/hmac, nao os adapters. O gap principal e: se um adapter quebrar silenciosamente (API mudou, rate limit, timeout), so descobre quando um usuario reclama.

Os adapters usam Promise.allSettled pra tolerancia a falhas, mas nao tem circuit breakers nem metricas de saude. Cada adapter tem caracteristicas diferentes: Pump faz leitura onchain, Bags tem multi-key rotation, Clanker e multi-chain, Bankr tem Agent API fallback lento.

## Constraints

- **Infra**: Vercel Hobby (maxDuration=60s, SSE 10s cap)
- **APIs externas**: Rate limits variam por plataforma, some APIs sem SLA
- **Wallets de teste**: Usar wallets publicas de creators conhecidos (hardcoded)
- **CI budget**: GitHub Actions free tier (2000 min/mes)
- **Sem DB em testes**: Adapter tests chamam APIs reais, nao mocam Supabase

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Foco em quality/hardening antes de features | V2.5 ta live e estavel, precisa de safety net antes de crescer | -- Pending |
| Wallets hardcoded por adapter | Evita dependencia do DB em testes, wallets publicas de creators conhecidos | -- Pending |
| CI via GitHub Actions | Ja tem repo no GitHub, free tier suficiente, roda em PR | -- Pending |
| Testes contra APIs reais (nao mocks) | Adapters dependem de APIs externas, mock nao pega mudancas de contrato | -- Pending |

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
*Last updated: 2026-04-10 after initialization*
