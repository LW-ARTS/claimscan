import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { bscClient } from '@/lib/chains/bsc';
import { asBscAddress, type BscAddress } from '@/lib/chains/types';
import { FLAP_VAULT_PORTAL } from '@/lib/constants-evm';
import { createLogger } from '@/lib/logger';

// CRITICAL: import from './vault-portal' NOT './index'.
// Importing from './index' would create a circular dependency because
// index.ts re-exports detectFundRecipient from this file. The Phase 13 r1
// refactor extracted lookupVaultAddress into ./vault-portal precisely to
// keep the dependency DAG acyclic.
import { lookupVaultAddress } from './vault-portal';
import { FLAP_TAX_TOKEN_V3_ABI, TAX_PROCESSOR_ABI } from './types';

const log = createLogger('flap-vaults:fund-recipient');

/**
 * Result shape for detectFundRecipient.
 *
 * `matched=true` ⇔ taxToken has no VaultPortal registration AND its TaxProcessor's
 * marketAddress is an EOA (no bytecode). The token's economics are "auto-forward fees
 * as native BNB to the recipient EOA on every swap" — no claimable balance, no claim
 * action surface.
 */
export interface FundRecipientResult {
  matched: boolean;
  taxProcessor?: BscAddress;
  marketAddress?: BscAddress;
}

/**
 * Token-level detection of fund-recipient launches.
 *
 * Discriminator (4 steps, all must pass):
 *   1. lookupVaultAddress(FLAP_VAULT_PORTAL, taxToken) === null   (no vault registered)
 *   2. taxToken.taxProcessor() succeeds                            (Flap tax token)
 *   3. taxProcessor.marketAddress() succeeds                       (TaxProcessor wired)
 *   4. bscClient.getCode(marketAddress) is empty / '0x'            (recipient is EOA)
 *
 * Step 4 is the mutual-exclusion gate: base-v2 + split-vault tokens have a
 * taxProcessor too, but their marketAddress is a contract (typically the vault).
 * Verified 0/60 false positives in a 60-token sample — see RESEARCH §"Universe Sizing".
 *
 * Recipient is mutable post-deploy via TaxProcessor.setReceivers() (onlyOwner gate).
 * v1 ClaimScan reads it once at probe time; manual reclassify hatch is
 * `npx tsx scripts/classify-flap.ts --token <addr>` (D-09 + RESEARCH Open Question #6).
 *
 * Accepts the raw `0x${string}` so callers (cron orchestrator, classify-flap.ts, fixture
 * integration tests) can pass un-branded addresses without a checksum step. Branded
 * BscAddress is a subtype of `0x${string}` so unit tests passing asBscAddress(...) values
 * also typecheck cleanly.
 */
export async function detectFundRecipient(taxToken: `0x${string}`): Promise<FundRecipientResult> {
  // Step 1: must NOT be a vault-having token.
  // Cast to BscAddress for lookupVaultAddress signature (the lookup never inspects the brand
  // at runtime — viem operates on the underlying `0x${string}`).
  const vault = await lookupVaultAddress(FLAP_VAULT_PORTAL, taxToken as BscAddress);
  if (vault !== null) {
    return { matched: false };
  }

  // Step 2: token must expose taxProcessor().
  let taxProcessor: BscAddress;
  try {
    const raw = (await bscClient.readContract({
      address: taxToken,
      abi: FLAP_TAX_TOKEN_V3_ABI,
      functionName: 'taxProcessor',
    })) as `0x${string}`;
    taxProcessor = asBscAddress(raw);
  } catch (err) {
    log.warn('fundRecipient.taxProcessor_revert', {
      token: taxToken.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return { matched: false };
  }

  // Step 3: TaxProcessor must expose marketAddress().
  let marketAddress: BscAddress;
  try {
    const raw = (await bscClient.readContract({
      address: taxProcessor as `0x${string}`,
      abi: TAX_PROCESSOR_ABI,
      functionName: 'marketAddress',
    })) as `0x${string}`;
    marketAddress = asBscAddress(raw);
  } catch (err) {
    log.warn('fundRecipient.marketAddress_revert', {
      taxProcessor: taxProcessor.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return { matched: false };
  }

  // Zero-address guard: reject before getCode — zero address has no bytecode,
  // would pass the EOA check, and would create ghost fund-recipient rows in DB.
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  if (marketAddress.toLowerCase() === ZERO_ADDRESS) {
    log.warn('fundRecipient.marketAddress_is_zero', {
      taxProcessor: taxProcessor.slice(0, 10),
    });
    return { matched: false };
  }

  // Step 4: marketAddress must be EOA (no bytecode).
  let code: `0x${string}` | undefined;
  try {
    code = await bscClient.getCode({ address: marketAddress as `0x${string}` });
  } catch (err) {
    log.warn('fundRecipient.getCode_failed', {
      marketAddress: marketAddress.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return { matched: false };
  }
  const isEOA = !code || code === '0x';
  if (!isEOA) {
    return { matched: false };
  }

  return { matched: true, taxProcessor, marketAddress };
}

/**
 * Fund-recipient handler.
 *
 * NOTE: distinct shape from FlapVaultHandler. Takes the per-token TaxProcessor
 * address and returns the cumulative WBNB forwarded to the recipient stored on
 * that TaxProcessor. There is no `user` parameter because the accumulator is for
 * the persisted single recipient (TaxProcessor.marketAddress()).
 *
 * The adapter resolves this handler directly via `import { fundRecipientHandler }`
 * — NOT through `resolveHandler('fund-recipient')`. The HANDLERS registry in
 * lib/platforms/flap-vaults/index.ts intentionally maps 'fund-recipient' to
 * unknownHandler (a safety stub) since the registry is scoped to vault-having types.
 */
export const fundRecipientHandler = {
  kind: 'fund-recipient' as const,

  /**
   * Reads the lifetime monotonic accumulator of WBNB forwarded to the recipient.
   * Unit: wei (18 decimals; WBNB pre-unwrap = native BNB 1:1 post-unwrap per the
   * TaxProcessor's _dispatchETH path — RESEARCH §"Verified ABI Set").
   *
   * Accepts the raw `0x${string}` so callers (adapter, fixture integration test)
   * can pass un-branded addresses. Branded BscAddress is a structural subtype of
   * `0x${string}` so passing `asBscAddress(...)` values still typechecks.
   *
   * Returns 0n on RPC failure (defensive contract — never throws).
   */
  async readCumulative(taxProcessor: `0x${string}`, _signal?: AbortSignal): Promise<bigint> {
    try {
      const result = await bscClient.readContract({
        address: taxProcessor,
        abi: TAX_PROCESSOR_ABI,
        functionName: 'totalQuoteSentToMarketing',
      });
      return result as bigint;
    } catch (err) {
      log.warn('fundRecipient.readCumulative_failed', {
        taxProcessor: taxProcessor.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
        note: 'returning 0n — will be filtered by D-12; check BSC RPC health',
      });
      Sentry.captureException(err, {
        extra: {
          taxProcessor: taxProcessor.slice(0, 10),
          context: 'readCumulative — BSC RPC failure; D-12 filter will drop this row',
        },
      });
      return 0n;
    }
  },
};
