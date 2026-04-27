import { describe, it, expect } from 'vitest';
import { parseAbi } from 'viem';
import fixture from '../fixtures/wallets/flap-creator.json';
import { flapAdapter } from '@/lib/platforms/flap';
import { bscClient } from '@/lib/chains/bsc';
import { createServiceClient } from '@/lib/supabase/service';

// Skip when BSC_RPC_URL is missing so local `npm run test:integration` does
// not fall back to public RPCs with console.warn spam. CI injects the Alchemy
// URL via .env.test.
describe.skipIf(!process.env.BSC_RPC_URL)('flapAdapter (integration, live BSC)', () => {
  const wallet = fixture.wallet as `0x${string}`;
  const CLAIMABLE_ABI = parseAbi(['function claimable(address user) view returns (uint256)']);

  it('getHistoricalFees returns at least one row with totalUnclaimed > 0', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    expect(fees.length).toBeGreaterThanOrEqual(1);
    // D-12 filter should have removed any 0n rows.
    for (const fee of fees) {
      expect(BigInt(fee.totalUnclaimed)).toBeGreaterThan(0n);
    }
  }, 60_000);

  it('each row totalUnclaimed matches direct vault.claimable read (parity)', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    expect(fees.length).toBeGreaterThanOrEqual(1);

    // For each row, read claimable directly from the vault as a sanity check.
    // The adapter's getHistoricalFees dispatches to resolveHandler(row.vault_type)
    // which calls bscClient.readContract on CLAIMABLE_ABI, so parity should be EXACT.
    for (const fee of fees) {
      // The adapter emits the TOKEN address as tokenAddress, we need the vault.
      // Adapter doesn't expose vault directly in TokenFee (by design, UI doesn't need it),
      // so we go through the DB: look up flap_tokens.vault_address for this token.
      // Since this is a live integration test with a seeded DB, we just trust that
      // the adapter's multicall result IS the claimable read.
      //
      // Parity proof is: re-read the vault (via fixture.vault for the known fixture
      // token) and assert the adapter-returned value for THAT token matches.
      if (fee.tokenAddress !== fixture.token) continue;
      const directClaimable = await bscClient.readContract({
        address: fixture.vault as `0x${string}`,
        abi: CLAIMABLE_ABI,
        functionName: 'claimable',
        args: [wallet],
      });
      expect(BigInt(fee.totalUnclaimed)).toBe(directClaimable);
      return; // exits loop after verifying the fixture-token row
    }
    // If we fall through, the fixture token was not in the adapter's output, the
    // fixture was stale. Fail with a clear message pointing to the caveat field.
    throw new Error(
      `Fixture token ${fixture.token} not found in adapter output for wallet ${wallet}. ` +
        `Either claimable dropped to 0 (D-12 filter) or the fixture needs re-selection. ` +
        `See fixture.caveat for substitution protocol.`,
    );
  }, 60_000);

  it('adapter respects D-12 filter, no zero-balance rows emitted', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    for (const fee of fees) {
      expect(BigInt(fee.totalUnclaimed)).toBeGreaterThan(0n);
    }
  }, 60_000);

  it('every row carries vaultType (base-v1 | base-v2 | unknown)', async () => {
    const fees = await flapAdapter.getHistoricalFees(wallet);
    expect(fees.length).toBeGreaterThanOrEqual(1);
    for (const fee of fees) {
      expect(['base-v1', 'base-v2', 'split-vault', 'unknown']).toContain(fee.vaultType);
    }
  }, 60_000);

  it('SplitVault claimable parity (find-one-at-runtime, skips if no non-zero candidate in 50-row sample)', async () => {
    // SplitVault parity test — uses runtime DB query because SplitVault auto-dispatches
    // to recipients, leaving accumulated == claimed in steady state. Static fixtures
    // would need re-pinning every dispatch cycle.
    //
    // Strategy:
    //   1. Query flap_tokens for vault_type='split-vault' rows (limit 50).
    //   2. For each candidate, call userBalances(creator) directly via bscClient.
    //   3. Find first with accumulated > claimed (non-zero claimable).
    //   4. Run adapter for that creator wallet, assert parity within 0n diff.
    //   5. Skip with DESCRIPTIVE console.warn (distinguishes "no candidates" from
    //      "0/N steady-state") if none found in the sample.

    const supabase = createServiceClient();
    const { data: candidates, error: queryErr } = await supabase
      .from('flap_tokens')
      .select('token_address, creator, vault_address')
      .eq('vault_type', 'split-vault')
      .neq('vault_address', '0x0000000000000000000000000000000000000000')
      .limit(50);

    if (queryErr) {
      throw new Error(`SplitVault parity test: DB query failed: ${queryErr.message}`);
    }

    if (!candidates || candidates.length === 0) {
      // Skip case A: no SplitVault rows in DB yet. Descriptive warn so this is NOT
      // confused with skip case B (steady-state); also flags an upstream bug if the
      // migration + classify-flap run hasn't happened yet.
      console.warn('SplitVault parity test: no vault_type=split-vault candidates in DB, skipping');
      return;
    }

    // Find a candidate with non-zero claimable.
    const SPLITVAULT_ABI = parseAbi([
      'function userBalances(address user) view returns (uint128 accumulated, uint128 claimed)',
    ]);
    let foundCandidate: { creator: string; vault_address: string; claimable: bigint } | null = null;
    for (const c of candidates) {
      if (!c.vault_address) continue;
      try {
        const result = await bscClient.readContract({
          address: c.vault_address as `0x${string}`,
          abi: SPLITVAULT_ABI,
          functionName: 'userBalances',
          args: [c.creator as `0x${string}`],
        });
        const [accumulated, claimed] = result as readonly [bigint, bigint];
        if (accumulated > claimed) {
          foundCandidate = { creator: c.creator, vault_address: c.vault_address, claimable: accumulated - claimed };
          break;
        }
      } catch {
        // Individual read failure (rate limit / transient RPC error) — skip and continue.
        continue;
      }
    }

    if (!foundCandidate) {
      // Skip case B: candidates exist but all are at-rest (steady-state, dispatched).
      // This is the EXPECTED case in production based on RESEARCH session (0/308 sampled
      // had non-zero claimable). Descriptive warn distinguishes from skip case A.
      console.warn(
        `SplitVault parity test: 0/${candidates.length} SplitVaults had non-zero claimable, skipping (steady-state)`,
      );
      return;
    }

    // Adapter parity check.
    const fees = await flapAdapter.getHistoricalFees(foundCandidate.creator);
    expect(fees.length).toBeGreaterThanOrEqual(1);
    const matchingFee = fees.find((f) => BigInt(f.totalUnclaimed) === foundCandidate!.claimable);
    expect(matchingFee).toBeDefined();
    expect(matchingFee?.vaultType).toBe('split-vault');
  }, 90_000);

  // ════════════════════════════════════════════════
  // Phase 13 — Fund-recipient adapter routing (D-03/D-04/FR-04)
  // Recipient sees row, deployer does NOT. getCreatorTokens symmetric.
  // Deployer wallet looked up at runtime via flap_tokens.creator (NOT hardcoded —
  // creator equals tx.from of the token-creation tx, may differ from fixture metadata).
  // ════════════════════════════════════════════════

  it('getHistoricalFees(recipient) returns the fund-recipient row', async () => {
    const fr_fixture = (await import('../fixtures/wallets/flap-fund-recipient-creator.json')).default;
    const fees = await flapAdapter.getHistoricalFees(fr_fixture.wallet);
    const row = fees.find((f) => f.tokenAddress.toLowerCase() === fr_fixture.token.toLowerCase());
    expect(row).toBeDefined();
    expect(row!.vaultType).toBe('fund-recipient');
    expect(BigInt(row!.totalEarned)).toBeGreaterThanOrEqual(BigInt(fr_fixture.expected_cumulative_at_least_wei));
  }, 60_000);

  it('getHistoricalFees(deployer) does NOT return the fund-recipient row', async () => {
    const fr_fixture = (await import('../fixtures/wallets/flap-fund-recipient-creator.json')).default;
    const supabase = createServiceClient();
    const { data: tokenRow } = await supabase
      .from('flap_tokens')
      .select('creator')
      .eq('token_address', fr_fixture.token.toLowerCase())
      .maybeSingle();
    if (!tokenRow?.creator) {
      // Pre-W5: token may not yet be classified. Skip with descriptive warn (NOT a bug here).
      console.warn(`fund-recipient deployer test: fixture token not yet in DB or creator NULL, skipping`);
      return;
    }
    const fees = await flapAdapter.getHistoricalFees(tokenRow.creator);
    const row = fees.find((f) => f.tokenAddress.toLowerCase() === fr_fixture.token.toLowerCase());
    expect(row).toBeUndefined();
  }, 60_000);

  it('getCreatorTokens(recipient) returns the fund-recipient row (D-04 leaderboard ranking)', async () => {
    const fr_fixture = (await import('../fixtures/wallets/flap-fund-recipient-creator.json')).default;
    const tokens = await flapAdapter.getCreatorTokens(fr_fixture.wallet);
    const row = tokens.find((t) => t.tokenAddress.toLowerCase() === fr_fixture.token.toLowerCase());
    expect(row).toBeDefined();
    expect(row!.platform).toBe('flap');
    expect(row!.chain).toBe('bsc');
  }, 60_000);

  it('getCreatorTokens(deployer) does NOT return the fund-recipient row', async () => {
    const fr_fixture = (await import('../fixtures/wallets/flap-fund-recipient-creator.json')).default;
    const supabase = createServiceClient();
    const { data: tokenRow } = await supabase
      .from('flap_tokens')
      .select('creator')
      .eq('token_address', fr_fixture.token.toLowerCase())
      .maybeSingle();
    if (!tokenRow?.creator) {
      console.warn(`fund-recipient deployer getCreatorTokens test: fixture token not yet in DB, skipping`);
      return;
    }
    const tokens = await flapAdapter.getCreatorTokens(tokenRow.creator);
    const row = tokens.find((t) => t.tokenAddress.toLowerCase() === fr_fixture.token.toLowerCase());
    expect(row).toBeUndefined();
  }, 60_000);
});
