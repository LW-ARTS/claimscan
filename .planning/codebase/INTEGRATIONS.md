# ClaimScan External Integrations

## Launchpad Platform APIs (9 adapters)

### Bags.fm
- **Base**: `https://public-api-v2.bags.fm/api/v1`
- **Auth**: `BAGS_API_KEY` (legacy single) or `BAGS_API_KEYS` (comma-separated multi-key rotation)
- **Location**: `lib/platforms/bags.ts`, `lib/platforms/bags-api.ts`, `lib/platforms/bags-claim.ts`
- **Features**: Fee fetching, claim flow, token discovery
- **Rate Limiting**: Upstash Redis multi-key rotation (fallback: in-memory)

### Pump.fun
- **Location**: `lib/platforms/pump.ts`
- **Method**: Onchain Solana program reads (no REST API)
- **Program IDs**:
  - Main: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
  - PumpSwap: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`
  - Fees: `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`

### Clanker
- **Base**: `https://clanker.world/api`
- **Location**: `lib/platforms/clanker.ts`
- **Chain**: Base & BSC
- **Method**: REST API + onchain reads via Viem

### Zora
- **Location**: `lib/platforms/zora.ts`
- **Auth**: `ZORA_API_KEY` (optional REST API endpoint: `https://api-sdk.zora.engineering`)
- **Chain**: Base
- **Method**: Primarily onchain reads, REST fallback

### Bankr
- **Base**: `https://api.bankr.bot`
- **Auth**: `BANKR_API_KEY`
- **Location**: `lib/platforms/bankr.ts`
- **Chain**: Base

### Believe
- **Location**: `lib/platforms/believe.ts`
- **Chain**: Solana
- **Method**: Onchain token metadata reads

### RevShare
- **Location**: `lib/platforms/revshare.ts`
- **Chain**: Solana
- **Method**: Onchain fee tracking

### Coinbarrel
- **SDK**: `@coinbarrel/sdk` 3.2.7
- **Location**: `lib/platforms/coinbarrel.ts`
- **Chain**: Solana
- **Program**: `7HxbxHnTUBaUfWjVPbPLs8gqqScmjmBWjRnETBjS9DMj`

### Raydium
- **Base**: `https://launch-mint-v1.raydium.io`
- **Location**: `lib/platforms/raydium.ts`
- **Chain**: Solana
- **Program**: `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`
- **SDK**: Direct API calls

---

## Blockchain RPC & Data Providers

### Helius (Solana)
- **API Keys**: `HELIUS_API_KEY`
- **Webhook Secret**: `HELIUS_WEBHOOK_SECRET` (Bearer token validated with timingSafeEqual)
- **Endpoints**:
  - DAS JSON-RPC: `https://mainnet.helius-rpc.com`
  - REST API: `https://api-mainnet.helius-rpc.com`
  - Enhanced Transactions, DAS, Webhooks
- **Location**: `lib/helius/client.ts`, `lib/helius/transactions.ts`, `lib/helius/discovery.ts`
- **Usage**:
  - Signature fetching via `getSignaturesForAddress()`
  - Transaction parsing (`getTransaction()`)
  - Token discovery
  - Webhook management for claims
- **Webhooks**: `/api/webhooks/helius` — validates signature, processes fee events

### Alchemy (EVM)
- **Endpoints**:
  - Base: `BASE_RPC_URL=https://base-mainnet.g.alchemy.com`
  - Ethereum: `ETH_RPC_URL=https://eth-mainnet.g.alchemy.com`
  - BSC: `BSC_RPC_URL=https://bnb-mainnet.g.alchemy.com`
- **Usage**: Transaction reads, contract state queries via Viem
- **Location**: `lib/chains/base.ts`, `lib/chains/eth.ts`, `lib/chains/bsc.ts`

---

## Price & Market Data APIs

### DexScreener
- **Base**: `https://api.dexscreener.com`
- **Location**: `lib/prices/index.ts`
- **Usage**: Token prices (fallback in waterfall), minimum liquidity validation
- **Timeout**: 10s per request

### Jupiter (Solana)
- **Base**: `https://api.jup.ag/price/v3`
- **Auth**: `JUP_API_KEY` (optional, higher rate limits)
- **Location**: `lib/prices/index.ts`
- **Usage**: Solana token prices (second in waterfall)
- **Timeout**: 10s per request

### CoinGecko
- **Base**: `https://api.coingecko.com/api/v3`
- **Auth**: `COINGECKO_API_KEY` (Demo plan: 30 req/min vs ~10 without)
- **Location**: `lib/prices/index.ts`
- **Usage**: Native token prices (SOL, ETH, BNB), fallback for obscure tokens
- **Timeout**: 10s per request
- **Price Waterfall**: DexScreener → Jupiter (Solana only) → CoinGecko

---

## Database & Storage

### Supabase (PostgreSQL)
- **Auth**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Location**: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`
- **Tables**:
  - `creators` — identity hub (Twitter/GitHub/Farcaster/wallet)
  - `wallets` — linked addresses per chain
  - `creator_tokens` — tokens launched by creators
  - `fee_records` — cached fees (total, claimed, unclaimed, USD)
  - `claim_events` — claim transaction history
  - `claim_attempts` — claim status tracking (pending→signing→submitted→confirmed/failed/expired)
  - `token_prices` — price cache
  - `search_log` — analytics
- **Features**: Row-level security (RLS), real-time subscriptions
- **Migrations**: 29 migration files in `supabase/migrations/`

---

## Authentication & Identity Resolution

### Twitter/X
- **Via**: Farcaster Hub or Neynar API (see below)
- **Location**: Direct URL resolution (handles.twitter.com pattern matching)

### GitHub
- **Via**: Public GitHub API (no auth needed for handles)
- **Location**: Direct handle pattern matching

### Farcaster
- **Neynar API**:
  - **Auth**: `NEYNAR_API_KEY`
  - **Purpose**: Alternative to public Farcaster Hub for identity resolution
  - **Location**: `lib/resolve/farcaster.ts`
- **Public Hub** (fallback):
  - URL: `https://hub.pinata.cloud/v1` (configurable via `FARCASTER_HUB_URL`)
  - Used for username lookups

### OWS Wallet Resolution
- **Location**: `lib/ows/resolve.ts`
- **Purpose**: Wallet name resolution service
- **Status**: Integrated but fallback-safe

### Wallet Standard
- **Location**: Auto-discovery via `@solana/wallet-adapter-react-ui`
- **Usage**: Phantom, MetaMask, and 600+ WalletConnect wallets
- **No explicit imports** — uses Wallet Standard protocol

---

## Intelligence & Analytics

### Allium (Wallet Enrichment)
- **Base**: `https://api.allium.so/api/v1/developer/wallet`
- **Auth**: `ALLIUM_API_KEY`
- **Location**: `lib/allium/client.ts`
- **Usage**: Wallet PnL, transaction history enrichment
- **Chain Mapping**: sol→solana, base→base, eth→ethereum, bsc→bsc
- **Endpoint**: `/api/v2/intelligence` (x402 paid, $0.02/req)
- **Graceful Degradation**: Optional — requests work without API key

---

## Security & Verification

### Cloudflare Turnstile (CAPTCHA)
- **Auth**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- **Location**: `lib/turnstile.ts`
- **Usage**: CAPTCHA protection on `/api/search` (prevents bot enumeration)

### HMAC-SHA256 (Claim Confirmation)
- **Secret**: `CLAIM_HMAC_SECRET` (min 32 chars)
- **Location**: `lib/claim/hmac.ts`
- **Usage**: Confirmation token generation for claim flows
- **Expiry**: 15 minutes

### Request Signing (Anti-Scraping)
- **Key**: `NEXT_PUBLIC_API_SIGN_KEY` (intentionally exposed to browser)
- **Location**: `lib/request-signing.ts`
- **NOT a security boundary** — prevents casual curl/Python scraping only
- **Validated in**: `proxy.ts` middleware

---

## Payment Protocol

### x402 (Pay-Per-Query API v2)
- **Location**: `lib/x402/server.ts`
- **Config**:
  - Wallet: `X402_WALLET_ADDRESS` (receives USDC on Base)
  - Network: `X402_NETWORK` (default: `eip155:84532` Sepolia; prod: `eip155:8453` Base mainnet)
  - Facilitator: `X402_FACILITATOR_URL` (default: `https://x402.org/facilitator`)
- **Production Facilitator**: Bitrefill (`https://api.bitrefill.com/x402`)
- **Fallback Facilitator**: Coinbase Developer Platform
- **Endpoints**:
  - `/api/v2/fees` — $0.01/request
  - `/api/v2/export` — $0.05/request
  - `/api/v2/intelligence` — $0.02/request (via Allium)
  - `/api/v2/resolve` — via x402 protocol (OWS resolution)
- **Settlement**: USDC on Base mainnet

---

## Cron Jobs & Webhooks

### Vercel Cron
- **Auth**: `CRON_SECRET` (Bearer token, min 32 chars)
- **Routes**:
  - `/api/cron/index-fees` — sync fees from all platforms
  - `/api/cron/index-tokens` — discover new tokens
  - `/api/cron/refresh-prices` — update price cache
  - `/api/cron/cleanup` — expire old claims
- **Validation**: Verified in `lib/supabase/service.ts` and `proxy.ts`

### Helius Webhooks
- **Endpoint**: `/api/webhooks/helius`
- **Auth**: HMAC verification (`HELIUS_WEBHOOK_SECRET`)
- **Purpose**: Real-time claim fee event processing

---

## Monitoring & Error Tracking

### Sentry
- **Organization**: `lw-52` (production)
- **Project**: `claimscan`
- **Config**:
  - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
  - DSN: `NEXT_PUBLIC_SENTRY_DSN`
  - Source maps uploaded, deleteSourcemapsAfterUpload: true
  - Tunnel route: `/monitoring`
- **Integration**: `withSentryConfig()` in `next.config.ts`
- **Build-time Only**: `SENTRY_AUTH_TOKEN` needed for release creation & source map upload

---

## Rate Limiting

### Upstash Redis
- **Auth**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Location**: `lib/rate-limit.ts`, `proxy.ts`
- **Limits**:
  - General: 30 req/min per IP
  - Search: 10 req/min per IP
  - Fees (live): 5 req/min per IP
  - Anti-enumeration: 20 unique handles per 5 min per IP (40 for anon fingerprints)
- **Fallback**: In-memory Map when Redis unavailable

---

## Middleware & Security

### proxy.ts (Edge Middleware)
- **Location**: `proxy.ts` (~528 lines)
- **Features**:
  - Security headers (HSTS, CSP, CORS validation)
  - Rate limiting (via Upstash or in-memory)
  - Request signing verification
  - x402 routing
  - Honeypot for scrapers
  - Anti-enumeration
- **CSP Header**: Allowlists `fonts.googleapis.com` (DM Sans from Wallet Adapter)
- **Note**: No `middleware.ts` — all logic in `proxy.ts`

---

## Analytics & Public Stats

### ISR (Incremental Static Regeneration)
- **Route**: `/api/stats`
- **Revalidate**: 24 hours (automatic)
- **No cron needed** — handled by Next.js

---

## Summary Table

| Service | Type | Auth Env | Location |
|---------|------|----------|----------|
| Bags.fm | Launchpad | `BAGS_API_KEY[S]` | `lib/platforms/bags-*.ts` |
| Clanker | Launchpad | - | `lib/platforms/clanker.ts` |
| Helius | RPC/DAS | `HELIUS_API_KEY` | `lib/helius/*.ts` |
| Alchemy | RPC (EVM) | `{BASE,ETH,BSC}_RPC_URL` | `lib/chains/*.ts` |
| DexScreener | Pricing | - | `lib/prices/index.ts` |
| Jupiter | Pricing | `JUP_API_KEY` | `lib/prices/index.ts` |
| CoinGecko | Pricing | `COINGECKO_API_KEY` | `lib/prices/index.ts` |
| Supabase | Database | `NEXT_PUBLIC_SUPABASE_*` | `lib/supabase/*.ts` |
| Allium | Intelligence | `ALLIUM_API_KEY` | `lib/allium/client.ts` |
| x402 | Payments | `X402_*` | `lib/x402/server.ts` |
| Sentry | Monitoring | `SENTRY_*` | `next.config.ts` |
| Upstash | Cache/RateLimit | `UPSTASH_*` | `lib/rate-limit.ts` |
| Turnstile | CAPTCHA | `TURNSTILE_*` | `lib/turnstile.ts` |
