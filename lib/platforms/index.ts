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
import { flapAdapter } from './flap';

// ═══════════════════════════════════════════════
// Platform Registry
// ═══════════════════════════════════════════════

// Record<Platform, PlatformAdapter>: compile-time enforcement that every
// Platform value has an adapter. All 11 launchpads are shipped as of Phase 12.
// Adding a new platform means: extend Platform union (lib/supabase/types.ts)
// + adjust migration enum + import + register below.
const adapters: Record<Platform, PlatformAdapter> = {
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
  flap: flapAdapter,
};

/**
 * Get a specific platform adapter by name.
 */
export function getAdapter(platform: Platform): PlatformAdapter | null {
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
