import 'server-only';
import { bscClient } from '@/lib/chains/bsc';
import type { BscAddress } from '@/lib/chains/types';
import { CLAIMABLE_ABI, type FlapVaultHandler } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-vaults:base-v1');

export const baseV1Handler: FlapVaultHandler = {
  kind: 'base-v1',
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
      log.warn('baseV1.readClaimable_failed', {
        vault: vault.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
      return 0n;
    }
  },
};
