# ClaimScan

Plataforma de rastreamento e claim de fees de tokens cross-chain (Solana + Base + ETH + BSC).
Agrega fees de 9 launchpads: Pump.fun, Bags.fm, Clanker (Base+BSC), Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium.
API v2 paga via x402 protocol (pay-per-query).

## Stack
- Next.js 16.2, React 19, TypeScript
- Tailwind CSS 4 + Radix UI + Motion 12 + Lottie
- Solana: @solana/web3.js, wallet-adapter, spl-token
- EVM: Viem 2.47
- DB: Supabase (PostgreSQL + RLS)
- Cache: Upstash Redis (fallback: in-memory)
- Security: Sentry, Cloudflare Turnstile, request signing
- Payments: x402 protocol (pay-per-query API v2)
- Intelligence: Allium API (wallet PnL enrichment)
- Identity: OWS wallet resolution
- Deploy: Vercel

## Estrutura
```
app/
  page.tsx                    # Home (hero + search)
  [handle]/page.tsx           # Perfil do creator (10s timeout)
  leaderboard/page.tsx        # Ranking de creators por fees
  terms/page.tsx              # Terms of Service (inclui pricing v2)
  docs/page.tsx               # API docs
  api/
    search/                   # POST - resolve identity + fetch fees
    resolve/                  # GET - wallets de uma identity
    prices/                   # GET - precos cached (5min revalidate)
    fees/aggregate/           # GET - fees agregadas por creator
    fees/live/                # GET - fees real-time (onchain)
    fees/stream/              # SSE - stream de fees
    claim/confirm/            # POST - update claim status
    claim/bags/               # POST - Bags.fm claim flow
    balance/                  # GET - saldo de wallet
    flex/                     # GET - flex stats do creator
    export/                   # GET - exportar dados do creator
    avatar/                   # GET - avatar proxy
    admin/                    # rotas administrativas
    stats/                    # GET - public stats (ISR 24h, sWR)
    og-download/[handle]/     # GET - download OG dinamico
    v2/fees/                  # GET - fees ($0.01/req, x402)
    v2/export/                # GET - export ($0.05/req, x402)
    v2/intelligence/          # GET - Allium wallet PnL ($0.02/req, x402)
    v2/resolve/               # GET - OWS wallet resolution (x402)
    v2/[...path]/             # Catch-all x402 routing
    cron/index-fees/          # Vercel Cron - sync fees
    cron/index-tokens/        # Vercel Cron - discover tokens
    cron/refresh-prices/      # Vercel Cron - update prices
    cron/cleanup/             # Vercel Cron - limpar claims expirados
    leaderboard/              # GET - creator fee ranking
    webhooks/helius/          # Helius DAS webhooks
    honeypot/[...path]/       # Trap pra scrapers (retorna dados fake)
  [handle]/opengraph-image.tsx     # OG dinamico por creator
  leaderboard/opengraph-image.tsx  # OG dinamico do leaderboard
  loading.tsx                      # Skeleton fallback global (skeleton blocks pulse)
  docs/loading.tsx                 # Skeleton: header + sidebar lg+ + 3 sections
  terms/loading.tsx                # Skeleton: legal doc com numbered sections
  leaderboard/loading.tsx          # Skeleton: header + filter chips + 10 ranking rows
  [handle]/loading.tsx             # Skeleton: signal radar (scanning animation)
  components/
    anim/                     # CountUp, RevealOnScroll, RevealMount + tokens.ts (DURATION/EASE)
    DocsSidebar.tsx           # Sidebar nav /docs
    TermsSidebar.tsx          # Sidebar nav /terms
    LiveFeesProvider.tsx      # React Context — owns SSE polling, exposes useLiveFees() hook
lib/
  platforms/                  # 9 adapters (bags, pump, clanker, zora, bankr, believe, revshare, coinbarrel, raydium)
  chains/                     # solana.ts, base.ts, eth.ts, bsc.ts, clanker-reads.ts
  supabase/                   # client.ts, server.ts, service.ts
  resolve/                    # Identity resolution (Twitter/GitHub/Farcaster/wallet)
  prices/                     # DexScreener → Jupiter → CoinGecko waterfall
  claim/hmac.ts               # Confirmation tokens
  allium/client.ts            # Allium API - wallet PnL enrichment
  ows/resolve.ts              # OWS wallet name resolution
  x402/server.ts              # x402 payment protocol server
  services/                   # creator.ts, fee-sync.ts, resolve.ts, stats.ts
  hooks/use-reduced-motion.ts # Accessibility hook (respeitar prefers-reduced-motion)
  request-signing.ts          # Request signing for API security
  constants-evm.ts            # EVM-specific constants
  logger.ts                   # Structured logger centralizado
proxy.ts                      # Security middleware (~528 linhas) - nao existe middleware.ts
supabase/migrations/          # 29 migration files
DESIGN-SPEC.md                # Design system source of truth (extraido de Claimscan.pen)
Claimscan.pen                 # Pencil design file - editar via Pencil MCP
design-reference/             # PNGs @2x do design (referencia visual)
```

## DB Schema (Supabase)
- `creators` - identidade central (handles twitter/github/farcaster/wallet)
- `wallets` - enderecos linkados a creators (chain, platform)
- `creator_tokens` - tokens lancados por creators
- `fee_records` - fees cached (total_earned, claimed, unclaimed, USD)
- `claim_events` - historico de claims (tx_hash)
- `claim_attempts` - status tracking (pending→signing→submitted→confirmed→finalized/failed/expired)
- `token_prices` - cache de precos
- `search_log` - analytics

## Convencoes
- Token amounts como **string** (BigInt precision, nunca Number)
- Decimals: Solana=9, EVM=18
- Chain types: 'sol' | 'base' | 'eth' | 'bsc'
- Claim status: claimed | unclaimed | partially_claimed | auto_distributed
- Cache TTL: 40min normal, 2h pra creators com 500+ records
- Price waterfall: DexScreener → Jupiter (Solana only). CoinGecko somente para precos nativos (SOL/ETH)
- Rate limiting: 30 req/min geral, 10 req/min search, 60 handles/5min anti-enumeration (100 para anon fingerprints). Same-origin Referer pula a checagem (browse legítimo do leaderboard). Paths reservados (/leaderboard, /docs, /terms, favicon, manifest, etc.) ficam fora da contagem mesmo matchando HANDLE_ROUTE_RE
- proxy.ts (~528 linhas): security headers, tarpit, honeypot, CORS, request signing, x402 routing — nao existe middleware.ts. CSP em `buildCspHeader()`. `style-src` allowlista `fonts.googleapis.com` (DM Sans do `@solana/wallet-adapter-react-ui`)
- Cron endpoints protegidos com CRON_SECRET bearer token
- Animacoes: usar componentes em `app/components/anim/` + tokens.ts (DURATION/EASE). Sempre respeitar `useReducedMotion`
- Design tokens: editar SOMENTE em `Claimscan.pen` via Pencil MCP, depois sincronizar `DESIGN-SPEC.md` e `app/globals.css`
- **Live fees no perfil (`/[handle]`)**: SSE polling vive em `LiveFeesProvider` (Context). Tanto `ProfileHero` quanto `PlatformBreakdown` consomem via `useLiveFees()` hook. O Map é chaveado por `${platform}:${chain}:${tokenAddress}` (composite key). NUNCA dar polling separado — sempre via provider
- **Merge de displayFees em PlatformBreakdown** (ordem importa): 1) cached fees → 2) live overlay (re-derivar `claim_status` dos amounts frescos) → 3) `claimedMints` optimistic overlay (claim acabou de rolar, ganha de tudo). Tokens que aparecem só em live (não indexados ainda pelo cron) viram virtual rows com `id="live:<key>"`, `creator_id: ''`
- **Currency display rules**: NÃO usar `font-mono` em valores bold de moeda (`$X.YK`). O Inter bold em sizes pequenos renderiza period com side-bearings visíveis ("$844 . 27K"). Use `tabular-nums` solo, ou `tracking-tight`, ou — pra valores K em contexto compacto — strip os decimais via `formatUsd(v).replace(/\.\d+K$/, 'K')`
- **Mobile micro-interactions**: todas as utility classes `.hover-glow / .hover-lift / .card-hover / .row-hover / .hover-ring` têm `:active` mirror em `@media (hover: none)` no globals.css. Quando criar nova hover utility, adicionar o mirror também

## Env (principais)
- .env.example existe na raiz — usar como base pra setup local
- **IMPORTANTE:** ao setar env vars na Vercel UI, SEMPRE usar `printf '%s' '<value>' | npx vercel env add <NAME> production` em vez de copy-paste no formulário web — copy-paste do navegador frequentemente acrescenta `\n` literal ao final do valor, que vira newline real após o dotenv parser. Esse bug quebrou `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL` e `ETH_RPC_URL` em produção (audit 2026-04-07 findings N-01 e similares). Pra verificar valores existentes: `vercel env pull /tmp/.env && grep '^NAME=' /tmp/.env | od -c` — checa os bytes finais
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# RPC endpoints — providers atuais em produção:
SOLANA_RPC_URL              # Helius (server-only, com api-key principal)
NEXT_PUBLIC_SOLANA_RPC_URL  # Helius restricted frontend key — domain-locked aos 5 hosts canônicos (claimscan.tech, www.claimscan.tech, claimscan-nine.vercel.app, claimscan-screwks-projects.vercel.app, claimscan-screwk-screwks-projects.vercel.app). NÃO suporta preview deploys.
BASE_RPC_URL                # Alchemy (base-mainnet.g.alchemy.com)
ETH_RPC_URL                 # Alchemy (eth-mainnet.g.alchemy.com)
BSC_RPC_URL                 # Alchemy (bnb-mainnet.g.alchemy.com)

# Platform API keys
BAGS_API_KEY                # legacy single key (mantido por compat)
BAGS_API_KEYS               # comma-separated multi-key rotation (preferred — round-robin para evitar rate limits)
ZORA_API_KEY
BANKR_API_KEY               # Bankr platform API
NEYNAR_API_KEY              # Farcaster Neynar (alternativa ao public Farcaster Hub para identity resolution)
HELIUS_API_KEY              # Helius DAS / Enhanced Transactions / Webhooks management

# Webhooks + cron auth
HELIUS_WEBHOOK_SECRET       # Bearer token validado em /api/webhooks/helius com timingSafeEqual
CRON_SECRET                 # min 32 chars, bearer pra /api/cron/* — verificado em proxy.ts e lib/supabase/service.ts

# Claim flow
CLAIM_HMAC_SECRET           # min 32 chars, HMAC-SHA256 pra confirmation tokens em lib/claim/hmac.ts

# Rate limiting / replay protection
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

# CAPTCHA
NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY

# Anti-scraping (intencionalmente exposto ao browser — NÃO é security boundary)
NEXT_PUBLIC_API_SIGN_KEY

# Monitoring
NEXT_PUBLIC_SENTRY_DSN

# x402 paid API v2
X402_WALLET_ADDRESS         # EVM address que recebe USDC. Em prod: 0xAb0800673c3E80587e48ACdB7d2a81089aC22DD4 (Base mainnet)
X402_NETWORK                # MUST be 'eip155:8453' em produção. Default no código é 'eip155:84532' (Sepolia testnet) — lib/x402/server.ts faz fail-closed throw se mainnet não setado em prod
X402_FACILITATOR_URL        # https://api.bitrefill.com/x402 (Bitrefill, terceiro). Trust model documentado em lib/x402/server.ts. Coinbase Developer Platform é fallback recomendado se Bitrefill ficar indisponível.

# Intelligence enrichment
ALLIUM_API_KEY              # Allium wallet PnL (opcional — /v2/intelligence degrade graceful sem)

# Price providers
COINGECKO_API_KEY, JUP_API_KEY

# Misc
RESOLVE_TIMEOUT_MS          # optional, default 55000 — override para deploys externos
```

## Git
- origin: https://github.com/screwk/claimscan.git
- moinho: https://github.com/LW-ARTS/ClaimScan-Moinho.git
- .github/PULL_REQUEST_TEMPLATE.md e CODEOWNERS configurados

## Scripts
```
npm run dev -- -p 3001   # Next.js dev (porta padrao do projeto)
npm run build            # Production build
npm run lint             # ESLint
npm run test:unit        # Vitest (unit tests)
npm run test:e2e         # Playwright tests
npm run test:e2e:ui      # Playwright UI mode
```

## Cuidados
- maxDuration=60s nas API routes (Vercel Hobby max), wallclock guards em crons usam 55s
- Creators grandes (500+ fees) sao cacheados por cron, nao on-demand
- Middleware e gigante - qualquer mudanca de security header, editar com cuidado
- Honeypot endpoint retorna dados falsos - nao confundir com API real
- Wallet adapter auto-discovers wallets via Wallet Standard (sem imports explicitos)
- Sentry org: lw-52.sentry.io (project: claimscan, team: #lw)
- `Claimscan.pen` e arquivo encriptado — NUNCA ler com Read/Grep, usar `pencil` MCP (`batch_get`/`batch_design`)
- OG images dinamicas (`opengraph-image.tsx`) sao server components — nao usar hooks nem Wallet context
- `app/api/stats` usa ISR 24h — invalidacao automatica, nao precisa cron
- **Pump.fun synthetic token IDs**: o adapter retorna `tokenAddress: 'SOL:pump'` (`tokenSymbol: 'SOL'`) e `tokenAddress: 'SOL:pumpswap'` (`tokenSymbol: 'SOL (PumpSwap)'`) — vault aggregates, nao mints reais. Cache e live stream usam os mesmos IDs sinteticos. O `(PumpSwap)` é stripado pelo `tokenDisplay()` em TokenFeeTable que pega só o primeiro whitespace token
- **Stat card vs filter invariant** no perfil: o que `Total Unclaimed` mostrar TEM que ser igual à soma USD das rows visíveis no filtro Unclaimed. Se quebrar, é porque alguém reintroduziu um data source diferente entre `displayUnclaimedUsd` (ProfileHero) e `displayFees` (PlatformBreakdown). Ambos lêem do mesmo `useLiveFees().liveRecords` Map
- **Turbopack file watcher dies on long sessions** (Next.js 16 dev server). Sintoma: source file modificado mas dev server serve código velho. Antes de "re-fixar" qualquer bug que parece não pegar, fazer `curl -s http://localhost:3001/<route> | grep <className-novo>`. Se vier vazio → kill PID e restart com `rm -rf .next/ && npm run dev -- -p 3001`
- **TODO performance — Helius Enhanced Transactions APIs**: o cron `index-fees` e o `claim/confirm` (verificação de fee tx) atualmente fazem `getSignaturesForAddress` + N × `getTransaction` raw e parseiam preBalances/postBalances no braço. O Helius oferece 2 endpoints já parseados que substituiriam isso com 1 call: `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=...` (parse N tx signatures) e `https://api-mainnet.helius-rpc.com/v0/addresses/{addr}/transactions/?api-key=...` (parse history paginado por address). Retorna `tokenTransfers[]`, `nativeTransfers[]`, instruction types tipados (`SWAP`, `TRANSFER`, `NFT_SALE`, etc). Reduziria latência do cron + simplificaria os adapters de plataforma. Não está adotado ainda — usar a `SOLANA_RPC_URL` (que tbm é Helius) é o padrão atual
- **Marco 2026-04-07 — V2.5 shipped + endorsement do FINN/Bags**: ClaimScan V2.5 lançado (visual redesign, real-time fees, public leaderboard, mobile-first pass, hardening sweep). Cobertura: 9 launchpads, 4 chains. Métricas no anúncio: $1.7M+ fees tracked, 397+ wallets scanned, ~40% left unclaimed. FINN (@finnbags, founder/CEO da Bags) comentou "nice work!" no post de anúncio (x.com/finnbags/status/2041612548995477746) — validação pública direta do criador de uma das plataformas trackadas. Usar como social proof em outreach pra outros launchpads e em landing copy.
- **TODO arquitetural — migrar wallet stack pra Reown AppKit Multi-Adapter quando entrar a Fase 2 (claims EVM)**: ClaimScan hoje só assina Solana (claims Bags.fm). Quando começar a fazer claims EVM (Clanker/Zora/Bankr em Base, BSC, ETH), o caminho recomendado é substituir `@solana/wallet-adapter-react-ui` por `@reown/appkit` com `WagmiAdapter` + `SolanaAdapter` no mesmo `createAppKit({ adapters: [wagmiAdapter, solanaAdapter], networks: [mainnet, base, bsc, solana] })`. Vantagens: (1) modal único pra todas as 4 chains do estilo `kolscanbrasil.io` (Phantom + MetaMask + WalletConnect categorizados), (2) `<appkit-button />` é Web Component em Shadow DOM — provavelmente resolve o L-04 (`'unsafe-inline'` em `style-src` no `proxy.ts`), (3) WalletConnect built-in com 600+ wallets, (4) uma única API (`useAppKitAccount`/`useAppKitProvider`) em vez de wagmi + solana hooks separados. **Caveats conhecidos** (issues abertas em `reown-com/appkit`): #5095 switchNetwork bugado entre Solana↔EVM em multi-chain wallets, #4675 Solana provider pode falhar ao trocar de EVM pra Solana, #4674 MetaMask connection mostra MULTICHAIN baseado em adapters não networks. Nenhum é showstopper pro caso ClaimScan (user com Phantom + MetaMask separados), mas validar com POC de 4-8h em branch antes de comprometer. Migração estimada: 3-5 dias depois do POC. Ao migrar, pode remover `'unsafe-inline'` do `proxy.ts:268` e fechar L-04 do audit 2026-04-07

<!-- GSD:project-start source:PROJECT.md -->
## Project

**ClaimScan**

Plataforma de rastreamento e claim de fees de tokens cross-chain (Solana, Base, ETH, BSC). Agrega fees de 9 launchpads (Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium) com live SSE updates, leaderboard publico, e API v2 paga via x402. V2.5 live em producao com endorsement publico do FINN/Bags.

**Core Value:** Mostrar aos creators de tokens quanto dinheiro eles tem parado em fees nao-claimadas, de forma precisa e em tempo real, cobrindo todos os launchpads relevantes.

### Constraints

- **Infra**: Vercel Hobby (maxDuration=60s, SSE 10s cap)
- **APIs externas**: Rate limits variam por plataforma, some APIs sem SLA
- **Wallets de teste**: Usar wallets publicas de creators conhecidos (hardcoded)
- **CI budget**: GitHub Actions free tier (2000 min/mes)
- **Sem DB em testes**: Adapter tests chamam APIs reais, nao mocam Supabase
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Runtime & Languages
- **Node.js** runtime (inferred from package.json)
- **TypeScript** 5.x (strict mode enabled)
- **JavaScript** (ES2020 target)
## Core Framework & Runtime
- **Next.js** 16.2.2 (App Router)
- **React** 19.2.4 (with server/client component split)
- **React DOM** 19.2.4
## UI & Styling
- **Tailwind CSS** 4.x with PostCSS (`@tailwindcss/postcss`)
- **Radix UI** 1.4.3 (headless component primitives)
- **Class Variance Authority** 0.7.1 (component styling pattern)
- **Lucide React** 0.577.0 (icon library)
- **Motion** 12.35.0 (animation framework)
- **Lottie React** 2.4.1 (Lottie animations)
- **OGL** 1.0.11 (WebGL graphics library)
- **Geist** 1.7.0 (Vercel design system)
- **Clsx** 2.1.1 (className utility)
- **Tailwind Merge** 3.5.0 (class merging)
## Blockchain & Web3
### Solana
- **@solana/web3.js** 1.98.4 (core SDK)
- **@solana/wallet-adapter-base** 0.9.27
- **@solana/wallet-adapter-react** 0.15.39
- **@solana/wallet-adapter-react-ui** 0.9.39 (modal/UI)
- **@solana/spl-token** 0.4.14 (token program)
- **@solana/codecs** 2.3.0 (encoding/decoding)
### EVM (Base, Ethereum, BSC)
- **Viem** 2.47.0 (Ethereum client library)
- **@x402/core** 2.8.0 (payment protocol - resource server)
- **@x402/evm** 2.8.0 (EVM payment settlement)
- **@x402/extensions** 2.8.0
- **@x402/next** 2.8.0 (Next.js integration)
### DeFi & Exchange SDKs
- **@meteora-ag/dynamic-bonding-curve-sdk** 1.5.5 (Meteora platform)
- **@coinbarrel/sdk** 3.2.7 (Coinbarrel platform)
## Database & Storage
- **Supabase** 
## Caching & Rate Limiting
- **Upstash Redis**
## Monitoring & Error Tracking
- **@sentry/nextjs** 10.46.0 (error monitoring, source map upload)
## Analytics
- **@vercel/analytics** 2.0.1
- **@vercel/speed-insights** 2.0.0
## Development Tools
- **TypeScript** 5.x
- **ESLint** 9.x
- **Vitest** 4.1.0 (unit testing)
- **Playwright** 1.58.2 (E2E testing)
- **Shadcn** 3.8.5 (component installer)
- **Tailwind Animate CSS** 1.4.0
## Configuration Files
| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript compiler options (ES2020, strict mode, path aliases) |
| `next.config.ts` | Next.js config (Sentry integration, image optimization, experimental features) |
| `.env.example` | Environment variable template |
| `.eslintrc` (inferred) | ESLint configuration |
## Build & Deploy
- **Vercel** deployment target
- **Edge Functions** for middleware (`proxy.ts`)
- **Serverless Functions** (maxDuration: 60s Hobby plan limit)
- **ISR (Incremental Static Regeneration)** on `/api/stats` (24h revalidate)
- **Next.js Cron Jobs** for scheduled tasks (`/api/cron/*`)
## Key Dependencies Overrides
- **bigint-buffer**: patched locally (`patches/bigint-buffer`)
## Build Output
- Production source maps: disabled (`productionBrowserSourceMaps: false`)
- Console logs: stripped except errors
- Package imports optimized: `lucide-react`, `motion`
- Server external packages: `@solana/web3.js`, `viem`, `@meteora-ag/dynamic-bonding-curve-sdk`
## Image Formats & Optimization
- Formats: AVIF, WebP
- Remote patterns allowed:
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## TypeScript & Compiler
- Path alias: `@/*` → root directory
- No implicit `any`; all function parameters typed
- Return types explicitly annotated on public functions
- Use `type` for interfaces; avoid `interface` unless extending a third-party type
## Imports & Module Structure
- **Server-only modules** use `import 'server-only'` at top (e.g., `lib/logger.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`)
- **Client components** use `'use client'` directive
- **Server components** are default; no directive needed
- Import order: React/Next first, then `@/lib`, then relative paths
- Absolute imports via `@/` for all cross-module references
## Naming Conventions
- Components: PascalCase (`ErrorBoundary.tsx`, `WalletButton.tsx`)
- API routes: kebab-case (`/api/fees/live/route.ts`, `/api/fees/aggregate/route.ts`)
- Utilities/libs: camelCase (`logger.ts`, `request-signing.ts`, `constants-evm.ts`)
- Test files: `filename.test.ts` or `filename.spec.ts`
- Functions: camelCase (`createLogger`, `formatUsd`, `safeBigInt`)
- Constants: UPPER_SNAKE_CASE (`MIN_LEVEL`, `VALID_CHAINS`, `PLATFORM_CONFIG`)
- Type unions/enums: PascalCase or UPPER_SNAKE_CASE (`LogLevel`, `Chain`)
- Private module state: `SUPABASE_KEY` pattern (constants for globalThis keys)
- Always store as **string** in databases and API responses (e.g., `total_earned: '1000000000'`)
- Convert to `bigint` using `safeBigInt(val)` for arithmetic
- Never use `Number` for values >2^53; use BigInt division:
## Error Handling Patterns
- Use `Promise.allSettled` for parallel operations that may partially fail
- Catch errors at API route level, return structured `{ error: 'message' }` with appropriate HTTP status
- Never expose internal error messages to client; log to Sentry instead
- Use `AbortSignal` with `AbortController` for request timeouts
- API routes declare `export const maxDuration = 60` (Vercel Hobby limit is 10s)
- Cron jobs use 55s wallclock guards to stay under 60s limit
- Guard against null/undefined early: `if (!val) return 0n`
- Use regex for format validation (addresses, UUIDs, chains)
- Return structured errors with 400 (bad input) or 403 (auth failure)
## Logging Patterns
- All logging via `createLogger(module: string)` → returns `Logger` interface
- Each module has single logger instance; pass logger to functions needing it
- Child loggers for nested context: `logger.child({ wallet: '...', platform: 'pump' })`
- Performance timing via `logger.time(msg, asyncFn, extra)`
- Dev: `[module] message { key: value }`
- Prod: JSON with `ts`, `level`, `module`, `msg`, `traceId`, custom fields
## Fee Math Conventions
- All amounts stored as strings to preserve BigInt precision
- Decimals: Solana=9, EVM=18, BSC=18
- Use `formatTokenAmount(raw: string, decimals: number)` for display
- Use `formatUsd(value: number)` for currency display (K/M suffix)
## Component Patterns
- Fetch data directly in server component
- Pass data via props to client children
- Use `async` directly in component body
- Use `'use client'` at top
- Respect `useReducedMotion()` for animations (a11y compliance)
- Error boundaries are client components: class-based with `componentDidCatch`
- SSE polling state lives in `LiveFeesProvider` (React Context)
- Components consume via `useLiveFees()` hook
- Map keyed by `${platform}:${chain}:${tokenAddress}` (composite key)
- No separate polling per component; all use provider
## Request Signing & Security
- Use `timingSafeEqual` for secret comparison (prevents timing attacks)
- Pad buffers to equal length before comparison
- Store secrets as env vars; never in code or git
- Use bearer tokens: `Authorization: Bearer <secret>`
- Sign requests to prevent replay attacks: `verifyRequestSignature(sig, path)`
- Signature is HMAC-SHA256 of `path + timestamp`
## Cache & Revalidation
- Use on `/stats` (24h revalidate) — automatic invalidation
- Use on `/api/prices` (5min revalidate) — dependency prices
- Don't use on high-variance endpoints like `/api/fees/live`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Overview
## Core Architecture Pattern
### 1. Entry Points (HTTP Handlers)
- `app/page.tsx` - Hero landing page with search interface
- `app/[handle]/page.tsx` - Creator profile (identity resolution + fee display, 10s timeout, 30min ISR)
- `app/leaderboard/page.tsx` - Creator ranking by unclaimed fees
- `app/terms/page.tsx` - Terms of Service (includes v2 pricing)
- `app/docs/page.tsx` - API documentation
- `app/api/search/route.ts` - POST resolve identity + fetch fees (primary search)
- `app/api/resolve/route.ts` - GET wallet addresses for an identity
- `app/api/fees/aggregate/route.ts` - GET aggregated fees for a creator_id
- `app/api/fees/live/route.ts` - GET real-time unclaimed fees (onchain query)
- `app/api/fees/live-stream/route.ts` - SSE stream for live fee updates
- `app/api/prices/route.ts` - GET cached token prices (5min revalidate)
- `app/api/stats/route.ts` - GET platform statistics (24h ISR)
- `app/api/leaderboard/route.ts` - GET creator ranking data
- `app/api/claim/bags/route.ts` - POST claim flow for Bags.fm
- `app/api/claim/confirm/route.ts` - POST claim confirmation (updates DB)
- `app/api/cron/index-fees/route.ts` - Sync fees from all adapters → Supabase
- `app/api/cron/index-tokens/route.ts` - Discover new tokens per creator
- `app/api/cron/refresh-prices/route.ts` - Update token price cache
- `app/api/cron/cleanup/route.ts` - Expire old claim attempt records
- `app/api/v2/fees/route.ts` - GET fees ($0.01/req via x402)
- `app/api/v2/export/route.ts` - GET export data ($0.05/req)
- `app/api/v2/intelligence/route.ts` - GET Allium wallet PnL ($0.02/req)
- `app/api/v2/resolve/route.ts` - GET OWS wallet resolution
- `app/api/v2/[...path]/route.ts` - Catch-all x402 payment routing
### 2. Services Layer
- `resolveAndPersistCreator(handle, provider)` - lookup + insert/update in `creators` table
- `enrichCreatorProfile()` - join wallets + tokens
- `aggregateFees(handle, provider, wallets, log)` - fetch from all adapters, merge by key, return `AggregatedFees`
- `persistFees(creator_id, fees, syncedPlatforms)` - upsert `fee_records`, prune stale rows for non-failed platforms
- Orchestrates handle-based + wallet-based fee queries in parallel
- `resolveIdentity(handle, provider)` - route to Twitter/GitHub/Farcaster/OWS resolver
- Returns `ResolvedWallet[]` (chain + address pairs)
- Compute aggregates (total unclaimed USD, token counts, claim status distribution)
- Query + rank creators by unclaimed fees, pagination
### 3. Platform Adapter Layer
```typescript
```
- `bags.ts` (Bags.fm) - Solana, supports identity resolution + handle fees + live unclaimed
- `pump.ts` (Pump.fun) - Solana, synthetic token IDs for vault aggregation
- `bankr.ts` (Bankr) - Base/ETH/BSC, full multi-chain support
- `clanker.ts` (Clanker) - Base/BSC, Twitter handle fee allocation
- `zora.ts` (Zora) - Base, NFT/creator fees
- `raydium.ts` (Raydium) - Solana, AMM fee key NFT ownership
- `believe.ts`, `revshare.ts`, `coinbarrel.ts` - various platforms and chains
- `getIdentityResolvers()` - adapters with `supportsIdentityResolution = true`
- `getAllAdapters()` - all 9 adapters
- `getLiveFeeAdapters()` - adapters with live onchain support
- `getHandleFeeAdapters()` - adapters with handle-based fees
### 4. Chain Modules
- `solana.ts` - validation, address utilities, Helius RPC integration
- `base.ts` - EVM utilities, Alchemy RPC integration
- `eth.ts` - Ethereum-specific logic
- `bsc.ts` - BSC-specific logic
- `clanker-reads.ts` - Specialized EVM read functions for Clanker
### 5. Data Flow Examples
#### Search + Profile Load (User clicks "VitalikButerin")
```
```
#### Cron Fee Sync (index-fees runs every 2h)
```
```
#### Live Fees Real-Time (client polls /fees/live-stream)
```
```
### 6. Database Persistence
- `creators` - identity hub (twitter_handle, github_handle, farcaster_id, wallet_address)
- `wallets` - linked addresses (creator_id, chain, address, resolved_at)
- `creator_tokens` - tokens launched (creator_id, platform, chain, token_address)
- `fee_records` - cached fees (creator_id, platform, chain, token_address, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, last_synced_at)
- `claim_events` - individual claims (creator_id, platform, tx_hash, amount_usd, claimed_at)
- `claim_attempts` - pending claims (creator_id, status: pending|signing|submitted|confirmed|failed|expired, expires_at)
- `token_prices` - price cache (token_address, chain, price_usd, source, updated_at)
### 7. Caching Strategy
- **DB Caching:** `fee_records` table indexed by (creator_id, last_synced_at)
- **Redis (Upstash):** Token prices (5min TTL), rate limit counters
- **Next.js ISR:** `/api/stats` (24h revalidate), `/[handle]` pages (30min)
- **Live Overlay:** SSE stream merges cached rows + real-time unclaimed amounts
### 8. Cross-Cutting Concerns
- CSP headers + allowlist (fonts.googleapis.com for DM Sans from wallet-adapter)
- Rate limiting (30 req/min general, 10 req/min search)
- Request signing (HMAC-SHA256 for API v2)
- Honeypot endpoint returns synthetic data to trap scrapers
- Structured logger with context (handle, wallet, fee counts)
- Timed operations tracked for performance monitoring
- Sentry integration (error tracking)
- Custom instrumentation for fee aggregation latency
- Twitter/GitHub/Farcaster/OWS wallet name resolvers
- Composite query parser (wallet addresses, @handles, URLs)
- Enumeration protection (20 handles/5min anti-abuse)
- HMAC confirmation tokens for claim flow
- Claim attempt state machine (pending → signed → confirmed → finalized)
## Key Invariants
## Files by Concern
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| ab-test-setup | When the user wants to plan, design, or implement an A/B test or experiment. Also use when the user mentions "A/B test," "split test," "experiment," "test this change," "variant copy," "multivariate test," "hypothesis," "should I test this," "which version is better," "test two versions," "statistical significance," or "how long should I run this test." Use this whenever someone is comparing two approaches and wants to measure which performs better. For tracking implementation, see analytics-tracking. For page-level conversion optimization, see page-cro. | `.agents/skills/ab-test-setup/SKILL.md` |
| ad-creative | "When the user wants to generate, iterate, or scale ad creative — headlines, descriptions, primary text, or full ad variations — for any paid advertising platform. Also use when the user mentions 'ad copy variations,' 'ad creative,' 'generate headlines,' 'RSA headlines,' 'bulk ad copy,' 'ad iterations,' 'creative testing,' 'ad performance optimization,' 'write me some ads,' 'Facebook ad copy,' 'Google ad headlines,' 'LinkedIn ad text,' or 'I need more ad variations.' Use this whenever someone needs to produce ad copy at scale or iterate on existing ads. For campaign strategy and targeting, see paid-ads. For landing page copy, see copywriting." | `.agents/skills/ad-creative/SKILL.md` |
| ai-seo | "When the user wants to optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers. Also use when the user mentions 'AI SEO,' 'AEO,' 'GEO,' 'LLMO,' 'answer engine optimization,' 'generative engine optimization,' 'LLM optimization,' 'AI Overviews,' 'optimize for ChatGPT,' 'optimize for Perplexity,' 'AI citations,' 'AI visibility,' 'zero-click search,' 'how do I show up in AI answers,' 'LLM mentions,' or 'optimize for Claude/Gemini.' Use this whenever someone wants their content to be cited or surfaced by AI assistants and AI search engines. For traditional technical and on-page SEO audits, see seo-audit. For structured data implementation, see schema-markup." | `.agents/skills/ai-seo/SKILL.md` |
| analytics-tracking | When the user wants to set up, improve, or audit analytics tracking and measurement. Also use when the user mentions "set up tracking," "GA4," "Google Analytics," "conversion tracking," "event tracking," "UTM parameters," "tag manager," "GTM," "analytics implementation," "tracking plan," "how do I measure this," "track conversions," "attribution," "Mixpanel," "Segment," "are my events firing," or "analytics isn't working." Use this whenever someone asks how to know if something is working or wants to measure marketing results. For A/B test measurement, see ab-test-setup. | `.agents/skills/analytics-tracking/SKILL.md` |
| churn-prevention | "When the user wants to reduce churn, build cancellation flows, set up save offers, recover failed payments, or implement retention strategies. Also use when the user mentions 'churn,' 'cancel flow,' 'offboarding,' 'save offer,' 'dunning,' 'failed payment recovery,' 'win-back,' 'retention,' 'exit survey,' 'pause subscription,' 'involuntary churn,' 'people keep canceling,' 'churn rate is too high,' 'how do I keep users,' or 'customers are leaving.' Use this whenever someone is losing subscribers or wants to build systems to prevent it. For post-cancel win-back email sequences, see email-sequence. For in-app upgrade paywalls, see paywall-upgrade-cro." | `.agents/skills/churn-prevention/SKILL.md` |
| cold-email | Write B2B cold emails and follow-up sequences that get replies. Use when the user wants to write cold outreach emails, prospecting emails, cold email campaigns, sales development emails, or SDR emails. Also use when the user mentions "cold outreach," "prospecting email," "outbound email," "email to leads," "reach out to prospects," "sales email," "follow-up email sequence," "nobody's replying to my emails," or "how do I write a cold email." Covers subject lines, opening lines, body copy, CTAs, personalization, and multi-touch follow-up sequences. For warm/lifecycle email sequences, see email-sequence. For sales collateral beyond emails, see sales-enablement. | `.agents/skills/cold-email/SKILL.md` |
| competitor-alternatives | "When the user wants to create competitor comparison or alternative pages for SEO and sales enablement. Also use when the user mentions 'alternative page,' 'vs page,' 'competitor comparison,' 'comparison page,' '[Product] vs [Product],' '[Product] alternative,' 'competitive landing pages,' 'how do we compare to X,' 'battle card,' or 'competitor teardown.' Use this for any content that positions your product against competitors. Covers four formats: singular alternative, plural alternatives, you vs competitor, and competitor vs competitor. For sales-specific competitor docs, see sales-enablement." | `.agents/skills/competitor-alternatives/SKILL.md` |
| content-strategy | When the user wants to plan a content strategy, decide what content to create, or figure out what topics to cover. Also use when the user mentions "content strategy," "what should I write about," "content ideas," "blog strategy," "topic clusters," "content planning," "editorial calendar," "content marketing," "content roadmap," "what content should I create," "blog topics," "content pillars," or "I don't know what to write." Use this whenever someone needs help deciding what content to produce, not just writing it. For writing individual pieces, see copywriting. For SEO-specific audits, see seo-audit. For social media content specifically, see social-content. | `.agents/skills/content-strategy/SKILL.md` |
| copy-editing | "When the user wants to edit, review, or improve existing marketing copy. Also use when the user mentions 'edit this copy,' 'review my copy,' 'copy feedback,' 'proofread,' 'polish this,' 'make this better,' 'copy sweep,' 'tighten this up,' 'this reads awkwardly,' 'clean up this text,' 'too wordy,' or 'sharpen the messaging.' Use this when the user already has copy and wants it improved rather than rewritten from scratch. For writing new copy, see copywriting." | `.agents/skills/copy-editing/SKILL.md` |
| copywriting | When the user wants to write, rewrite, or improve marketing copy for any page — including homepage, landing pages, pricing pages, feature pages, about pages, or product pages. Also use when the user says "write copy for," "improve this copy," "rewrite this page," "marketing copy," "headline help," "CTA copy," "value proposition," "tagline," "subheadline," "hero section copy," "above the fold," "this copy is weak," "make this more compelling," or "help me describe my product." Use this whenever someone is working on website text that needs to persuade or convert. For email copy, see email-sequence. For popup copy, see popup-cro. For editing existing copy, see copy-editing. | `.agents/skills/copywriting/SKILL.md` |
| customer-research | When the user wants to conduct, analyze, or synthesize customer research. Use when the user mentions "customer research," "ICP research," "talk to customers," "analyze transcripts," "customer interviews," "survey analysis," "support ticket analysis," "voice of customer," "VOC," "build personas," "customer personas," "jobs to be done," "JTBD," "what do customers say," "what are customers struggling with," "Reddit mining," "G2 reviews," "review mining," "digital watering holes," "community research," "forum research," "competitor reviews," "customer sentiment," or "find out why customers churn/convert/buy." Use for both analyzing existing research assets AND gathering new research from online sources. For writing copy informed by research, see copywriting. For acting on research to improve pages, see page-cro. | `.agents/skills/customer-research/SKILL.md` |
| email-sequence | When the user wants to create or optimize an email sequence, drip campaign, automated email flow, or lifecycle email program. Also use when the user mentions "email sequence," "drip campaign," "nurture sequence," "onboarding emails," "welcome sequence," "re-engagement emails," "email automation," "lifecycle emails," "trigger-based emails," "email funnel," "email workflow," "what emails should I send," "welcome series," or "email cadence." Use this for any multi-email automated flow. For cold outreach emails, see cold-email. For in-app onboarding, see onboarding-cro. | `.agents/skills/email-sequence/SKILL.md` |
| emil-design-eng | This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great. | `.agents/skills/emil-design-eng/SKILL.md` |
| form-cro | When the user wants to optimize any form that is NOT signup/registration — including lead capture forms, contact forms, demo request forms, application forms, survey forms, or checkout forms. Also use when the user mentions "form optimization," "lead form conversions," "form friction," "form fields," "form completion rate," "contact form," "nobody fills out our form," "form abandonment," "too many fields," "demo request form," or "lead form isn't converting." Use this for any non-signup form that captures information. For signup/registration forms, see signup-flow-cro. For popups containing forms, see popup-cro. | `.agents/skills/form-cro/SKILL.md` |
| free-tool-strategy | When the user wants to plan, evaluate, or build a free tool for marketing purposes — lead generation, SEO value, or brand awareness. Also use when the user mentions "engineering as marketing," "free tool," "marketing tool," "calculator," "generator," "interactive tool," "lead gen tool," "build a tool for leads," "free resource," "ROI calculator," "grader tool," "audit tool," "should I build a free tool," or "tools for lead gen." Use this whenever someone wants to build something useful and give it away to attract leads or earn links. For downloadable content lead magnets (ebooks, checklists, templates), see lead-magnets. | `.agents/skills/free-tool-strategy/SKILL.md` |
| launch-strategy | "When the user wants to plan a product launch, feature announcement, or release strategy. Also use when the user mentions 'launch,' 'Product Hunt,' 'feature release,' 'announcement,' 'go-to-market,' 'beta launch,' 'early access,' 'waitlist,' 'product update,' 'how do I launch this,' 'launch checklist,' 'GTM plan,' or 'we're about to ship.' Use this whenever someone is preparing to release something publicly. For ongoing marketing after launch, see marketing-ideas." | `.agents/skills/launch-strategy/SKILL.md` |
| lead-magnets | When the user wants to create, plan, or optimize a lead magnet for email capture or lead generation. Also use when the user mentions "lead magnet," "gated content," "content upgrade," "downloadable," "ebook," "cheat sheet," "checklist," "template download," "opt-in," "freebie," "PDF download," "resource library," "content offer," "email capture content," "Notion template," "spreadsheet template," or "what should I give away for emails." Use this for planning what to create and how to distribute it. For interactive tools as lead magnets, see free-tool-strategy. For writing the actual content, see copywriting. For the email sequence after capture, see email-sequence. | `.agents/skills/lead-magnets/SKILL.md` |
| marketing-ideas | "When the user needs marketing ideas, inspiration, or strategies for their SaaS or software product. Also use when the user asks for 'marketing ideas,' 'growth ideas,' 'how to market,' 'marketing strategies,' 'marketing tactics,' 'ways to promote,' 'ideas to grow,' 'what else can I try,' 'I don't know how to market this,' 'brainstorm marketing,' or 'what marketing should I do.' Use this as a starting point whenever someone is stuck or looking for inspiration on how to grow. For specific channel execution, see the relevant skill (paid-ads, social-content, email-sequence, etc.)." | `.agents/skills/marketing-ideas/SKILL.md` |
| marketing-psychology | "When the user wants to apply psychological principles, mental models, or behavioral science to marketing. Also use when the user mentions 'psychology,' 'mental models,' 'cognitive bias,' 'persuasion,' 'behavioral science,' 'why people buy,' 'decision-making,' 'consumer behavior,' 'anchoring,' 'social proof,' 'scarcity,' 'loss aversion,' 'framing,' or 'nudge.' Use this whenever someone wants to understand or leverage how people think and make decisions in a marketing context." | `.agents/skills/marketing-psychology/SKILL.md` |
| onboarding-cro | When the user wants to optimize post-signup onboarding, user activation, first-run experience, or time-to-value. Also use when the user mentions "onboarding flow," "activation rate," "user activation," "first-run experience," "empty states," "onboarding checklist," "aha moment," "new user experience," "users aren't activating," "nobody completes setup," "low activation rate," "users sign up but don't use the product," "time to value," or "first session experience." Use this whenever users are signing up but not sticking around. For signup/registration optimization, see signup-flow-cro. For ongoing email sequences, see email-sequence. | `.agents/skills/onboarding-cro/SKILL.md` |
| page-cro | When the user wants to optimize, improve, or increase conversions on any marketing page — including homepage, landing pages, pricing pages, feature pages, or blog posts. Also use when the user says "CRO," "conversion rate optimization," "this page isn't converting," "improve conversions," "why isn't this page working," "my landing page sucks," "nobody's converting," "low conversion rate," "bounce rate is too high," "people leave without signing up," or "this page needs work." Use this even if the user just shares a URL and asks for feedback — they probably want conversion help. For signup/registration flows, see signup-flow-cro. For post-signup activation, see onboarding-cro. For forms outside of signup, see form-cro. For popups/modals, see popup-cro. | `.agents/skills/page-cro/SKILL.md` |
| paid-ads | "When the user wants help with paid advertising campaigns on Google Ads, Meta (Facebook/Instagram), LinkedIn, Twitter/X, or other ad platforms. Also use when the user mentions 'PPC,' 'paid media,' 'ROAS,' 'CPA,' 'ad campaign,' 'retargeting,' 'audience targeting,' 'Google Ads,' 'Facebook ads,' 'LinkedIn ads,' 'ad budget,' 'cost per click,' 'ad spend,' or 'should I run ads.' Use this for campaign strategy, audience targeting, bidding, and optimization. For bulk ad creative generation and iteration, see ad-creative. For landing page optimization, see page-cro." | `.agents/skills/paid-ads/SKILL.md` |
| paywall-upgrade-cro | When the user wants to create or optimize in-app paywalls, upgrade screens, upsell modals, or feature gates. Also use when the user mentions "paywall," "upgrade screen," "upgrade modal," "upsell," "feature gate," "convert free to paid," "freemium conversion," "trial expiration screen," "limit reached screen," "plan upgrade prompt," "in-app pricing," "free users won't upgrade," "trial to paid conversion," or "how do I get users to pay." Use this for any in-product moment where you're asking users to upgrade. Distinct from public pricing pages (see page-cro) — this focuses on in-product upgrade moments where the user has already experienced value. For pricing decisions, see pricing-strategy. | `.agents/skills/paywall-upgrade-cro/SKILL.md` |
| popup-cro | When the user wants to create or optimize popups, modals, overlays, slide-ins, or banners for conversion purposes. Also use when the user mentions "exit intent," "popup conversions," "modal optimization," "lead capture popup," "email popup," "announcement banner," "overlay," "collect emails with a popup," "exit popup," "scroll trigger," "sticky bar," or "notification bar." Use this for any overlay or interrupt-style conversion element. For forms outside of popups, see form-cro. For general page conversion optimization, see page-cro. | `.agents/skills/popup-cro/SKILL.md` |
| pricing-strategy | "When the user wants help with pricing decisions, packaging, or monetization strategy. Also use when the user mentions 'pricing,' 'pricing tiers,' 'freemium,' 'free trial,' 'packaging,' 'price increase,' 'value metric,' 'Van Westendorp,' 'willingness to pay,' 'monetization,' 'how much should I charge,' 'my pricing is wrong,' 'pricing page,' 'annual vs monthly,' 'per seat pricing,' or 'should I offer a free plan.' Use this whenever someone is figuring out what to charge or how to structure their plans. For in-app upgrade screens, see paywall-upgrade-cro." | `.agents/skills/pricing-strategy/SKILL.md` |
| product-marketing-context | "When the user wants to create or update their product marketing context document. Also use when the user mentions 'product context,' 'marketing context,' 'set up context,' 'positioning,' 'who is my target audience,' 'describe my product,' 'ICP,' 'ideal customer profile,' or wants to avoid repeating foundational information across marketing tasks. Use this at the start of any new project before using other marketing skills — it creates `.agents/product-marketing-context.md` that all other skills reference for product, audience, and positioning context." | `.agents/skills/product-marketing-context/SKILL.md` |
| programmatic-seo | When the user wants to create SEO-driven pages at scale using templates and data. Also use when the user mentions "programmatic SEO," "template pages," "pages at scale," "directory pages," "location pages," "[keyword] + [city] pages," "comparison pages," "integration pages," "building many pages for SEO," "pSEO," "generate 100 pages," "data-driven pages," or "templated landing pages." Use this whenever someone wants to create many similar pages targeting different keywords or locations. For auditing existing SEO issues, see seo-audit. For content strategy planning, see content-strategy. | `.agents/skills/programmatic-seo/SKILL.md` |
| referral-program | "When the user wants to create, optimize, or analyze a referral program, affiliate program, or word-of-mouth strategy. Also use when the user mentions 'referral,' 'affiliate,' 'ambassador,' 'word of mouth,' 'viral loop,' 'refer a friend,' 'partner program,' 'referral incentive,' 'how to get referrals,' 'customers referring customers,' or 'affiliate payout.' Use this whenever someone wants existing users or partners to bring in new customers. For launch-specific virality, see launch-strategy." | `.agents/skills/referral-program/SKILL.md` |
| revops | "When the user wants help with revenue operations, lead lifecycle management, or marketing-to-sales handoff processes. Also use when the user mentions 'RevOps,' 'revenue operations,' 'lead scoring,' 'lead routing,' 'MQL,' 'SQL,' 'pipeline stages,' 'deal desk,' 'CRM automation,' 'marketing-to-sales handoff,' 'data hygiene,' 'leads aren't getting to sales,' 'pipeline management,' 'lead qualification,' or 'when should marketing hand off to sales.' Use this for anything involving the systems and processes that connect marketing to revenue. For cold outreach emails, see cold-email. For email drip campaigns, see email-sequence. For pricing decisions, see pricing-strategy." | `.agents/skills/revops/SKILL.md` |
| sales-enablement | "When the user wants to create sales collateral, pitch decks, one-pagers, objection handling docs, or demo scripts. Also use when the user mentions 'sales deck,' 'pitch deck,' 'one-pager,' 'leave-behind,' 'objection handling,' 'deal-specific ROI analysis,' 'demo script,' 'talk track,' 'sales playbook,' 'proposal template,' 'buyer persona card,' 'help my sales team,' 'sales materials,' or 'what should I give my sales reps.' Use this for any document or asset that helps a sales team close deals. For competitor comparison pages and battle cards, see competitor-alternatives. For marketing website copy, see copywriting. For cold outreach emails, see cold-email." | `.agents/skills/sales-enablement/SKILL.md` |
| schema-markup | When the user wants to add, fix, or optimize schema markup and structured data on their site. Also use when the user mentions "schema markup," "structured data," "JSON-LD," "rich snippets," "schema.org," "FAQ schema," "product schema," "review schema," "breadcrumb schema," "Google rich results," "knowledge panel," "star ratings in search," or "add structured data." Use this whenever someone wants their pages to show enhanced results in Google. For broader SEO issues, see seo-audit. For AI search optimization, see ai-seo. | `.agents/skills/schema-markup/SKILL.md` |
| seo-audit | When the user wants to audit, review, or diagnose SEO issues on their site. Also use when the user mentions "SEO audit," "technical SEO," "why am I not ranking," "SEO issues," "on-page SEO," "meta tags review," "SEO health check," "my traffic dropped," "lost rankings," "not showing up in Google," "site isn't ranking," "Google update hit me," "page speed," "core web vitals," "crawl errors," or "indexing issues." Use this even if the user just says something vague like "my SEO is bad" or "help with SEO" — start with an audit. For building pages at scale to target keywords, see programmatic-seo. For adding structured data, see schema-markup. For AI search optimization, see ai-seo. | `.agents/skills/seo-audit/SKILL.md` |
| signup-flow-cro | When the user wants to optimize signup, registration, account creation, or trial activation flows. Also use when the user mentions "signup conversions," "registration friction," "signup form optimization," "free trial signup," "reduce signup dropoff," "account creation flow," "people aren't signing up," "signup abandonment," "trial conversion rate," "nobody completes registration," "too many steps to sign up," or "simplify our signup." Use this whenever the user has a signup or registration flow that isn't performing. For post-signup onboarding, see onboarding-cro. For lead capture forms (not account creation), see form-cro. | `.agents/skills/signup-flow-cro/SKILL.md` |
| site-architecture | When the user wants to plan, map, or restructure their website's page hierarchy, navigation, URL structure, or internal linking. Also use when the user mentions "sitemap," "site map," "visual sitemap," "site structure," "page hierarchy," "information architecture," "IA," "navigation design," "URL structure," "breadcrumbs," "internal linking strategy," "website planning," "what pages do I need," "how should I organize my site," or "site navigation." Use this whenever someone is planning what pages a website should have and how they connect. NOT for XML sitemaps (that's technical SEO — see seo-audit). For SEO audits, see seo-audit. For structured data, see schema-markup. | `.agents/skills/site-architecture/SKILL.md` |
| social-content | "When the user wants help creating, scheduling, or optimizing social media content for LinkedIn, Twitter/X, Instagram, TikTok, Facebook, or other platforms. Also use when the user mentions 'LinkedIn post,' 'Twitter thread,' 'social media,' 'content calendar,' 'social scheduling,' 'engagement,' 'viral content,' 'what should I post,' 'repurpose this content,' 'tweet ideas,' 'LinkedIn carousel,' 'social media strategy,' or 'grow my following.' Use this for any social media content creation, repurposing, or scheduling task. For broader content strategy, see content-strategy." | `.agents/skills/social-content/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
