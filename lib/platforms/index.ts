import 'server-only';
import type { Platform } from '@/lib/supabase/types';
import type { PlatformAdapter } from './types';
import { bagsAdapter } from './bags';
import { clankerAdapter } from './clanker';
import { pumpAdapter } from './pump';
import { zoraAdapter } from './zora';
import { heavenAdapter } from './heaven';
import { bankrAdapter } from './bankr';
import { believeAdapter } from './believe';
import { revshareAdapter } from './revshare';
import { coinbarrelAdapter } from './coinbarrel';
import { raydiumAdapter } from './raydium';

// ═══════════════════════════════════════════════
// Platform Registry
// ═══════════════════════════════════════════════

const adapters: Record<Platform, PlatformAdapter> = {
  bags: bagsAdapter,
  clanker: clankerAdapter,
  pump: pumpAdapter,
  zora: zoraAdapter,
  heaven: heavenAdapter,
  bankr: bankrAdapter,
  believe: believeAdapter,
  revshare: revshareAdapter,
  coinbarrel: coinbarrelAdapter,
  raydium: raydiumAdapter,
};

/**
 * Get a specific platform adapter.
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
  return Object.values(adapters).filter((a) => a.supportsIdentityResolution);
}

/**
 * Get adapters that support live unclaimed fee queries.
 */
export function getLiveFeeAdapters(): PlatformAdapter[] {
  return Object.values(adapters).filter((a) => a.supportsLiveFees);
}

/**
 * Get adapters that support handle-based fee queries.
 */
export function getHandleFeeAdapters(): PlatformAdapter[] {
  return Object.values(adapters).filter((a) => a.supportsHandleBasedFees);
}

/**
 * Register a new adapter (used for Tier 2 adapters added later).
 */
export function registerAdapter(adapter: PlatformAdapter): void {
  adapters[adapter.platform] = adapter;
}

export type { PlatformAdapter } from './types';
export type {
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';
