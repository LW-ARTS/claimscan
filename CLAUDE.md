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
  components/
    anim/                     # CountUp, RevealOnScroll, RevealMount + tokens.ts (DURATION/EASE)
    DocsSidebar.tsx           # Sidebar nav /docs
    TermsSidebar.tsx          # Sidebar nav /terms
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
- Rate limiting: 30 req/min geral, 10 req/min search, 20 handles/5min anti-enumeration
- proxy.ts (~528 linhas): security headers, tarpit, honeypot, CORS, request signing, x402 routing — nao existe middleware.ts
- Cron endpoints protegidos com CRON_SECRET bearer token
- Animacoes: usar componentes em `app/components/anim/` + tokens.ts (DURATION/EASE). Sempre respeitar `useReducedMotion`
- Design tokens: editar SOMENTE em `Claimscan.pen` via Pencil MCP, depois sincronizar `DESIGN-SPEC.md` e `app/globals.css`

## Env (principais)
- .env.example existe na raiz — usar como base pra setup local
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
SOLANA_RPC_URL, NEXT_PUBLIC_SOLANA_RPC_URL, BASE_RPC_URL, BSC_RPC_URL
BAGS_API_KEY, ZORA_API_KEY, HELIUS_API_KEY, HELIUS_WEBHOOK_SECRET
CRON_SECRET, CLAIM_HMAC_SECRET
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
NEXT_PUBLIC_API_SIGN_KEY
NEXT_PUBLIC_SENTRY_DSN
X402_WALLET_ADDRESS, X402_NETWORK, X402_FACILITATOR_URL
ALLIUM_API_KEY
COINGECKO_API_KEY, JUP_API_KEY
RESOLVE_TIMEOUT_MS (optional, default 55000 — override para deploys externos)
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
