import 'server-only';
import { bscClient } from '@/lib/chains/bsc';
import type { BscAddress } from '@/lib/chains/types';
import { CLAIMABLE_ABI, type FlapVaultHandler } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-vaults:base-v2');

// V2 uses the same claimable(address) signature as V1 today. This file exists
// as a distinct dispatch target so the registry can differentiate V2 from V1
// in logs/traces, and so future V2-only methods (TaxBps cache, UISchema, etc.)
// can be added here without touching base-v1.
export const baseV2Handler: FlapVaultHandler = {
  kind: 'base-v2',
  async readClaimable(
    vault: BscAddress,
    user: BscAddress,
    _signal?: AbortSignal,
  ): Promise<bigint> {
    try {
      const value = await bscClient.readContract({
        address: vault as `0x${string}`,
        abi: CLAIMABLE_ABI,
        functionName: 'claimable',
        args: [user],
      });
      return value as bigint;
    } catch (err) {
      log.warn('baseV2.readClaimable_failed', {
        vault: vault.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
      return 0n;
    }
  },
};
