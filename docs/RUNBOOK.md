# ClaimScan — Operational Runbook

---

## 1. Cron Jobs

### 1.1 Cleanup Cron

**Schedule:** Daily 5 AM UTC
**Endpoint:** `GET /api/cron/cleanup?also=prices`
**Auth:** `Authorization: Bearer {CRON_SECRET}`
**Budget:** 60s max, 55s wallclock guard

**What it does:**
- Deletes search_log entries older than 30 days
- Removes orphaned creators (no wallets, no fee_records)
- Expires stale claim_attempts (pending/signing >5min, submitted >2min)
- Deletes terminal claims (finalized/failed/expired) older than 30 days
- Prunes stale token_prices (not updated in 7 days)
- Optional: refreshes native + top 5 token prices

**Manual trigger:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://claimscan.tech/api/cron/cleanup?also=prices"
```

**Expected response:**
```json
{
  "ok": true,
  "logsDeleted": 1234,
  "creatorsDeleted": 5,
  "claimsExpired": 10,
  "durationMs": 3500
}
```

**If it fails:**
- Check Vercel function logs for timeout (>60s)
- Verify CRON_SECRET matches env
- If DB connection fails: check Supabase status
- Safe to re-run manually (all operations are idempotent)

---

### 1.2 Fee Indexing Cron

**Schedule:** Daily 6 AM UTC
**Endpoint:** `GET /api/cron/index-fees?also=tokens`
**Auth:** Bearer token
**Budget:** 60s max, 55s strict early stop

**What it does:**
- Queries creators with `updated_at` older than 1 hour, max 5 per run
- For each: fetches fees from all 9 platform adapters (Promise.allSettled)
- Preserves highest `total_claimed` (prevents regression on rate limits)
- Recomputes invariant: `total_earned = total_claimed + total_unclaimed`
- Upserts to `fee_records`
- Phase 2: GPA token discovery for stale creators (max 1)

**Manual trigger:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://claimscan.tech/api/cron/index-fees?also=tokens"
```

**If it fails:**
- Platform API rate limits → partial results are normal (Promise.allSettled)
- RPC failures → that platform skipped for this run
- Timeout at 55s → remaining creators processed next run
- Re-run safe (idempotent upserts)

---

### 1.3 Price Refresh Cron

**Endpoint:** `GET /api/cron/refresh-prices`

**What it does:**
- Fetches SOL/ETH native prices from CoinGecko
- Queries top 15 unique tokens from fee_records
- Batch fetches prices (10 per batch, parallel)
- Single upsert to token_prices

**Manual trigger:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://claimscan.tech/api/cron/refresh-prices"
```

---

## 2. Claim System Operations

### 2.1 Stuck Claims

**Symptom:** User reports "Claim already in progress" for a token they never completed.

**Root Cause:** claim_attempt stuck in `pending`, `signing`, or `submitted` status.

**Auto-healing:** The `/api/claim/bags` endpoint runs inline cleanup before every request, expiring:
- `pending`/`signing` claims older than 5 minutes
- `submitted` claims older than 2 minutes

**Manual resolution:**
```sql
-- Find stuck claims for a wallet
SELECT id, token_address, status, created_at, updated_at
FROM claim_attempts
WHERE wallet_address = '<wallet>'
AND status IN ('pending', 'signing', 'submitted')
ORDER BY created_at DESC;

-- Force expire specific claim
UPDATE claim_attempts
SET status = 'expired', updated_at = NOW()
WHERE id = '<claim_attempt_id>'
AND status IN ('pending', 'signing', 'submitted');
```

### 2.2 Unverified Fee Transactions

**Symptom:** `claim_fees` records with `verified = false`.

**Root Cause:** RPC was unavailable when the fee TX was logged. The system inserts with `verified=false` as a fallback.

**Resolution:**
```sql
-- List unverified fee TXs
SELECT id, wallet_address, tx_signature, fee_lamports, created_at
FROM claim_fees
WHERE verified = false
ORDER BY created_at DESC;
```

Manually verify on-chain using Solscan/Solana Explorer, then update:
```sql
UPDATE claim_fees SET verified = true WHERE id = '<id>';
```

### 2.3 Fee Calculation Check

- Service fee: 85 bps (0.85%) of `total_unclaimed` from DB
- Minimum: 1,000,000 lamports (0.001 SOL)
- Treasury wallet receives the fee in a separate transaction
- Actual amount verified on-chain (prevents client-side inflation)

---

## 3. Database Maintenance

### 3.1 Large Creator Handling

Creators with 500+ fee_records are expensive to query on-demand. They should be indexed exclusively via cron.

**Check large creators:**
```sql
SELECT c.twitter_handle, c.id, COUNT(fr.id) as fee_count
FROM creators c
JOIN fee_records fr ON fr.creator_id = c.id
GROUP BY c.id
HAVING COUNT(fr.id) > 500
ORDER BY fee_count DESC;
```

Cache TTL for large creators: 2 hours (vs 40min normal).

### 3.2 Orphan Cleanup

The cleanup cron handles this, but to check manually:
```sql
-- Orphaned creators (no wallets AND no fee_records)
SELECT c.id, c.twitter_handle, c.created_at
FROM creators c
LEFT JOIN wallets w ON w.creator_id = c.id
LEFT JOIN fee_records fr ON fr.creator_id = c.id
WHERE w.id IS NULL AND fr.id IS NULL
ORDER BY c.created_at DESC;
```

### 3.3 Migration Management

Migrations live in `supabase/migrations/` (12 files). Applied via Supabase CLI:
```bash
npx supabase db push
npx supabase migration list
```

---

## 4. Monitoring & Alerts

### 4.1 Sentry

- **DSN:** Configured in `sentry.*.config.ts`
- **Environments:** production, development
- **Captures:** Unhandled exceptions, API route errors, cron failures
- **Source maps:** Disabled in production builds

### 4.2 Key Metrics to Watch

| Metric | Normal | Alert |
|--------|--------|-------|
| Search latency (p95) | <3s | >10s |
| Cron duration | <30s | >55s (wallclock limit) |
| Claim success rate | >90% | <70% |
| Rate limit hits | <5% of requests | >20% |
| Unverified fee TXs | 0 | >10 |

### 4.3 Health Checks

```bash
# API health (should return 200)
curl -s -o /dev/null -w "%{http_code}" https://claimscan.tech/api/prices

# Check rate limiter is working (Upstash)
curl -s https://claimscan.tech/api/prices -H "X-Forwarded-For: 1.2.3.4" \
  -w "\n%{http_code}"
```

---

## 5. Deployment

### 5.1 Vercel Deploy

```bash
# Preview deploy
vercel

# Production deploy
vercel --prod
```

**Pre-deploy checklist:**
- `npm run build` passes locally
- No TypeScript errors
- Environment variables set in Vercel dashboard
- CRON_SECRET configured for cron endpoints
- Supabase migrations applied

### 5.2 Environment Variables

**Critical (deploy fails without):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SOLANA_RPC_URL / NEXT_PUBLIC_SOLANA_RPC_URL
BASE_RPC_URL
CRON_SECRET
```

**Required for claims:**
```
CLAIM_HMAC_SECRET
```

**Recommended:**
```
UPSTASH_REDIS_REST_URL + TOKEN    # Persistent rate limiting
HELIUS_API_KEY                     # DAS API
BAGS_API_KEY                       # Bags.fm
NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY  # CAPTCHA
NEXT_PUBLIC_API_SIGN_KEY           # Request signing
```

### 5.3 Vercel Config

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/cleanup?also=prices", "schedule": "0 5 * * *" },
    { "path": "/api/cron/index-fees?also=tokens", "schedule": "0 6 * * *" }
  ]
}
```

**Constraints:**
- Hobby tier: max 2 cron jobs, 60s function duration
- Wallclock guards enforce 55s (5s safety margin)
- `maxDuration=60` set in all API route configs

---

## 6. Incident Response

### 6.1 API Down / 500 Errors

1. Check Vercel function logs: `vercel logs --follow`
2. Check Sentry for unhandled exceptions
3. Verify Supabase status: `https://status.supabase.com`
4. Verify RPC endpoints (Solana, Base) are responding
5. Check Upstash Redis if rate limiting is failing

### 6.2 Claims Not Working

1. Check claim_attempts for stuck records (Section 2.1)
2. Verify CLAIM_HMAC_SECRET is set and consistent
3. Test Bags API key: `curl -H "Authorization: Bearer $BAGS_API_KEY" https://api.bags.fm/...`
4. Check Solana RPC health
5. Verify treasury wallet balance

### 6.3 Prices Stale

1. Run price refresh manually: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/refresh-prices`
2. Check DexScreener API status
3. Check CoinGecko API rate limits
4. Verify token_prices table: `SELECT * FROM token_prices ORDER BY updated_at DESC LIMIT 10;`

### 6.4 Middleware Blocking Legitimate Traffic

The proxy.ts (~450 lines) is aggressive. If users report being blocked:

1. Check if their User-Agent is in the scraper blocklist
2. Check if their IP hit rate limits (search: 10/min, general: 30/min)
3. Check anti-enumeration counter (20 handles/5min/IP)
4. Tarpit: requests without browser headers get delayed 0-5s

**Temporary bypass (not recommended for production):** Comment out specific middleware checks, deploy, investigate, re-enable.

---

## 7. Rollback Procedures

### 7.1 Code Rollback

```bash
# Via Vercel dashboard: Deployments → select previous → Promote to Production
# Via CLI:
vercel rollback
```

### 7.2 Database Rollback

Supabase provides point-in-time recovery (PITR) on paid plans. For manual rollback:

```bash
# List migrations
npx supabase migration list

# Revert last migration (manual SQL required)
# Each migration should have a corresponding down migration
```

### 7.3 Emergency: Disable Claims

Set `CLAIM_HMAC_SECRET` to a new value in Vercel. All existing confirmTokens become invalid immediately. Redeploy.
