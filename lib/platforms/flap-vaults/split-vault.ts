import 'server-only';
import { bscClient } from '@/lib/chains/bsc';
import type { BscAddress } from '@/lib/chains/types';
import { SPLITVAULT_USERBALANCES_ABI, type FlapVaultHandler } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-vaults:split-vault');

// SplitVault distributes BNB native fees among recipients via basis points (bps).
// `userBalances(user)` returns (uint128 accumulated, uint128 claimed) tracking
// lifetime credit and lifetime withdrawal per address. Claimable per address =
// accumulated - claimed. Both fields are uint128, so subtraction never overflows
// uint128, and viem decodes both as bigint.
//
// Source: https://bscscan.com/address/0xd6a92acc0a5fd685c1cb3a464d44410dc90c5d25#code
// Solidity 0.8.24+commit.e11b9ed9. struct UserBalance { uint128 accumulated;
// uint128 claimed; }. Verified by direct readContract in research session
// (RESEARCH §"Empirical Decode Verification" L554-564).
//
// Note: `accumulated >= claimed` is enforced by the contract (`claim()` reverts
// if claimable == 0), but defensive code returns 0n if claimed > accumulated
// (cannot happen on-chain — defends against future contract redeploys with
// different semantics).
export const splitVaultHandler: FlapVaultHandler = {
  kind: 'split-vault',
  async readClaimable(
    vault: BscAddress,
    user: BscAddress,
    _signal?: AbortSignal,
  ): Promise<bigint> {
    try {
      const result = await bscClient.readContract({
        address: vault as `0x${string}`,
        abi: SPLITVAULT_USERBALANCES_ABI,
        functionName: 'userBalances',
        args: [user],
      });
      // viem decodes (uint128, uint128) as a tuple [accumulated, claimed].
      // Both values are bigint (uint128 -> bigint in viem >= 2.x).
      const [accumulated, claimed] = result as readonly [bigint, bigint];
      if (claimed > accumulated) {
        // Cannot happen on-chain (contract enforces invariant), defensive zero return.
        log.warn('splitVault.invariant_violated', {
          vault: vault.slice(0, 10),
          accumulated: accumulated.toString(),
          claimed: claimed.toString(),
        });
        return 0n;
      }
      return accumulated - claimed;
    } catch (err) {
      log.warn('splitVault.readClaimable_failed', {
        vault: vault.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
      return 0n;
    }
  },
};
