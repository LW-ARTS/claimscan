# ClaimScan

Plataforma de rastreamento e claim de fees de tokens cross-chain (Solana + Base + ETH).
Agrega fees de 9 launchpads: Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium.

## Stack
- Next.js 16.2, React 19, TypeScript
- Tailwind CSS 4 + Radix UI + Motion 12 + Lottie
- Solana: @solana/web3.js, wallet-adapter, spl-token
- EVM: Viem 2.47
- DB: Supabase (PostgreSQL + RLS)
- Cache: Upstash Redis (fallback: in-memory)
- Security: Sentry, Cloudflare Turnstile, request signing
- Deploy: Vercel

## Estrutura
```
app/
  page.tsx                    # Home (hero + search)
  [handle]/page.tsx           # Perfil do creator (10s timeout)
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
    v2/                       # versao 2 da API publica
    cron/index-fees/          # Vercel Cron - sync fees
    cron/index-tokens/        # Vercel Cron - discover tokens
    cron/refresh-prices/      # Vercel Cron - update prices
    cron/cleanup/             # Vercel Cron - limpar claims expirados
    webhooks/helius/          # Helius DAS webhooks
    honeypot/[...path]/       # Trap pra scrapers (retorna dados fake)
lib/
  platforms/                  # 9 adapters (bags, pump, clanker, zora, etc)
  chains/                     # solana.ts, base.ts, eth.ts
  supabase/                   # client.ts, server.ts, service.ts
  resolve/                    # Identity resolution (Twitter/GitHub/Farcaster/wallet)
  prices/                     # DexScreener → Jupiter → CoinGecko waterfall
  claim/hmac.ts               # Confirmation tokens
  services/                   # creator.ts, fee-sync.ts, resolve.ts
  logger.ts                   # Structured logger centralizado
proxy.ts                      # Security middleware (450 linhas) - nao existe middleware.ts
supabase/migrations/          # 12 migration files
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
- Chain types: 'sol' | 'base' | 'eth'
- Claim status: claimed | unclaimed | partially_claimed | auto_distributed
- Cache TTL: 40min normal, 2h pra creators com 500+ records
- Price waterfall: DexScreener → Jupiter → CoinGecko
- Rate limiting: 30 req/min geral, 10 req/min search, 20 handles/5min anti-enumeration
- proxy.ts (450 linhas): security headers, tarpit, honeypot, CORS, request signing — nao existe middleware.ts
- Cron endpoints protegidos com CRON_SECRET bearer token

## Env (principais)
- .env.example existe na raiz — usar como base pra setup local
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
SOLANA_RPC_URL, NEXT_PUBLIC_SOLANA_RPC_URL, BASE_RPC_URL
BAGS_API_KEY, ZORA_API_KEY, HELIUS_API_KEY, HELIUS_WEBHOOK_SECRET
CRON_SECRET, CLAIM_HMAC_SECRET
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
NEXT_PUBLIC_API_SIGN_KEY
NEXT_PUBLIC_SENTRY_DSN
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
npm run test:e2e         # Playwright tests
```

## Cuidados
- maxDuration=60s nas API routes (Vercel Hobby max), wallclock guards em crons usam 55s
- Creators grandes (500+ fees) sao cacheados por cron, nao on-demand
- Middleware e gigante - qualquer mudanca de security header, editar com cuidado
- Honeypot endpoint retorna dados falsos - nao confundir com API real
- Wallet adapter auto-discovers wallets via Wallet Standard (sem imports explicitos)
- Sentry org: lw-52.sentry.io (project: claimscan, team: #lw)
