---
phase: 13
plan: "09"
subsystem: production-rollout
status: operator-action-required
tags: [prod-migration, classify-flap, fund-recipient, uat, phase-close]
one_liner: "Production rollout operator runbook: apply migration 036, run classify-flap.ts, verify D-10 fixture, run tests, UAT, close phase."
completed_at: null
dependencies:
  requires: [13-06, 13-07, 13-08]
  provides: [prod-migration-036, classify-flap-prod-run, fund-recipient-graduated, uat-verified, phase-13-closed]
key_files:
  input:
    - supabase/migrations/036_add_fund_recipient.sql
    - supabase/migrations/036_add_fund_recipient_rollback.sql
    - scripts/classify-flap.ts
    - scripts/backfill-flap-fund-recipient.ts
    - lib/__tests__/fixtures/wallets/flap-fund-recipient-creator.json
  modified: []
key_decisions: []
metrics:
  duration: null
  tasks_completed: 0
  tasks_total: 7
  files_changed: 0
  date_completed: null
---

# Phase 13 Plan 09: Production Rollout Operator Runbook

All 7 tasks in this plan require operator action against PROD credentials. No code is modified.
Each section below contains the exact commands to run and the expected outputs.

Work from the repo root: `~/Projects/claimscan` (the main branch, not this worktree).

---

## Task 1 [BLOCKING]: Apply migration 036 to PRODUCTION Supabase

**Goal:** Apply `supabase/migrations/036_add_fund_recipient.sql` to PROD Supabase.

### Step 1.1 — Confirm SUPABASE_ACCESS_TOKEN is in shell

```bash
echo "${SUPABASE_ACCESS_TOKEN:0:10}..."
```

Must print first 10 chars (non-empty).

### Step 1.2 — Confirm PROD project is linked (not staging)

```bash
supabase projects list
supabase status
```

Verify the ref shown is the PROD ref. If staging is linked, switch:

```bash
supabase link --project-ref <PROD_PROJECT_REF>
```

### Step 1.3 — Apply migration

```bash
supabase db push
```

This applies all unapplied migrations in lexicographic order. The only new file vs PROD's current state is `036_add_fund_recipient.sql`.

### Step 1.4 — Sanity verify (run in Supabase SQL editor connected to PROD, or via psql)

**a. Both CHECK predicates must include 'fund-recipient':**

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('flap_tokens_vault_type_check', 'fee_records_vault_type_check');
```

Both rows must include `'fund-recipient'` in the predicate text.

**b. No rows violate the new predicate (must return 0):**

```sql
SELECT COUNT(*) FROM flap_tokens
WHERE vault_type NOT IN ('base-v1','base-v2','split-vault','fund-recipient','unknown');
```

**c. New columns present with correct types:**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'flap_tokens'
  AND column_name IN ('recipient_address', 'tax_processor_address');
```

Both rows must show `data_type='text'`, `is_nullable='YES'`.

**d. Partial index present:**

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'flap_tokens'
  AND indexname = 'idx_flap_tokens_recipient';
```

Must return one row.

**e. Canary INSERT/DELETE round-trip (CRITICAL: both statements must run; leaving 0xtest_fr in PROD is a data-integrity issue):**

```sql
INSERT INTO flap_tokens (token_address, creator, vault_type, source, created_block, recipient_address, tax_processor_address)
VALUES ('0xtest_fr', '0xtest_deployer', 'fund-recipient', 'native_indexer', 0, '0xtest_recipient', '0xtest_taxprocessor');
DELETE FROM flap_tokens WHERE token_address = '0xtest_fr';
```

Both must succeed without CHECK violation. The DELETE is mandatory — do not skip it.

### Rollback (if any sanity step fails)

```bash
psql $PROD_DATABASE_URL -f supabase/migrations/036_add_fund_recipient_rollback.sql
```

Then triage before re-attempting. See rollback file for pre-clean instructions (reset fund-recipient rows before rolling back CHECK constraints).

**Resume signal:** Type "applied" after all 5 sanity steps pass on PROD.

---

## Task 2 [BLOCKING]: Run scripts/classify-flap.ts against PROD

**Goal:** Re-probe ~229,971 unknown rows; expect ~7,800 graduated to vault_type='fund-recipient'.

### Step 2.1 — Confirm PROD env is loaded

```bash
echo "$NEXT_PUBLIC_SUPABASE_URL" | head -c 30    # should be the PROD URL
echo "${SUPABASE_SERVICE_ROLE_KEY:0:10}..."        # should be set (truncated)
echo "${BSC_RPC_URL:0:30}..."                       # should be set (truncated)
```

If any are empty, source `.env.local` or set explicitly. NEVER use STAGING credentials here.

### Step 2.2 — (Optional) Dry run with small sample

```bash
SAMPLE_LIMIT=10 npx tsx scripts/classify-flap.ts
```

Expect ~10 tokens probed and summary log lines printed. Fix any errors before running the full sweep.

### Step 2.3 — Full classification sweep

```bash
time npx tsx scripts/classify-flap.ts 2>&1 | tee /tmp/classify-flap-prod-$(date +%s).log
```

Expected duration: ~25-50 minutes for ~229,971 unknown rows. Expected counter shape:

- `graduated_to_fund_recipient`: ~7,800 (3.4% of 229,971 per RESEARCH extrapolation)
- `base_v2` / `split_vault`: 0 or very small (already classified pre-Phase-13)
- `unknown`: ~222,000 (the 96.6% non-fund-recipient unknowns)

### Step 2.4 — Capture the final log line

Copy the final `classify_complete` JSON log line from the output. Paste it into this SUMMARY when filing the run results.

**Note on rate limits:** If RPC errors exceed 5% rate, check Alchemy dashboard. Use `SAMPLE_LIMIT=10000` to chunk if needed — the script is idempotent.

**Resume signal:** Paste the final `classify_complete` JSON log line + run duration (e.g., "25 minutes, graduated_to_fund_recipient=7,832, still_unknown=221,891").

---

## Task 3 [BLOCKING]: D-10 SQL fixture sanity SELECT

**Goal:** Confirm the 71.28-BNB fixture token is classified correctly in PROD.

Run this exact SQL against PROD:

```sql
SELECT vault_type, recipient_address, tax_processor_address, source, vault_address
FROM flap_tokens
WHERE token_address = LOWER('0x5f28b56a2f6e396a69fc912aec8d42d8afa17777');
```

**Expected result — exactly this row:**

| column | expected value |
|--------|---------------|
| vault_type | `fund-recipient` |
| recipient_address | `0xe4cc6a1fa41e48bb968e0dd29df09092b25a4457` (lowercase) |
| tax_processor_address | `0xf9113d169a093e174b29776049638a6684f2c9a7` (lowercase) |
| source | `bitquery_backfill` OR `native_indexer` |
| vault_address | `NULL` |

**If the SELECT returns NO rows:** the fixture is missing from flap_tokens entirely. Jump to Task 4 (Bitquery one-shot).

**If one row but vault_type != 'fund-recipient':** classify-flap.ts didn't graduate it. Run the single-token escape hatch:

```bash
RECLASSIFY_TOKEN=0x5f28b56a2f6e396a69fc912aec8d42d8afa17777 npx tsx scripts/classify-flap.ts
```

Then re-run the SELECT. If still wrong, escalate.

**Resume signal:** Paste the SQL result. If exactly the expected row, type "verified". If wrong, paste the actual row and decide: skip-to-task-4 / run-RECLASSIFY_TOKEN / abort.

---

## Task 4 [CONDITIONAL]: Run scripts/backfill-flap-fund-recipient.ts Bitquery one-shot

**SKIP this task if Task 3 returned the expected row.** Type "skipped — D-10 already passed" and continue to Task 5.

If Task 3 returned no row (fixture missing entirely from flap_tokens):

### Step 4.1 — Confirm BITQUERY_API_KEY is set locally (NOT on Vercel prod — local only per CLAUDE.md)

```bash
grep BITQUERY_API_KEY .env.local | head -c 30
```

Must show the key prefix (truncated).

### Step 4.2 — Confirm no TODO(executor) markers remain in the script

```bash
grep -r 'TODO(executor)' scripts/backfill-flap-fund-recipient.ts
```

Should produce no output. If markers are present, abort and escalate.

### Step 4.3 — Run the backfill

```bash
time npx tsx scripts/backfill-flap-fund-recipient.ts 2>&1 | tee /tmp/backfill-fr-prod-$(date +%s).log
```

Expected counters: fetched 3,000-50,000 (Bitquery limit), matched ~7,800 fund-recipient candidates, upserted into existing flap_tokens rows.

### Step 4.4 — Re-run D-10 SELECT (from Task 3)

```sql
SELECT vault_type, recipient_address, tax_processor_address, source, vault_address
FROM flap_tokens
WHERE token_address = LOWER('0x5f28b56a2f6e396a69fc912aec8d42d8afa17777');
```

If now returns the expected row, mark Task 3 + Task 4 done. If still missing, escalate.

**Resume signal:** Type "skipped" if Task 3 already passed. Otherwise paste `fund_recipient_backfill_complete` JSON log + the re-run D-10 SELECT result.

---

## Task 5 [BLOCKING]: Run full test suite

**Goal:** Confirm all 4 fund-recipient adapter routing tests are GREEN and no Phase 12/12.1 regressions.

### Step 5.1 — Confirm BSC_RPC_URL is set

```bash
echo "${BSC_RPC_URL:0:30}..."
```

If unset, source `.env.local`.

### Step 5.2 — Run the full unit suite

```bash
npm run test:unit 2>&1 | tee /tmp/test-suite-final-$(date +%s).log
```

### Step 5.3 — Required pass states

| Suite | Expected |
|-------|----------|
| `lib/__tests__/integration/fund-recipient.test.ts` | 3 / 3 PASS |
| `lib/__tests__/unit/flap-vaults.test.ts` | ALL pass, including FR-01 describe block (5 / 5) |
| `lib/__tests__/integration/flap.test.ts` | ALL pass, including the 4 new fund-recipient adapter routing tests |
| Phase 12 + 12.1 tests | No regressions (base-v2, split-vault, probe ladder) |

**If tests fail:**

- 4 fund-recipient adapter tests RED: fixture row exists but adapter routing has a bug — review Plan 13-06 implementation
- FR-01 unit tests RED: mock setup broken — review Plans 13-04 + 13-01
- Phase 12 regressions: review Plan 13-06 dispatch refactor (vault_address-NULL filter split)

**Resume signal:** Paste final `npm run test:unit` summary line(s) — total tests, passed, failed (must be 0 failed).

---

## Task 6 [BLOCKING]: UAT — visual confirmation on production

**Goal:** Confirm the fund-recipient row with "Auto-forwarded" badge is visible on the production profile.

### Step 6.1 — Wait for live deploy

Verify that the latest commit is deployed at https://claimscan.tech. Check Vercel deployment timestamp matches the most recent commit.

### Step 6.2 — Open the profile in a fresh browser tab

```
https://claimscan.tech/profile/0xe4cC6a1fa41e48BB968E0Dd29Df09092b25A4457
```

Wait 5-10 seconds for full render and live SSE updates.

### Step 6.3 — Verify visual elements

| Element | Expected |
|---------|----------|
| Profile header | Wallet `0xe4cC6a...` shown as resolved identity |
| Flap row in TokenFeeTable | Present |
| tokenSymbol | Fixture token symbol or truncated `0x5f28b56a...` |
| totalEarned | >= 70 BNB (likely 71-73+ BNB as of 2026-04-27) |
| Badge pill | Emerald (green/teal) pill labeled "Auto-forwarded" |
| External link | "View on flap.sh" link present |
| Claim button | NOT present (display-only, fees auto-forwarded) |
| Total Unclaimed stat card | Does NOT include this row's value (fund-recipient rows have totalUnclaimed='0' — CLAUDE.md invariant) |

**If anything is wrong:**

- Row missing: check adapter route or fixture row — re-check Plan 13-06 logs + DB state
- Badge not rendering: check VaultStatusBadge mount — re-check Plan 13-07 Task 2
- Wrong totalEarned: check fundRecipientHandler.readCumulative or fixture freshness; re-read on-chain:
  ```bash
  cast call 0xf9113d169a093e174b29776049638a6684f2c9a7 'totalQuoteSentToMarketing()(uint256)' --rpc-url $BSC_RPC_URL
  ```
- Total Unclaimed includes BNB value: adapter shape bug — row must NOT contribute to Total Unclaimed

Take a screenshot. Save URL + timestamp + screenshot path in notes when reporting.

**Resume signal:** Type "verified" + paste screenshot path or describe what's rendered. If wrong, describe the visual issue for triage.

---

## Task 7 [BLOCKING]: Close out STATE.md + Phase 13 retrospective

**Goal:** Update planning state to mark Phase 13 complete. Run from repo root (main branch).

### Step 7.1 — Update .planning/STATE.md

Update Phase 13 entry to `done` with:
- Completion date (today: 2026-04-27)
- Final metrics: graduated_to_fund_recipient counter from Task 2, total tests passed from Task 5, UAT timestamp + screenshot path from Task 6
- Any deviations or follow-ups
- Reference to Plans 13-01 through 13-09 SUMMARY files

### Step 7.2 — Update .planning/ROADMAP.md

Mark Phase 13 entry status `[x]` complete. Update final goal text to reflect outcome.

### Step 7.3 — (Recommended) Add Phase 13 retrospective to .planning/RETROSPECTIVE.md

Key retrospective items to include:
- What went well: schema-first discipline (W0 BLOCKING migration), Wave 0 RED stubs driving GREEN through implementation, splitting W4 into 3 parallel plans (adapter / UI / scripts) for cleaner context budgets
- What was inefficient: two TODO(executor) markers in Plan 13-08 Task 1 (Bitquery query topic0 + arg decode not fully resolved upfront); future backfill scripts should resolve those during research
- Patterns to carry forward: `detectFundRecipient` inlined in two scripts (classify-flap.ts + backfill-flap-fund-recipient.ts) — consider a shared `scripts/_lib/flap-detect.ts` for the next backfill phase

### Step 7.4 — Commit

```bash
git add .planning/STATE.md .planning/ROADMAP.md .planning/RETROSPECTIVE.md
git commit -m "chore(13): close out Phase 13 — schema + classify-flap.ts + UAT verified"
```

### Step 7.5 — (Optional) Run verification pass

```bash
/gsd-verify-phase 13
```

**Resume signal:** Type "closed" after STATE.md + ROADMAP.md updated and committed. Optionally run `/gsd-verify-phase 13`.

---

## Run Results (Operator Fills In)

After completing each task, paste results here:

| Task | Status | Key Output |
|------|--------|------------|
| 1. Migration 036 PROD apply | pending | — |
| 2. classify-flap.ts PROD run | pending | — |
| 3. D-10 fixture sanity SELECT | pending | — |
| 4. Bitquery one-shot (conditional) | pending | — |
| 5. Full test suite | pending | — |
| 6. UAT visual confirmation | pending | — |
| 7. STATE.md + phase close | pending | — |

**classify_complete JSON (Task 2):**
_(paste here)_

**D-10 SELECT result (Task 3):**
_(paste here)_

**npm run test:unit summary (Task 5):**
_(paste here)_

**UAT screenshot / description (Task 6):**
_(paste here)_
