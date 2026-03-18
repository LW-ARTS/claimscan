# ClaimScan — Post-Deploy TODO

Items identified during audit rounds. None are blockers.

## Database
- [ ] Drop 13 unused indexes flagged by Supabase Performance Advisor
- [ ] Add index on `watched_tokens.creator_id` if bot queries slow down
- [ ] Align migration filenames with Supabase remote names (`supabase db pull` or rename)

## Performance
- [ ] Virtual scroll for fee tables with 500+ records (`@tanstack/virtual`)

## UX
- [ ] Badge counts on platform/status tabs (already has counts — verify visibility)

## Monitoring
- [ ] Reconciliation cron for `claim_fees WHERE verified = false`
- [ ] Alert when all adapters return empty (total service outage detection)
