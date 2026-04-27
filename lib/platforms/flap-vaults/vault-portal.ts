import 'server-only';
import { decodeAbiParameters, type Hex } from 'viem';
import { bscClient } from '@/lib/chains/bsc';
import type { BscAddress } from '@/lib/chains/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-vaults:vault-portal');

// VaultPortal.tryGetVault(address) selector — empirically verified against
// fixture token 0x7372bf3b...7777 (RESEARCH.md L292) returning vault
// 0x321354e6... Returns (bool found, VaultInfo info) where the struct's
// FIRST field is `address vault`. Manual decode avoids viem's strict struct-
// shape requirement (we don't have the full VaultInfo solidity definition).
export const TRY_GET_VAULT_SELECTOR = '0xd493059b' as const;

// ═══════════════════════════════════════════════
// lookupVaultAddress — discover the vault contract for a given tax token.
//
// Replaces the original `VaultPortal.getVault(address) returns (address)`
// ABI assumption (which was wrong — getVault actually returns a VaultInfo
// struct, not a bare address; viem decoded the struct's offset prefix as
// the address, returning garbage).
//
// Uses tryGetVault for fail-soft semantics: returns null when the token is
// not registered in the current VaultPortal (e.g., legacy tokens minted
// before the current portal was deployed).
//
// Phase 13 revision r1: extracted from index.ts into this dedicated module
// to avoid a circular import (index.ts re-exports detectFundRecipient from
// ./fund-recipient, and fund-recipient.ts calls lookupVaultAddress; sourcing
// from ./vault-portal keeps the dependency DAG acyclic).
// ═══════════════════════════════════════════════

export async function lookupVaultAddress(
  vaultPortal: BscAddress,
  taxToken: BscAddress,
): Promise<BscAddress | null> {
  const tokenPadded = taxToken.slice(2).toLowerCase().padStart(64, '0');
  const data = (TRY_GET_VAULT_SELECTOR + tokenPadded) as Hex;
  try {
    const result = await bscClient.call({
      to: vaultPortal as `0x${string}`,
      data,
    });
    if (!result.data || result.data.length < 2 + 64 * 3) return null;
    // Layout: [0..32]=bool found, [32..64]=struct offset, [64..96]=vault address slot
    const [found] = decodeAbiParameters(
      [{ type: 'bool' }],
      ('0x' + result.data.slice(2, 2 + 64)) as Hex,
    ) as [boolean];
    if (!found) return null;
    const vaultSlot = result.data.slice(2 + 64 * 2, 2 + 64 * 3);
    const vault = ('0x' + vaultSlot.slice(24)) as BscAddress;
    if (vault.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      return null;
    }
    return vault;
  } catch (err) {
    log.warn('lookupVaultAddress_failed', {
      taxToken: taxToken.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
