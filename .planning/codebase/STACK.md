# ClaimScan Technology Stack

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
  - **@supabase/supabase-js** 2.99.1 (JavaScript client)
  - **@supabase/ssr** 0.10.0 (SSR utilities)
  - Database: PostgreSQL (via Supabase)
  - Row-level security (RLS) policies enabled

## Caching & Rate Limiting

- **Upstash Redis**
  - **@upstash/redis** 1.37.0 (REST client)
  - **@upstash/ratelimit** 2.0.8 (distributed rate limiting)
  - Fallback: in-memory Map for local dev

## Monitoring & Error Tracking

- **@sentry/nextjs** 10.46.0 (error monitoring, source map upload)

## Analytics

- **@vercel/analytics** 2.0.1
- **@vercel/speed-insights** 2.0.0

## Development Tools

- **TypeScript** 5.x
- **ESLint** 9.x
  - **eslint-config-next** 16.2.1
  - **eslint-plugin-security** 4.0.0
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
  - `pbs.twimg.com`, `abs.twimg.com` (Twitter/X)
  - `avatars.githubusercontent.com` (GitHub)
  - `imagedelivery.net` (Cloudflare)
  - `ipfs.io` (IPFS)
  - `unavatar.io` (avatar service)
