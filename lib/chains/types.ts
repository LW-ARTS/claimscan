import { getAddress } from 'viem';

// ═══════════════════════════════════════════════
// Branded EVM address types
// Prevents cross-chain address confusion at the type level. getAddress()
// applies EIP-55 checksum but does not distinguish chain; branding does.
// ═══════════════════════════════════════════════

// Brand fields use distinct keys so nested brands (e.g. BaseAddress extends
// EvmAddress) don't collide on `__brand` and collapse to `never` when TS
// resolves the intersection for property access.

export type EvmAddress = `0x${string}` & { readonly __evmBrand: true };
export type BaseAddress = EvmAddress & { readonly __chainBrand: 'base' };
export type BscAddress = EvmAddress & { readonly __chainBrand: 'bsc' };

/**
 * Stamp a raw 0x-prefixed string as a checksummed BaseAddress.
 * Uses viem's getAddress() which throws on invalid input.
 */
export function asBaseAddress(addr: `0x${string}`): BaseAddress {
  return getAddress(addr) as BaseAddress;
}

/**
 * Stamp a raw 0x-prefixed string as a checksummed BscAddress.
 * Uses viem's getAddress() which throws on invalid input.
 */
export function asBscAddress(addr: `0x${string}`): BscAddress {
  return getAddress(addr) as BscAddress;
}
