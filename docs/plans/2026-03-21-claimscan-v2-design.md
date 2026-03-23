# ClaimScan v2 - Design & Roadmap

## Context

ClaimScan v1 esta estavel: 9 plataformas indexando fees, Bags.fm com claim completo, audit 10/10, infra Vercel + Supabase + Redis rodando. O objetivo da v2 e elevar o nivel em duas frentes: **produto/UX diferenciado** e **plataforma/ecossistema**. Modelo de negocio: free pra todos, monetiza via taxa de 0.85% nos claims. Releases incrementais, quick wins primeiro.

## Estrategia: Layer Cake

Cada release adiciona uma camada que constroi em cima da anterior. Ordenadas por esforco (quick wins primeiro) e impacto.

---

## Release 1: Multi-Chain Claiming + Fee 0.85%

**Objetivo:** Expandir claim pra Pump.fun, Clanker, Bankr e Zora. Cobrar 0.85% em cada claim. Gerar receita.

**Por que primeiro:** Ja tem plano pronto pro fee (`.claude/plans/ancient-shimmying-feigenbaum.md`). Pump.fun tem SDK oficial e maior volume. Clanker e claim via ClankerFeeLocker (Uniswap V4). Zora pode nao precisar de claim (auto-distribui fees) — validar antes de implementar. Receita imediata.

### Componentes

**EVM Wallet Adapter**
- Wagmi v2 + RainbowKit v2 pra Base chain (preferivel sobre ConnectKit — compatibilidade explicita com Turbopack/Next.js 16, ConnectKit tem issues conhecidas de SSR com cookie persistence no App Router)
- **Dependencia**: RainbowKit v2 + Wagmi v2 exigem TanStack Query como peer dependency. Adicionar `@tanstack/react-query` e wrapping `QueryClientProvider` no `_providers.tsx`
- Provider separado do Solana, coexistem no `_providers.tsx` com `"use client"` directive
- Auto-detect chain do token, conecta wallet certa automaticamente

**Claim Adapters (ordem: Pump.fun → Clanker → Bankr → Zora)**
- Pump.fun (Solana only): SDK oficial `@pump-fun/pump-sdk` com Creator Fee Sharing model (jan 2026). Usar `collectCreatorFee` action com parametro `pool`: "pump" (bonding curve, fees claimadas all-at-once) ou "meteora-dbc" (graduated tokens no PumpSwap). Adapter deve detectar estado do token pra usar pool correto. Suporta split de fees pra ate 10 wallets. PumpPortal API como alternativa. **Pump.fun NAO opera na BSC** — "BNBpump.fun" e projeto copycat nao-oficial
- Clanker (Base + BSC + Arbitrum + ETH): **Uniswap V4** (nao V3). Clanker v4 usa custom hook (`ClankerHook`) que auto-coleta fees em cada swap e envia pro `ClankerFeeLocker`. Claim via funcao publica no fee locker, por token (recipients claimam WETH de multiplos tokens em 1 tx). Clanker opera em Base, BNB Chain (BSC), Arbitrum, Monad e Ethereum. **Scope v2**: apenas Base (chain ja suportada pelo ClaimScan). Adicionar BSC/Arbitrum exige novos RPCs e chain adapters — fora do escopo desta release. Consultar docs: https://clanker.gitbook.io/clanker-documentation/references/core-contracts/v4
- Bankr (Base + Solana): Claim mechanism e via prompts no bot ("claim my fees for MyToken"), nao via smart contract call direta. Fee structure: 0.5% pre-migracao, pos-migracao split 50% creator / 40% Bankr / 10% burn. Claim integration pode precisar de API do Bankr ao inves de on-chain call. **Scope v2**: apenas Base + Solana (chains ja suportadas pelo ClaimScan). Bankr tambem opera em Polygon e ETH mas adicionar essas chains exige novos RPCs e adapters — fora do escopo desta release. **BSC/BNB Chain: NAO suportado pelo Bankr**
- Zora (Base): **ATENÇÃO** — Zora migrou pra modelo Coins. SDK agora e `@zoralabs/coins-sdk` (nao `protocol-sdk`). Fees sao auto-distribuidas em cada swap em $ZORA, sem claim manual. Verificar se existe unclaimed balance ou se o adapter Zora vira apenas tracking/display (sem botao de claim). Pode nao precisar de claim adapter

**ClaimDialog v2**
- Evolucao do dialog atual (`components/ClaimDialog.tsx`)
- Detecta chain do token, mostra wallet connector certo
- Um dialog unificado, multi-chain
- Reutiliza a state machine existente (idle → fetching → signing → submitting → complete)

**Fee Collection (0.85%)**
- Tx separada via `signAllTransactions()` (Solana) e tx separada (EVM). **Nota**: `signAllTransactions` e opcional na Wallet Standard — nem todas wallets suportam. Implementar fallback: se nao disponivel, enviar claim tx via `sendTransaction` primeiro, depois fee tx separadamente
- Treasury wallet por chain
- MIN_FEE threshold: claims abaixo de $5 USD nao cobram fee (dust protection)
- Plano detalhado em `.claude/plans/ancient-shimmying-feigenbaum.md`
- **Edge case**: se usuario assinar o claim mas rejeitar a tx da fee, o claim deve prosseguir sem fee. Fee e best-effort, nunca bloqueia o claim do usuario. Logar como `fee_skipped` pra tracking

**Treasury Key Management**
- Private keys das treasury wallets NUNCA no codebase ou env vars do app
- Usar KMS (AWS KMS, GCP KMS, ou Hashicorp Vault) pra signing server-side
- Alternativa: treasury wallet separada com server dedicado (nao no mesmo deploy do app)
- Monitoramento de saldo das treasury wallets com alerta se variar fora do esperado

**Fee Disclosure (Legal)**
- Fee de 0.85% deve ser visivel no ClaimDialog ANTES do usuario assinar
- Texto claro: "A 0.85% service fee ($X.XX) will be collected in a separate transaction"
- Atualizar Terms of Service com secao de fees
- Link pro ToS no ClaimDialog

**Database**
- Tabela `treasury_wallets` (chain, address, active)
- Expand `claim_attempts` com campo `chain`
- Expand `claim_events` pra suportar EVM tx hashes

### Arquivos criticos
- `components/ClaimDialog.tsx` - refactor pra multi-chain
- `app/_providers.tsx` - adicionar Wagmi provider
- `lib/claim/` - novos adapters (pump-claim.ts, clanker-claim.ts, bankr-claim.ts, zora-claim.ts se aplicavel)
- `app/api/claim/` - novos endpoints por plataforma
- `lib/constants.ts` - fee BPS, treasury addresses

### Esforco estimado: 7-10 dias

---

## Release 2: Leaderboard + Flex Cards

**Objetivo:** Ranking publico de top earners + cards shareable premium. Growth organico via social proof.

**Por que aqui:** Quick win brutal. Ja existe OG image generation + ShareButton. Puro frontend + 1 endpoint.

### Componentes

**`/leaderboard` page**
- Top creators por total earned
- Filtros: chain (all/sol/base), platform (all/bags/pump/...), timeframe (7d, 30d, all-time)
- Paginacao (top 100)
- Link pro perfil de cada creator
- **Opt-out**: flag `visible_on_leaderboard` (default true) no perfil do creator. Creators podem se remover do ranking via toggle na UI
- **Anti-gaming**: filtrar creators com menos de 3 tokens ou menos de $10 total earned. Previne inflacao de ranking com tokens fake/volume artificial

**`/api/leaderboard` endpoint**
- Query agregada: `fee_records` GROUP BY creator, ORDER BY total_earned_usd DESC
- Cache 15min no Redis
- Filtros via query params

**Flex Card v2**
- Design premium com: rank position, badges (top 10, top 50, "OG claimer"), earnings breakdown por chain
- Reutiliza OG image pipeline existente (`app/[handle]/opengraph-image/`)
- Novos templates visuais

**Leaderboard cache**
- Materialized view no Supabase com refresh via `pg_cron` nativo (Supabase Cron) — mais simples que Vercel Cron pra isso, roda direto no PostgreSQL sem cold start
- **Requisito**: criar unique index na materialized view antes de usar CONCURRENTLY (ex: `CREATE UNIQUE INDEX ON leaderboard_mv (creator_id)`). Sem o index, o refresh bloqueia a view
- Refresh a cada 15-30min via `SELECT cron.schedule('refresh-leaderboard', '*/15 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_mv')`
- Fallback: tabela `leaderboard_cache` se materialized view nao performar
- Evita query pesada on-demand

### Arquivos criticos
- `app/leaderboard/page.tsx` - nova pagina
- `app/api/leaderboard/route.ts` - novo endpoint
- `app/[handle]/opengraph-image/route.tsx` - expandir pra flex cards v2
- `components/LeaderboardTable.tsx` - novo componente
- `components/ShareButton.tsx` - expandir com flex card options

### Esforco estimado: 2-3 dias

---

## Release 3: Watchlist + Browser Push Notifications

**Objetivo:** Usuario marca creators pra acompanhar. Recebe push notification nativa quando fees unclaimed passam de threshold. Retencao sem precisar de account system.

### Componentes

**Watchlist UI**
- Botao "Watch" (icone de sino) no perfil do creator
- `/watchlist` page com lista de creators acompanhados
- Dropdown no header pra acesso rapido
- Threshold configuravel por creator (default: $10)

**Web Push Infrastructure**
- Service Worker (`public/sw.js`) pra receber push events
- VAPID keys (gratuito, sem servico terceiro)
- `web-push` npm package pra enviar do servidor
- Permission prompt contextual: "Get notified when @handle has new fees"

**Database**
- `push_subscriptions` (id, endpoint, p256dh_key, auth_key, created_at)
- `watchlist` (id, subscription_id, creator_id, threshold_usd, active, last_notified_at)
- Sem account system: vinculado a push subscription do browser

**Rate limits de subscription**
- Max 50 creators por push subscription (browser)
- Rejeitar subscriptions duplicadas (mesmo endpoint + mesmo creator)
- Cleanup cron: remover subscriptions com endpoint invalido (push falhou 3x consecutivas)

**Alert Cron**
- Roda a cada 1-4h (configuravel)
- Compara `fee_records.total_unclaimed_usd` vs `watchlist.threshold_usd`
- Dedup: nao notifica o mesmo creator 2x em 24h (via `last_notified_at`)
- Payload: "@handle has $X unclaimed fees" + deep link pro perfil

**Privacy**
- Opt-in only
- Unsubscribe com 1 click (no notification e na UI)
- Sem tracking pessoal, sem email, sem conta

**Limitacao conhecida**
- Watchlist vinculada ao browser (push subscription). Se usuario limpar dados do browser, perde a watchlist sem forma de recuperar. Trade-off aceito do approach sem account. Futuro: considerar export/import de watchlist via JSON

### Arquivos criticos
- `public/sw.js` - service worker novo
- `app/watchlist/page.tsx` - nova pagina
- `components/WatchButton.tsx` - novo componente
- `app/api/push/subscribe/route.ts` - registro de subscription
- `app/api/push/unsubscribe/route.ts` - remocao
- `app/api/cron/notify/route.ts` - cron de alertas
- `lib/push/send.ts` - wrapper do web-push

### Esforco estimado: 4-5 dias

---

## Release 4: Dashboard com Historico

**Objetivo:** Visao consolidada de earnings over time, graficos, breakdown por plataforma/chain. O usuario entende seu "big picture".

### Componentes

**Dashboard UI (evolucao do `/[handle]`)**
- Nao precisa de auth: qualquer um ve qualquer creator (como ja funciona)
- Tabs: Overview | Earnings | Claims | Tokens

**Earnings Timeline**
- Grafico de linha: total earned over time (diario/semanal/mensal)
- Library: `lightweight-charts` v5 (TradingView, ~35kB gzipped, React integration nativa) ou `recharts`
- Hover mostra breakdown do dia

**Charts**
- Platform breakdown: donut chart (Bags 40%, Pump 30%, etc)
- Chain breakdown: Solana vs Base split
- Claim rate: % claimed vs unclaimed over time

**Period Comparison**
- "This week vs last week" com growth %
- Highlight de tendencias (crescendo, estavel, caindo)

**Claim History Timeline**
- Visual dos claims feitos com tx links (expande o ClaimHistory existente)
- Filtro por plataforma/chain/status

**Database**
- `fee_snapshots` (id, creator_id, snapshot_date, platform, chain, total_earned, total_claimed, total_unclaimed, total_earned_usd)
- Cron diario que fotografa `fee_records` pra construir historico
- Retencao: 365 dias de snapshots
- Cleanup cron: `app/api/cron/cleanup-snapshots/route.ts` — deleta snapshots com mais de 365 dias. Rodar semanal

**Cron**
- `app/api/cron/snapshot-fees/route.ts` - daily, persiste estado atual
- Pode rodar junto com os crons existentes ou separado

### Arquivos criticos
- `app/[handle]/page.tsx` - refactor pra tabs/dashboard layout
- `components/EarningsChart.tsx` - novo
- `components/PlatformChart.tsx` - novo
- `components/PeriodComparison.tsx` - novo
- `components/ClaimHistory.tsx` - expandir
- `app/api/cron/snapshot-fees/route.ts` - novo cron
- `app/api/dashboard/[handle]/route.ts` - endpoint de dados historicos

### Esforco estimado: 5-7 dias

---

## Release 5: Embeddable Widget

**Objetivo:** Script JS que qualquer projeto embeda no site deles. Mostra fees unclaimed + CTA de claim. "Powered by ClaimScan". Cada embed = canal de aquisicao.

### Componentes

**Widget SDK**
- `<script src="https://claimscan.tech/widget.js">`
- `<div data-claimscan="@handle">` ativa o widget
- Renderiza iframe isolado (seguranca + styling independente)
- Tamanho: ~15KB gzipped

**Widget Variants**
- Compact: badge com total unclaimed + CTA
- Full: mini profile card com breakdown por plataforma
- Banner: horizontal, pra headers/footers

**Customizacao (via data attributes)**
- `data-theme="light|dark|auto"`
- `data-size="compact|full|banner"`
- `data-platforms="bags,pump,clanker"` (filtro opcional)

**Widget API**
- `/api/widget/[handle]` - retorna fees summary (total_earned, total_unclaimed, platform_count, claim_url)
- CORS aberto (Access-Control-Allow-Origin: *)
- Rate limit: 60 req/min por origin
- Cache: 15min
- **Seguranca**: endpoint retorna APENAS dados agregados. Nunca expor wallet addresses, identity resolution, ou dados internos via widget API

**Claim Flow**
- Click no widget abre ClaimScan em nova tab no perfil do creator
- Nao faz claim dentro do iframe (seguranca de wallet)

**Developer Page**
- `/developers` - snippet de codigo copiavel, preview ao vivo, docs de customizacao

**Analytics**
- `widget_analytics` table (origin_domain, handle, impressions, clicks, date)
- Tracking via pixel/beacon minimo

### Arquivos criticos
- `public/widget.js` - SDK do widget (standalone, zero deps)
- `app/widget/[handle]/page.tsx` - conteudo do iframe
- `app/api/widget/[handle]/route.ts` - API do widget
- `app/developers/page.tsx` - docs + snippet generator
- `supabase/migrations/` - tabela widget_analytics

### Esforco estimado: 5-6 dias

---

## Release 6: Auto-Claim

**Objetivo:** Creator configura regras: "claim automaticamente quando unclaimed passar de $X". ClaimScan executa. Premium feel, mais claims = mais receita.

**Nota:** Precisa de research de seguranca profundo antes de implementar.

### Componentes

**Pre-signed Authority**
- **Clanker (Base)**: `ClankerFeeLocker.claim()` e publicly callable — **nao precisa de delegacao**. Server pode chamar direto `claim(creatorAddress, token)` e os fees vao pro creator. Auto-claim mais simples
- **Pump.fun (Solana)**: `collectCreatorFee` **REQUER signature do creator**. NAO existe standard de session keys em producao no Solana (diferente de EVM com ERC-4337). Opcoes reais: (1) Token Program `Approve/Revoke` — delegacao simples com amount cap, revogavel, mas limitada a transfers, nao a claim calls (2) Custom PDA-based authority — programa proprio que valida regras antes de executar. **EVITAR `Permanent Delegate` extension** — risco inaceitavel. Definir mecanismo exato durante research de seguranca
- **EVM (Clanker, Zora)**: approve + smart contract que executa collect. Clanker ja e permissionless, Zora auto-distribui
- Revogacao facil e transparente em ambas as chains

**Rules Engine**
- `auto_claim_rules` (id, creator_id, wallet_address, chain, platform, threshold_usd, frequency_hours, active, last_executed_at)
- Configuravel por plataforma ou global

**Executor Cron**
- Roda a cada 30min
- Checa regras ativas onde unclaimed > threshold
- Executa claim + fee collection
- Notifica via push notification pos-claim

**Onboarding Wizard**
- "Enable auto-claim" no perfil
- Conecta wallet → assina authority → define threshold → ativa
- Explica claramente o que esta sendo autorizado

**Security**
- Rate limit por creator (max 5 auto-claims/dia)
- Notificacao de cada auto-claim executado
- Revogacao com 1 click
- Delegacao com amount cap e expiracao (Solana: via Approve com amount limit, EVM: via smart contract com timelock de 7-30 dias)
- Audit log completo em `claim_events`

### Arquivos criticos
- `app/api/auto-claim/setup/route.ts` - registro de authority
- `app/api/auto-claim/revoke/route.ts` - revogacao
- `app/api/cron/auto-claim/route.ts` - executor
- `lib/auto-claim/` - engine (rules.ts, executor.ts, authority.ts)
- `components/AutoClaimWizard.tsx` - onboarding UI

### Esforco estimado: 7-10 dias (+ research de seguranca)

**Requisito: audit externo de seguranca antes de ir pro ar.** Auto-claim com authority de mover fundos e a feature de maior risco do produto. Nao shipar sem review independente.

---

## Infraestrutura Transversal

Construida incrementalmente conforme as releases precisam:

**API Publica v2**
- Formalizar endpoints existentes (fees, resolve, prices) + novos (leaderboard, widget)
- Versionada: `/api/v2/`
- Documentada em `/docs`
- Rate limit: 100 req/min free, mais com API key (futuro)

**Vercel Cron Timeout**
- Vercel Hobby: serverless functions limitadas a 10s (60s com Fluid Compute habilitado)
- Crons que processam muitos records (notify, snapshot-fees, auto-claim) devem ser desenhados pra batch processing dentro do time limit
- Pattern: processar N records por invocacao com cursor, cron roda a cada X minutos ate completar. Ou usar Supabase pg_cron pra operacoes puramente SQL (snapshots, cleanup)
- Crons pesados (auto-claim com tx on-chain) considerar migrar pra Supabase Edge Functions ou worker dedicado se Vercel Hobby nao comportar

**Redis pub/sub**
- Necessario quando SSE precisar funcionar multi-instance (Vercel serverless)
- Upstash Redis suporta pub/sub via Redis protocol (nao via HTTP API). Em serverless puro (Vercel), considerar QStash (Upstash) como alternativa HTTP-native pra message delivery, ou usar pub/sub apenas em contextos com conexao persistente

**Expansao de chains (futuro, fora do scope v2)**
- Varias plataformas expandiram pra BSC/BNB Chain: Clanker (confirmado), RevShare (confirmado, creator fees 1-10% na BSC)
- Pump.fun NAO opera na BSC (BNBpump.fun e copycat)
- Adicionar BSC como chain no ClaimScan exige: novo RPC, chain adapter (viem ja suporta BSC), novos fee adapters por plataforma, e UI de chain selector
- Prioridade: avaliar apos v2 baseado em volume de fees na BSC

**Novas tabelas DB (resumo)**
- Release 1: `treasury_wallets`, expand `claim_attempts`/`claim_events`
- Release 2: `leaderboard_cache`
- Release 3: `push_subscriptions`, `watchlist`
- Release 4: `fee_snapshots`
- Release 5: `widget_analytics`
- Release 6: `auto_claim_rules`

---

## Verificacao

Cada release deve ser verificada com:
1. `npm run build` passa sem erros
2. `npm run dev -- -p 3001` funciona localmente
3. Testar claim flow end-to-end (com wallet de teste)
4. Verificar novos endpoints via curl/Postman
5. Checar Supabase migrations aplicam corretamente
6. `npm run test:e2e` quando aplicavel
7. Deploy preview no Vercel antes de merge pra main

**Releases que envolvem claim (1, 6) sao obrigatorias:**
- E2e test com wallet devnet/testnet antes de mainnet
- Teste de claim + fee collection completo
- Teste de edge cases (rejeicao de tx, timeout, wallet desconectada mid-flow)
- Teste de rollback da migration antes de aplicar em prod

## Rollback Strategy

Cada release deve ter rollback definido antes do deploy:
- **Database**: toda migration deve ter um `down` migration testado. Nunca dropar coluna sem periodo de deprecation
- **Features**: feature flags pra releases de alto risco (claim adapters, auto-claim). Desligar sem redeploy
- **Hotfix**: branch `hotfix/*` direto da main, deploy em menos de 15min
- **Crons**: novos crons devem ter kill switch via env var (ex: `ENABLE_AUTO_CLAIM=true`). Default off ate validacao em prod

## Monitoring & Alertas

Construir incrementalmente junto com as releases:

**Claims (Release 1+)**
- Alerta quando claim falha 3x consecutivas na mesma plataforma
- Alerta quando fee collection rate cai abaixo de 80% (muitos `fee_skipped`)
- Dashboard de claims/dia, fee revenue/dia, success rate

**Treasury (Release 1+)**
- Alerta se saldo da treasury wallet variar mais de 20% em 1h (possivel exploit)
- Relatorio diario de fee revenue coletado por chain

**Crons (Release 3+)**
- Alerta se qualquer cron nao executar no intervalo esperado
- Log de execucao com contagem de notificacoes enviadas, snapshots criados, auto-claims executados

**Infra**
- Ja tem Sentry pra errors. Adicionar custom alerts pra claim-specific failures
- Uptime check no endpoint `/api/health` (criar se nao existe)

---

## Backlog: Audit Findings (2026-03-22)

Findings das 25 auditorias de skills que nao foram implementados na sessao. Organizados por categoria.

### Infraestrutura / Performance

| Item | Contexto | Prioridade |
|------|----------|------------|
| **CoinGecko demo API key** | Sem key, free tier limita 10-15 req/min e pode bloquear por IP. Registrar em coingecko.com (gratis, garante 30 req/min com header `x-cg-demo-api-key`) | Alta |
| **CoinGecko TTL cache no bot** | Bot process (VPS) nao tem Next.js data cache. Cada /scan e poll hit CoinGecko direto. Adicionar TTL de 60-120s no `lastKnownNativePrices` em `lib/prices/index.ts` | Media |
| **Priority fees na fee tx** | Fee tx do ClaimScan nao tem `ComputeBudgetProgram.setComputeUnitPrice`. Usar Helius `getPriorityFeeEstimate` pra melhorar landing rate em congestionamento | Alta (Release 1) |
| **radix-ui umbrella → individual** | `radix-ui@1.4.3` puxa todos os primitivos. Auditar quais sao usados (Dialog, provavelmente poucos outros) e trocar pra `@radix-ui/react-dialog` etc. Pode economizar 50-100KB+ do bundle | Media |
| **Sitemap paginado** | `app/sitemap.ts` limitado a 1000 creators. Implementar `generateSitemaps()` com paginacao quando passar esse threshold | Media (escalar) |
| **@solana/kit migration** | web3.js 1.98 → @solana/kit. Bloqueado por wallet-adapter e Anchor (nao suportam kit). Revisitar Q3/Q4 2026 | Futura |

### UX / Frontend

| Item | Contexto | Prioridade |
|------|----------|------------|
| **autoConnect wallet** | `autoConnect` reconecta wallet automaticamente. Risco em dispositivos compartilhados. Decidir: remover, gate por localStorage opt-in, ou manter (accepted risk) | Decisao |
| **transition-all → explicit** | 11 instancias de `transition-all` (anti-pattern de performance). Trocar por listas explicitas de propriedades (`transition-[background-color,transform]` etc). Fix mecanico mas extenso | Baixa |
| **Dark mode activation** | Variaveis CSS dark mode estao scaffolded mas nunca ativadas (sem theme toggle, sem `class="dark"`). Todo codigo `dark:` e `.dark {}` e dead code. Decidir: ativar ou remover | Decisao |
| **Signal Lock animation dark mode** | Loading animation inteiramente hardcoded pra light mode (`rgba(0,0,0,...)`, `rgba(255,255,255,...)`). Se dark mode for ativado, precisa de `.dark .signal-*` overrides | Condicional (se dark mode) |

### SEO / Growth

| Item | Contexto | Prioridade |
|------|----------|------------|
| **Internal linking entre profiles** | Zero links entre paginas /[handle]. Google trata cada perfil como pagina orfa. Adicionar "Related Creators" section com 5-8 links cruzados. Maior impacto SEO possivel | Alta |
| **Telegram bot** | @ClaimScanBot — `/scan @handle` retorna earnings. Demo natural das capabilities da LW ARTS. Crypto Telegram groups espalham rapido | Media (Release 2-3) |
| **Comparison pages** | `/compare/handle1/handle2` — "Quem ganhou mais?" Mecanica viral natural pra X | Media |
| **Aggregate stats counter** | Homepage com "X creators scanned, $Y tracked" — social proof quantitativo | Baixa |
| **Embeddable badge** | `claimscan.tech/badge/handle.svg` pra bios e READMEs. Diferente do widget (Release 5) — e so uma imagem estatica | Baixa |

### Conversao LW ARTS

| Item | Contexto | Prioridade |
|------|----------|------------|
| **CTA "Need a tool built?"** | Falta conversao explicita de ClaimScan pra servicos pagos da LW. Adicionar linha sutil no footer: "Built by LW ARTS — We build tools for crypto teams" | Baixa |
| **UTM tracking nos links LW** | Links pra `lwdesigns.art` nao tem `?ref=claimscan`. Impossivel medir ROI do free tool | Baixa |

---

## Roadmap Visual

```
Release 1: Multi-Chain Claiming + Fee -----> RECEITA
Release 2: Leaderboard + Flex Cards -------> GROWTH
Release 3: Watchlist + Push Notifications -> RETENCAO
Release 4: Dashboard com Historico --------> DEPTH
Release 5: Embeddable Widget -------------> ECOSSISTEMA
Release 6: Auto-Claim --------------------> PREMIUM
```

Total estimado: ~30-40 dias de desenvolvimento incremental.
Cada release e independente e shippable, exceto Release 6 (Auto-Claim) que depende de Release 1 (Multi-Chain Claiming) estar completa.

---

## Backlog: Round 3 Audit Findings (2026-03-22)

Findings da terceira rodada de auditorias (12 skills adicionais). Organizados por tipo.

### Integracoes (Raydium + Meteora)

| Item | Contexto | Prioridade |
|------|----------|------------|
| **Raydium: sem paginacao** | API retorna `nextPageId` mas adapter so faz 1 request (`size=100`). Creators com >100 tokens truncados | Media |
| **Raydium: fees atribuidas ao primeiro token** | Vault PDA e por creator (nao por token), mas UI mostra tudo no primeiro token. Perde granularidade | Baixa (by design) |
| **Raydium: imageUrl sempre null** | API retorna `metadataUrl` (IPFS), nao `imageUri`/`image`. Precisa fetch extra do metadata JSON | Baixa |
| **Meteora SDK 1.5.5 → 1.5.6** | Um patch atras. `npm install` resolve via semver | Trivial |
| **Meteora: unhandled rejection no timeout race** | `raceGpaTimeout` pode produzir rejection nao-handled se GPA resolve apos timeout | Baixa |
| **Meteora: SDK tem `getPoolFeeBreakdown`** | Poderia substituir Helius `fetchVaultClaimTotal`, economizando credits. Trade-off: mais RPC calls | Oportunidade |

### Vercel / Infra

| Item | Contexto | Prioridade |
|------|----------|------------|
| **Crons rodam 1x/dia** | Precos e tokens ficam stale por ate 24h. Aumentar frequencia ou usar cron externo | Alta |
| **maxDuration=60 ineficaz no Hobby** | Vercel Hobby cap e 10s. SSE endpoints cortados antes de adapters lentos responderem | Info (Pro resolve) |
| **Sem preferredRegion** | Functions deployam em iad1 por default. Pode nao coincidir com regiao do Supabase | Media |
| **tsconfig nao exclui video/** | Type-check desnecessario do diretorio video | Baixa |
| **CI e2e faz build duplicado** | Job e2e roda npm run build de novo em vez de reusar artifact do job build | Baixa |
| **Sem Vercel Speed Insights** | Core Web Vitals monitoring gratuito, so precisa adicionar `@vercel/speed-insights` | Baixa |

### Pricing / Legal

| Item | Contexto | Prioridade |
|------|----------|------------|
| **Threshold efetivo e ~$17.60** | Documentado como $5, mas `MIN_FEE_LAMPORTS` equivale a ~$17.60 a precos atuais | Corrigir docs |
| **Pagina /terms nao existe** | Fee disclosure exige Terms of Service. Nao tem ToS, nem link no ClaimDialog | Alta (pre-launch claims) |
| **FAQ docs nao menciona fee** | `/docs` diz "Is ClaimScan free? Yes" sem mencionar 0.85% no claim | Media |
| **Fee cap recomendado: $50** | Sem cap, whale claims de $10K+ pagam $85+ — risco de desvio pra claim direto | Media (Release 1) |
| **Tiers recomendados** | $5-1K: 0.85%, $1K-10K: 0.60%, $10K+: 0.40% | Media (Release 1) |

### Onboarding / UX

| Item | Contexto | Prioridade |
|------|----------|------------|
| **Loading sem indicacao de progresso** | 10-30s de scan sem timer/progress bar. Maior risco de abandono | Alta |
| **Sem autofocus no search** | Homepage com 1 acao (search) mas usuario precisa clicar o input primeiro | Media |
| **Share escondido quando $0** | Criadores com tudo claimed nao podem compartilhar. "$0 unclaimed" tambem e shareavel | Media |
| **404 generico pra "no results"** | Deveria ter `[handle]/not-found.tsx` contextual com sugestoes | Media |
| **10s timeout no SearchBar** | Resolve timeout e 55s mas botao re-habilita em 10s. Risco de double-submit | Baixa |

### Estrategia (documentos separados)

| Documento | Localizacao |
|-----------|-------------|
| **Launch Strategy v2** (timeline 90 dias, 6 releases) | `docs/plans/2026-03-22-v2-launch-strategy.md` |
| **Competitive Intelligence** (landscape, positioning, partnerships) | Findings do CT Alpha agent — consolidar em doc separado |
| **GTM Playbook** (positioning, community, content, distribution) | Findings do Web3 GTM agent — consolidar em doc separado |
| **A/B Test Plan** (3 testes sequenciais, Vercel Flags) | Findings do A/B agent — implementar com Release 1 |
| **TanStack Integration Plan** (provider nesting, config, migration scope) | Findings do TanStack agent — implementar com Release 1 |
| **Telegram TWA Architecture** (rota /twa, fases incrementais) | Findings do TWA agent — implementar com Release 3-4 |

### Avaliados e descartados

| Item | Motivo |
|------|--------|
| **Biome (substituir ESLint)** | Perde 15 React 19 compiler rules + 16/21 Next.js rules. Setup atual e minimal. Nao migrar |
| **@solana/kit migration** | Wallet adapter e Anchor nao suportam. Revisitar Q3/Q4 2026 |
