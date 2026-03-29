# Security Runbook

## Secret Rotation Schedule

Rotate all secrets quarterly (Jan, Apr, Jul, Oct) or immediately if compromised.

### Rotation Procedure

1. **CLAIM_HMAC_SECRET** — `openssl rand -hex 32`. Update in Vercel env vars. Active claims (15-min window) will fail during rotation — do it during low-traffic hours.
2. **CRON_SECRET** — `openssl rand -hex 32`. Update in Vercel env vars + vercel.json cron headers.
3. **HELIUS_WEBHOOK_SECRET** — `openssl rand -hex 32`. Update in Vercel env vars AND Helius dashboard webhook config simultaneously.
4. **BAGS_API_KEYS** — Request new keys from Bags.fm. Update in Vercel env vars.
5. **BANKR_API_KEY** — Rotate via Bankr dashboard.
6. **SUPABASE_SERVICE_ROLE_KEY** — Cannot be rotated manually. Supabase manages this. If compromised, regenerate via Supabase dashboard → Settings → API → Regenerate service key.
7. **TURNSTILE_SECRET_KEY** — Rotate in Cloudflare dashboard → Turnstile → Widget settings.

### Post-Rotation Checklist

- [ ] Update Vercel env vars (production + preview)
- [ ] Verify cron jobs still run (`/api/cron/cleanup`, `/api/cron/index-fees`)
- [ ] Verify Helius webhooks still deliver
- [ ] Verify claim flow works end-to-end
- [ ] Verify Turnstile CAPTCHA passes

## Sentry Alert Rules (LM-004)

Configure these in Sentry UI (lw-52.sentry.io → Alerts):

1. **Claim failure spike** — Alert when `claim_failure` event count > 10 in 5 minutes
2. **Fee verification failure** — Alert on `FEE_VERIFICATION_FAILED` messages (> 3 in 1 hour)
3. **Rate limit exhaustion** — Alert when 429 response count > 100 in 10 minutes
4. **HMAC/Auth failures** — Alert on unauthorized access patterns (> 5 in 5 minutes)
5. **Error rate** — Alert when error rate > 5% of transactions

## GitHub Branch Protection (DO-002)

Configure in GitHub → Settings → Branches → Branch protection rules for `main`:

- [x] Require pull request reviews before merging (1 reviewer)
- [x] Require status checks to pass (CI build + e2e)
- [x] Dismiss stale pull request approvals when new commits are pushed
- [x] Require branches to be up to date before merging
- [ ] Do NOT allow force pushes
- [ ] Do NOT allow deletions

## WAF Setup (IF-003)

For production hardening, route traffic through Cloudflare proxy:

1. Add `claimscan.tech` to Cloudflare (proxy mode, orange cloud)
2. Enable WAF managed rules (OWASP Core Ruleset)
3. Configure rate limiting rules in Cloudflare dashboard (supplement app-level limits)
4. Enable Bot Management (if on paid plan)
5. Enable DDoS protection (automatic on all Cloudflare plans)

Note: Turnstile already works with Cloudflare. The Vercel deployment will continue to work behind Cloudflare's proxy.
