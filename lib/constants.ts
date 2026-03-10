import { getAddress, type Address } from 'viem';

// ═══════════════════════════════════════════════
// Contract Addresses & Program IDs
// ═══════════════════════════════════════════════

// Solana Program IDs
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
// NOTE: PUMP_FEE_PROGRAM_ID ('pfee...') is not used — fees are read from vault PDAs.
// Kept as reference for potential future use with the fee claim instruction.
// NOTE: BAGS_FEE_SHARE_V2 was removed — the previous value was an invalid
// 56-character string (Solana pubkeys are max 44 chars base58).
// Re-add with the correct program ID when Bags publishes their V2 address.
export const METEORA_DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const COINBARREL_PROGRAM_ID = '7HxbxHnTUBaUfWjVPbPLs8gqqScmjmBWjRnETBjS9DMj';
export const RAYDIUM_LAUNCHLAB_PROGRAM_ID = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
// Base (EVM) Contract Addresses — getAddress() enforces EIP-55 checksum at import time
// and types them as Address, eliminating all downstream `as Address` casts.
export const CLANKER_FACTORY: Address = getAddress('0xE85A59c628F7d27878ACeB4bf3b35733630083a9');
export const CLANKER_FEE_LOCKER: Address = getAddress('0xF3622742b1E446D92e45E22923Ef11C2fcD55D68');
export const CLANKER_LP_LOCKER: Address = getAddress('0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0');
export const ZORA_PROTOCOL_REWARDS: Address = getAddress('0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B');

// ═══════════════════════════════════════════════
// API URLs
// ═══════════════════════════════════════════════

export const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
export const CLANKER_API_BASE = 'https://clanker.world/api';
export const ZORA_API_BASE = 'https://api-sdk.zora.engineering/api';
export const BANKR_API_BASE = 'https://api.bankr.bot/agent';
export const RAYDIUM_LAUNCHLAB_API = 'https://launch-mint-v1.raydium.io';

// Identity / Social APIs
export const NEYNAR_API_BASE = 'https://api.neynar.com/v2';

// Price APIs
export const COINGECKO_API = 'https://api.coingecko.com/api/v3';
export const DEXSCREENER_API = 'https://api.dexscreener.com';
export const JUPITER_PRICE_API = 'https://api.jup.ag/price/v3';

// Helius APIs
export const HELIUS_DAS_URL = 'https://mainnet.helius-rpc.com';
export const HELIUS_REST_URL = 'https://api-mainnet.helius-rpc.com';

// ═══════════════════════════════════════════════
// Chain Config
// ═══════════════════════════════════════════════

export const CHAIN_CONFIG = {
  sol: {
    name: 'Solana',
    nativeToken: 'SOL',
    nativeDecimals: 9,
    coingeckoId: 'solana',
  },
  base: {
    name: 'Base',
    nativeToken: 'ETH',
    nativeDecimals: 18,
    coingeckoId: 'ethereum',
    chainId: 8453,
  },
  eth: {
    name: 'Ethereum',
    nativeToken: 'ETH',
    nativeDecimals: 18,
    coingeckoId: 'ethereum',
    chainId: 1,
  },
} as const;

// ═══════════════════════════════════════════════
// Platform Config
// ═══════════════════════════════════════════════

export const PLATFORM_CONFIG = {
  bags: { name: 'Bags.fm', chain: 'sol' as const, color: '#FF6B35' },
  clanker: { name: 'Clanker', chain: 'base' as const, color: '#0052FF' },
  pump: { name: 'Pump.fun', chain: 'sol' as const, color: '#00D4AA' },
  zora: { name: 'Zora', chain: 'base' as const, color: '#5B5BD6' },
  bankr: { name: 'Bankr', chain: 'base' as const, color: '#1DA1F2' },
  believe: { name: 'Believe', chain: 'sol' as const, color: '#E91E63' },
  revshare: { name: 'RevShare', chain: 'sol' as const, color: '#4CAF50' },
  coinbarrel: { name: 'Coinbarrel', chain: 'sol' as const, color: '#FF8C00' },
  raydium: { name: 'Raydium', chain: 'sol' as const, color: '#6C5CE7' },
} as const;

// ═══════════════════════════════════════════════
// Timing Constants
// ═══════════════════════════════════════════════

export const CACHE_TTL_MS = 40 * 60 * 1000; // 40 minutes
export const LIVE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
export const PRICE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
