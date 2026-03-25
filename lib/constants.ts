// ═══════════════════════════════════════════════
// Contract Addresses & Program IDs
// ═══════════════════════════════════════════════

// Solana Program IDs
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const METEORA_DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const COINBARREL_PROGRAM_ID = '7HxbxHnTUBaUfWjVPbPLs8gqqScmjmBWjRnETBjS9DMj';
export const RAYDIUM_LAUNCHLAB_PROGRAM_ID = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
// Base (EVM) Contract Addresses — moved to lib/constants-evm.ts to avoid
// pulling viem into client bundles. Import from there for server-side code.

// ═══════════════════════════════════════════════
// API URLs
// ═══════════════════════════════════════════════

export const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
export const CLANKER_API_BASE = 'https://clanker.world/api';
// Zora adapter uses onchain reads, not REST API
export const RAYDIUM_LAUNCHLAB_API = 'https://launch-mint-v1.raydium.io';

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
  bsc: {
    name: 'BNB Chain',
    nativeToken: 'BNB',
    nativeDecimals: 18,
    coingeckoId: 'binancecoin',
    chainId: 56,
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

/** All EVM-compatible chain keys. Used for cross-chain matching and normalization checks. */
export const EVM_CHAINS: ReadonlySet<string> = new Set(['base', 'eth', 'bsc']);

// ═══════════════════════════════════════════════
// ClaimScan Fee Config
// ═══════════════════════════════════════════════

/** Wallet that receives the ClaimScan service fee on claims. */
export const CLAIMSCAN_FEE_WALLET = '8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR';
/** Fee in basis points (85 = 0.85%). */
export const CLAIMSCAN_FEE_BPS = 85;
/** Minimum fee in lamports. Below this, skip the fee tx (gas would cost more). */
export const MIN_FEE_LAMPORTS = 1_000_000n; // 0.001 SOL

// ═══════════════════════════════════════════════
// Timing Constants
// ═══════════════════════════════════════════════

export const CACHE_TTL_MS = 40 * 60 * 1000; // 40 minutes
export const CACHE_TTL_HEAVY_MS = 2 * 60 * 60 * 1000; // 2 hours — for creators with 500+ fee records
export const LIVE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
