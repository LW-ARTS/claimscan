import { getAddress, type Address } from 'viem';
import { asBaseAddress, asBscAddress, type BaseAddress, type BscAddress } from '@/lib/chains/types';

// Base (EVM) Contract Addresses — getAddress() enforces EIP-55 checksum at import time
// and types them as Address, eliminating all downstream `as Address` casts.
export const CLANKER_FACTORY: Address = getAddress('0xE85A59c628F7d27878ACeB4bf3b35733630083a9');
export const CLANKER_FEE_LOCKER: Address = getAddress('0xF3622742b1E446D92e45E22923Ef11C2fcD55D68');
export const CLANKER_LP_LOCKER: Address = getAddress('0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0');
export const ZORA_PROTOCOL_REWARDS: Address = getAddress('0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B');

// BSC (BNB Chain) — Clanker v4 deployment
export const CLANKER_BSC_FEE_LOCKER: Address = getAddress('0x67D04Ae42F03D9b63dE0E6F2d82bB186A0306bBb');
export const CLANKER_BSC_LP_LOCKER: Address = getAddress('0x1166022e1becc70E7E9aB2250aF1aC7842B9B420');

// ═══════════════════════════════════════════════
// Flaunch.gg — Base mainnet
// Source: flayerlabs/flaunch-sdk addresses.ts (confirmed 2026-04-20)
// Branded as BaseAddress to prevent cross-chain address confusion per Plan 11-01.
// ═══════════════════════════════════════════════

export const FLAUNCH_REVENUE_MANAGER: BaseAddress = asBaseAddress('0xc8d4B2Ca8eD6868eE768beAb1f932d7eecCc1b50');
// Original Flaunch PM — old coins; no per-pool historical data available without event scanning.
export const FLAUNCH_POSITION_MANAGER: BaseAddress = asBaseAddress('0x51Bba15255406Cfe7099a42183302640ba7dAFDC');
// Takeover.fun PM — new coins; FeeEscrow tracks totalFeesAllocated per pool for historical reads.
export const FLAUNCH_TAKEOVER_POSITION_MANAGER: BaseAddress = asBaseAddress('0x23321f11a6d44Fd1ab790044FdFDE5758c902FDc');
export const FLAUNCH_NFT_FACTORY: BaseAddress = asBaseAddress('0xCc7A4A00072ccbeEEbd999edc812C0ce498Fb63B');
// Memestream NFT for Takeover.fun PM — tokenId/poolId lookups for historical fee tracking.
export const FLAUNCH_MEMESTREAM_NFT: BaseAddress = asBaseAddress('0x516af52D0c629B5E378DA4DC64Ecb0744cE10109');
export const FLAUNCH_STAKING_MANAGER: BaseAddress = asBaseAddress('0xec0069F8DBbbC94058dc895000dd38ef40b3125d');
export const FLAUNCH_BUYBACK_MANAGER: BaseAddress = asBaseAddress('0x3AAF3b1D8cD5b61C77f99bA7cdf41E9eC0Ba8a3f');
export const FLAUNCH_FEE_ESCROW: BaseAddress = asBaseAddress('0x72e6f7948b1B1A343B477F39aAbd2E35E6D27dde');
export const FLETH: BaseAddress = asBaseAddress('0x000000000D564D5be76f7f0d28fE52605afC7Cf8');

// ═══════════════════════════════════════════════
// Flap.sh — BSC mainnet
// Source: docs.flap.sh /flap/developers/deployed-contract-addresses (verified 2026-04-24)
// Portal + VaultPortal are TransparentUpgradeableProxy, impls source-verified on BscScan:
//   Portal impl:      0x225894eAdeABBBA41ECdfd88a3eF88Aa0AF31D44 (Solidity 0.8.24)
//   VaultPortal impl: 0x5f54c5ea7bf1c63e765e8406253fb02473d115a1
// Deploy block from Portal creation txn 0x9f6935c97b662a10a8c4ea725e172e8a13fd37beb9fe76a9100ee97619639d00
// Branded as BscAddress to prevent cross-chain address confusion (per shared foundation SF-03).
// ═══════════════════════════════════════════════

export const FLAP_PORTAL: BscAddress = asBscAddress('0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0');
export const FLAP_VAULT_PORTAL: BscAddress = asBscAddress('0x90497450f2a706f1951b5bdda52B4E5d16f34C06');
export const FLAP_PORTAL_DEPLOY_BLOCK = 39_980_228n;
