import 'server-only';
import type { Platform } from '@/lib/supabase/types';
import type { PlatformAdapter } from './types';
import { bagsAdapter } from './bags';
import { clankerAdapter } from './clanker';
import { pumpAdapter } from './pump';
import { zoraAdapter } from './zora';
import { bankrAdapter } from './bankr';
import { believeAdapter } from './believe';
import { revshareAdapter } from './revshare';
import { coinbarrelAdapter } from './coinbarrel';
import { raydiumAdapter } from './raydium';
import { flaunchAdapter } from './flaunch';

// ═══════════════════════════════════════════════
// Platform Registry
// ═══════════════════════════════════════════════

// Record<Exclude<Platform, 'flap'>, PlatformAdapter>: compile-time enforcement
// that every implemented platform has an adapter, while 'flap' is explicitly
// deferred to Phase 12. Plan 12 will drop the Exclude once flapAdapter lands.
// `getAdapter()` returns `| null` so callers that ask for 'flap' today get a
// typed null instead of a runtime-only undefined.
const adapters: Record<Exclude<Platform, 'flap'>, PlatformAdapter> = {
  bags: bagsAdapter,
  clanker: clankerAdapter,
  pump: pumpAdapter,
  zora: zoraAdapter,
  bankr: bankrAdapter,
  believe: believeAdapter,
  revshare: revshareAdapter,
  coinbarrel: coinbarrelAdapter,
  raydium: raydiumAdapter,
  flaunch: flaunchAdapter,
  // flap: flapAdapter added in Phase 12.
};

/**
 * Get a specific platform adapter by name.
 */
export function getAdapter(platform: Platform): PlatformAdapter | null {
  if (platform === 'flap') return null;
  return adapters[platform] ?? null;
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): PlatformAdapter[] {
  return Object.values(adapters);
}

/**
 * Get adapters that can resolve social identities to wallets.
 */
export function getIdentityResolvers(): PlatformAdapter[] {
  return getAllAdapters().filter((a) => a.supportsIdentityResolution);
}

/**
 * Get adapters that support live unclaimed fee queries.
 */
export function getLiveFeeAdapters(): PlatformAdapter[] {
  return getAllAdapters().filter((a) => a.supportsLiveFees);
}

/**
 * Get adapters that support handle-based fee queries.
 */
export function getHandleFeeAdapters(): PlatformAdapter[] {
  return getAllAdapters().filter((a) => a.supportsHandleBasedFees);
}
