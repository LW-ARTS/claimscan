# ClaimScan Code Conventions

## TypeScript & Compiler

**TypeScript Strict Mode:** All files use `strict: true` in `tsconfig.json` (`target: ES2020`, `jsx: react-jsx`).

- Path alias: `@/*` → root directory
- No implicit `any`; all function parameters typed
- Return types explicitly annotated on public functions
- Use `type` for interfaces; avoid `interface` unless extending a third-party type

Example from `lib/logger.ts`:
```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  time<T>(msg: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T>;
  traceId: string;
}
```

## Imports & Module Structure

- **Server-only modules** use `import 'server-only'` at top (e.g., `lib/logger.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`)
- **Client components** use `'use client'` directive
- **Server components** are default; no directive needed
- Import order: React/Next first, then `@/lib`, then relative paths
- Absolute imports via `@/` for all cross-module references

Example from `lib/supabase/server.ts`:
```typescript
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';
```

## Naming Conventions

**Files:**
- Components: PascalCase (`ErrorBoundary.tsx`, `WalletButton.tsx`)
- API routes: kebab-case (`/api/fees/live/route.ts`, `/api/fees/aggregate/route.ts`)
- Utilities/libs: camelCase (`logger.ts`, `request-signing.ts`, `constants-evm.ts`)
- Test files: `filename.test.ts` or `filename.spec.ts`

**Variables & Functions:**
- Functions: camelCase (`createLogger`, `formatUsd`, `safeBigInt`)
- Constants: UPPER_SNAKE_CASE (`MIN_LEVEL`, `VALID_CHAINS`, `PLATFORM_CONFIG`)
- Type unions/enums: PascalCase or UPPER_SNAKE_CASE (`LogLevel`, `Chain`)
- Private module state: `SUPABASE_KEY` pattern (constants for globalThis keys)

**BigInt Token Amounts:**
- Always store as **string** in databases and API responses (e.g., `total_earned: '1000000000'`)
- Convert to `bigint` using `safeBigInt(val)` for arithmetic
- Never use `Number` for values >2^53; use BigInt division:
  ```typescript
  const divisor = 10n ** BigInt(decimals);
  const whole = bigVal / divisor;
  const remainder = bigVal % divisor;
  ```

## Error Handling Patterns

**Promise Error Handling:**
- Use `Promise.allSettled` for parallel operations that may partially fail
- Catch errors at API route level, return structured `{ error: 'message' }` with appropriate HTTP status
- Never expose internal error messages to client; log to Sentry instead

Example from `lib/supabase/service.ts` (constant-time comparison for secrets):
```typescript
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  const paddedActual = Buffer.alloc(Math.max(actual.length, expected.length));
  const paddedExpected = Buffer.alloc(Math.max(actual.length, expected.length));
  actual.copy(paddedActual);
  expected.copy(paddedExpected);
  
  return timingSafeEqual(paddedActual, paddedExpected) && actual.length === expected.length;
}
```

**Timeout Patterns:**
- Use `AbortSignal` with `AbortController` for request timeouts
- API routes declare `export const maxDuration = 60` (Vercel Hobby limit is 10s)
- Cron jobs use 55s wallclock guards to stay under 60s limit

**Validation:**
- Guard against null/undefined early: `if (!val) return 0n`
- Use regex for format validation (addresses, UUIDs, chains)
- Return structured errors with 400 (bad input) or 403 (auth failure)

Example from `app/api/fees/aggregate/route.ts`:
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!creatorId || !UUID_RE.test(creatorId)) {
  return NextResponse.json({ error: 'Valid creator_id parameter required' }, { status: 400 });
}
```

## Logging Patterns

**Structured Logger** (`lib/logger.ts`):
- All logging via `createLogger(module: string)` → returns `Logger` interface
- Each module has single logger instance; pass logger to functions needing it
- Child loggers for nested context: `logger.child({ wallet: '...', platform: 'pump' })`
- Performance timing via `logger.time(msg, asyncFn, extra)`

Example usage:
```typescript
const logger = createLogger('fee-sync');
await logger.time('sync fees for creator', async () => {
  // operation here
}, { creatorId });
```

Structured output:
- Dev: `[module] message { key: value }`
- Prod: JSON with `ts`, `level`, `module`, `msg`, `traceId`, custom fields

## Fee Math Conventions

**Token Amount Arithmetic:**
- All amounts stored as strings to preserve BigInt precision
- Decimals: Solana=9, EVM=18, BSC=18
- Use `formatTokenAmount(raw: string, decimals: number)` for display
- Use `formatUsd(value: number)` for currency display (K/M suffix)

**Fee Computation** (from `lib/utils.ts`):
```typescript
export function computeFeeUsd(fee: FeeRecord, solPrice: number, ethPrice: number, bnbPrice = 0): number {
  if (fee.total_earned_usd !== null) return fee.total_earned_usd;
  // Native platform fallback: use token price
  if (isNativePlatform(fee.platform)) {
    const amount = safeBigInt(fee.total_earned || fee.total_unclaimed);
    const decimals = fee.chain === 'sol' ? 9 : 18;
    return toUsdValue(amount, decimals, getPriceForChain(fee.chain, solPrice, ethPrice, bnbPrice));
  }
  return 0;
}
```

## Component Patterns

**React Server Components (default):**
- Fetch data directly in server component
- Pass data via props to client children
- Use `async` directly in component body

**Client Components:**
- Use `'use client'` at top
- Respect `useReducedMotion()` for animations (a11y compliance)
- Error boundaries are client components: class-based with `componentDidCatch`

Example from `app/components/ErrorBoundary.tsx`:
```typescript
'use client';
export class ErrorBoundary extends Component<Props, State> {
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }
}
```

**Live Fees Context:**
- SSE polling state lives in `LiveFeesProvider` (React Context)
- Components consume via `useLiveFees()` hook
- Map keyed by `${platform}:${chain}:${tokenAddress}` (composite key)
- No separate polling per component; all use provider

## Request Signing & Security

**Credential Validation:**
- Use `timingSafeEqual` for secret comparison (prevents timing attacks)
- Pad buffers to equal length before comparison
- Store secrets as env vars; never in code or git
- Use bearer tokens: `Authorization: Bearer <secret>`

**Request Signing:**
- Sign requests to prevent replay attacks: `verifyRequestSignature(sig, path)`
- Signature is HMAC-SHA256 of `path + timestamp`

## Cache & Revalidation

**API Route Cache Control:**
```typescript
export const revalidate = 300;  // 5 minutes ISR (fees/prices)
export const dynamic = 'force-dynamic';  // SSE streams, never cached
export const maxDuration = 60;  // Vercel max runtime
```

**Next.js ISR (Incremental Static Regeneration):**
- Use on `/stats` (24h revalidate) — automatic invalidation
- Use on `/api/prices` (5min revalidate) — dependency prices
- Don't use on high-variance endpoints like `/api/fees/live`
