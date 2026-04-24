import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { BscAddress } from '@/lib/chains/types';
import type { FlapVaultHandler } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-vaults:unknown');

// Fallback handler — always returns 0n (UI renders D-04 badge "Claim method unknown").
// Fires Sentry warning with fingerprint so each distinct vault emits ONE alert
// (not thousands per cron run). Dashboard: LW-52.
export const unknownHandler: FlapVaultHandler = {
  kind: 'unknown',
  async readClaimable(
    vault: BscAddress,
    _user: BscAddress,
    _signal?: AbortSignal,
  ): Promise<bigint> {
    // Sentry fingerprint groups all reports for the same vault into a single issue.
    // The issue will auto-unmute when a new vault appears (different fingerprint).
    Sentry.captureMessage('Flap unknown vault detected', {
      level: 'warning',
      fingerprint: ['flap-unknown-vault', vault],
      extra: {
        vault,
      },
    });
    log.warn('unknown.readClaimable_skipped', { vault: vault.slice(0, 10) });
    return 0n;
  },
};
