# ClaimScan Testing Patterns

## Test Framework & Configuration

**Unit Tests: Vitest**
- Config: `vitest.config.ts` (Node environment, no DOM)
- Files: `lib/__tests__/**/*.test.ts`
- Run: `npm run test:unit` (single run) or `npm run test:unit:watch`

**E2E Tests: Playwright**
- Files: `e2e/**/*.spec.ts`
- Run: `npm run test:e2e` or `npm run test:e2e:ui` (interactive mode)
- Config: `playwright.config.ts` (likely in root, follows Vercel conventions)

Configuration from `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'e2e', '.next', 'bot'],
  },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
```

## Unit Test Coverage

**Core Utility Tests** (`lib/__tests__/utils.test.ts` — 493 lines):
- `safeBigInt()`: null/undefined, decimals, scientific notation, large integers, edge cases
- `formatTokenAmount()`: decimals 9/18, K/M suffixes, sub-1 amounts, EVM standard
- `formatUsd()`: zero, K/M formatting, negative/NaN/Infinity handling
- `computeFeeUsd()`: with/without `total_earned_usd`, native platform fallback, SOL/ETH/BNB prices
- `toUsdValue()`: BigInt to USD conversion, large amounts >MAX_SAFE_INTEGER, zero handling
- `isWalletAddress()`: valid Solana base58, EVM 0x addresses, invalid formats
- `isValidWalletInput()`: complete wallet objects, chain validation, address format per chain

**Fee Math Tests** (`lib/__tests__/fee-math.test.ts` — 144 lines):
- `wethToWei()`: decimal to wei conversion (EVM 18 decimals), scientific notation rejection, raw wei passthrough
- `safeBigInt()` extended coverage: large integers, scientific notation handling

**Claim HMAC Tests** (`lib/__tests__/claim-hmac.test.ts`):
- Signature generation and verification
- Token expiration and validity checks

**Fee Sync Tests** (`lib/__tests__/fee-sync.test.ts`):
- Cron job simulation
- Fee record aggregation and caching

## Mocking Patterns

**Server-Only Module Mocking** (from `lib/__tests__/fee-math.test.ts`):
```typescript
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));
```

**Pattern:** Mock `server-only` and `logger` in unit tests since test environment is Node and server modules can't run in Vitest.

## E2E Test Coverage

**Homepage** (`e2e/homepage.spec.ts` — 48 lines):
- Hero section renders (heading, search bar, SCAN button)
- Platform pills display all 9 launchpads
- Stats strip shows "9 launchpads", "4 chains", "live"
- Search input navigates to profile page (`/vitalik`)

**Profile Page** (`e2e/profile-page.spec.ts`):
- Loads creator profile (10s timeout observed in codebase)
- Displays fee records and claim status
- Live fees update via SSE (if applicable)

**Search Flow** (`e2e/search-flow.spec.ts`):
- Valid identity resolution (Twitter/GitHub/Farcaster/wallet)
- Invalid input rejection
- Rate limiting / anti-enumeration (20 handles/5min)

Patterns from `e2e/homepage.spec.ts`:
```typescript
test('search navigates to profile page', async ({ page }) => {
  await page.goto('/');
  const searchInput = page.getByPlaceholder(/search.*handle/i);
  await searchInput.fill('vitalik');
  await searchInput.press('Enter');
  await expect(page).toHaveURL(/\/vitalik/);
});
```

## Test Data & Fixtures

**Wallet Addresses (Real):**
- Solana: `8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR`
- EVM: `0x1234567890abcdef1234567890abcdef12345678`

**Token Amounts (Test Cases):**
- 1 SOL: `1000000000` (9 decimals)
- 1 ETH: `1000000000000000000` (18 decimals)
- 1 BNB: `1000000000000000000` (18 decimals)

**Prices (Fixtures):**
- SOL: `$150`
- ETH: `$3000`
- BNB: `$600`

**Creator ID (UUID):**
- Regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`

## What IS Tested

- **Utility math**: BigInt conversion, formatting (K/M suffixes), USD calculation
- **Validation**: Wallet addresses (Solana base58 vs EVM 0x), chains (sol/base/eth/bsc), platforms
- **Error handling**: Null/undefined inputs, invalid formats, edge case values (NaN, Infinity, negatives)
- **Integration**: Homepage rendering, search navigation, profile page load
- **Fee aggregation**: Total USD rollups, claim status counts

## What ISN'T Tested

- **Database operations**: No integration tests with Supabase; mocked in unit tests
- **RPC calls**: No live Solana/EVM RPC calls in tests
- **Claim flow**: No end-to-end claim signing/submission (requires wallet connect in UI)
- **Live SSE streams**: Stream registration/unregistration not heavily tested
- **Cron jobs**: No scheduled job execution tests (use `lib/__tests__/fee-sync.test.ts` for setup)
- **Price fetching**: No live DexScreener/Jupiter/CoinGecko calls; use fixtures
- **Sentry integration**: Error reporting mocked, not tested in CI
- **Third-party APIs**: Turnstile, Helius webhooks, x402 payment flow — manual testing only

## Test Scripts

From `package.json`:
```json
{
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

**Run all tests:** `npm run test:unit && npm run test:e2e`
**Watch mode:** `npm run test:unit:watch` (re-runs on source change)
**Debug e2e:** `npm run test:e2e:ui` (opens Playwright inspector)

## Test Structure Best Practices

**Unit Test Blocks:**
```typescript
describe('functionName', () => {
  it('does X when given Y', () => {
    expect(result).toBe(expected);
  });
  
  it('handles edge case Z', () => {
    expect(result).toBeCloseTo(expected, 1);  // Floating-point tolerance
  });
});
```

**Naming:** Test names are readable sentences starting with verb ("returns", "converts", "rejects", "handles").

**Test Data Clarity:** Include comments showing conversion math:
```typescript
// 1 SOL = 10^9 lamports at $150 = $150
expect(toUsdValue(1_000_000_000n, 9, 150)).toBeCloseTo(150, 2);
```

## Coverage Gaps & TODOs

- **No recorder mock for Supabase** (mentioned in CLAUDE.md but not found in tests)
- **Claim confirmation** (`claim/confirm` endpoint) lacks unit test coverage
- **Fee sync cron** runs successfully in test, but doesn't validate platform-specific fee parsing
- **Live fees streaming** (SSE) not end-to-end tested in Playwright
- **Multi-wallet identity resolution** (10 wallet max) needs parametrized test cases
