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
- Rate limiting: 30 req/min geral, 10 req/min search, 20 handles/5min anti-enumeration
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
- **TODO arquitetural — migrar wallet stack pra Reown AppKit Multi-Adapter quando entrar a Fase 2 (claims EVM)**: ClaimScan hoje só assina Solana (claims Bags.fm). Quando começar a fazer claims EVM (Clanker/Zora/Bankr em Base, BSC, ETH), o caminho recomendado é substituir `@solana/wallet-adapter-react-ui` por `@reown/appkit` com `WagmiAdapter` + `SolanaAdapter` no mesmo `createAppKit({ adapters: [wagmiAdapter, solanaAdapter], networks: [mainnet, base, bsc, solana] })`. Vantagens: (1) modal único pra todas as 4 chains do estilo `kolscanbrasil.io` (Phantom + MetaMask + WalletConnect categorizados), (2) `<appkit-button />` é Web Component em Shadow DOM — provavelmente resolve o L-04 (`'unsafe-inline'` em `style-src` no `proxy.ts`), (3) WalletConnect built-in com 600+ wallets, (4) uma única API (`useAppKitAccount`/`useAppKitProvider`) em vez de wagmi + solana hooks separados. **Caveats conhecidos** (issues abertas em `reown-com/appkit`): #5095 switchNetwork bugado entre Solana↔EVM em multi-chain wallets, #4675 Solana provider pode falhar ao trocar de EVM pra Solana, #4674 MetaMask connection mostra MULTICHAIN baseado em adapters não networks. Nenhum é showstopper pro caso ClaimScan (user com Phantom + MetaMask separados), mas validar com POC de 4-8h em branch antes de comprometer. Migração estimada: 3-5 dias depois do POC. Ao migrar, pode remover `'unsafe-inline'` do `proxy.ts:268` e fechar L-04 do audit 2026-04-07
