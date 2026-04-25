import 'server-only';
import { decodeAbiParameters, type Hex } from 'viem';
import { bscClient } from '@/lib/chains/bsc';
import type { BscAddress } from '@/lib/chains/types';
import {
  VAULT_PORTAL_ABI,
  V2_PROBE_ABI,
  VAULT_CATEGORY_MAP,
  type FlapVaultKind,
  type FlapVaultHandler,
} from './types';

// VaultPortal.tryGetVault(address) selector — empirically verified against
// fixture token 0x7372bf3b...7777 (RESEARCH.md L292) returning vault
// 0x321354e6... Returns (bool found, VaultInfo info) where the struct's
// FIRST field is `address vault`. Manual decode avoids viem's strict struct-
// shape requirement (we don't have the full VaultInfo solidity definition).
const TRY_GET_VAULT_SELECTOR = '0xd493059b' as const;
import { baseV1Handler } from './base-v1';
import { baseV2Handler } from './base-v2';
import { unknownHandler } from './unknown';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-vaults:registry');

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

// ═══════════════════════════════════════════════
// Dispatch by vault_type string (cached in flap_tokens.vault_type)
// ═══════════════════════════════════════════════

const HANDLERS: Record<FlapVaultKind, FlapVaultHandler> = {
  'base-v1': baseV1Handler,
  'base-v2': baseV2Handler,
  'unknown': unknownHandler,
};

export function resolveHandler(vaultType: string): FlapVaultHandler {
  return HANDLERS[vaultType as FlapVaultKind] ?? unknownHandler;
}

// ═══════════════════════════════════════════════
// resolveVaultKind — primary classification via VaultPortal.getVaultCategory
//                    + method-probe fallback
//
// Called ONCE per (taxToken, vault) pair at first probe. Result is persisted
// in flap_tokens.vault_type, so subsequent cron runs hit resolveHandler()
// directly and skip this.
//
// The `vaultPortal` address is a parameter (not a module-level default) so
// Plan 04's cron and Plan 05's adapter can inject `FLAP_VAULT_PORTAL`
// explicitly, and tests can inject a mock portal without monkey-patching
// the constant. This also lets this module stay decoupled from the Plan 02
// constants export (which lands in a parallel plan).
// ═══════════════════════════════════════════════

export async function resolveVaultKind(
  vaultPortal: BscAddress,
  taxToken: BscAddress,
  vaultAddress: BscAddress,
): Promise<FlapVaultKind> {
  // 1. Primary: factory-category lookup.
  try {
    const category = await bscClient.readContract({
      address: vaultPortal as `0x${string}`,
      abi: VAULT_PORTAL_ABI,
      functionName: 'getVaultCategory',
      args: [taxToken],
    });
    const categoryNum = Number(category);
    const mapped = VAULT_CATEGORY_MAP[categoryNum];
    if (mapped && mapped !== 'unknown') {
      log.child({ taxToken: taxToken.slice(0, 10), category: categoryNum }).info('primary');
      return mapped;
    }
    // Fall through to method-probe for 'unknown' / unmapped values.
  } catch (err) {
    log.child({ taxToken: taxToken.slice(0, 10) }).warn('getVaultCategory_reverted', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Fallback A: probe V2 marker (vaultUISchema).
  try {
    await bscClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: V2_PROBE_ABI,
      functionName: 'vaultUISchema',
    });
    log.child({ vault: vaultAddress.slice(0, 10) }).info('probe_v2_hit');
    return 'base-v2';
  } catch {
    // Continue to V1 probe.
  }

  // 3. Fallback B: probe V1 claimable(0x0).
  try {
    await bscClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'claimable',
          stateMutability: 'view',
          inputs: [{ name: 'user', type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
      ] as const,
      functionName: 'claimable',
      args: ['0x0000000000000000000000000000000000000000'],
    });
    log.child({ vault: vaultAddress.slice(0, 10) }).info('probe_v1_hit');
    return 'base-v1';
  } catch {
    // All probes failed → unknown.
  }

  log
    .child({ vault: vaultAddress.slice(0, 10), taxToken: taxToken.slice(0, 10) })
    .warn('unknown_vault');
  return 'unknown';
}
