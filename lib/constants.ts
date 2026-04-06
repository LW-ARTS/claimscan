// ═══════════════════════════════════════════════
// Contract Addresses & Program IDs
// ═══════════════════════════════════════════════

// Solana Program IDs
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const PUMP_FEES_PROGRAM_ID = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
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
    name: 'BNB',
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
// App Configuration
// ═══════════════════════════════════════════════

/** Canonical app URL. Used for CORS, sitemap, robots, OG images. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://claimscan.tech';
/** Allowed origins for CORS and Origin validation (primary + www + Vercel preview). */
export const APP_ORIGINS = new Set([
  APP_URL,
  APP_URL.replace('://', '://www.'),
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
]);

// ═══════════════════════════════════════════════
// Rate Limits (shared between proxy.ts and rate-limit.ts)
// ═══════════════════════════════════════════════

export const RATE_LIMIT_GENERAL = 30;  // req/min — all API routes
export const RATE_LIMIT_SEARCH = 10;   // req/min — /api/search, /api/resolve
export const RATE_LIMIT_FEES = 5;      // req/min — /api/fees/live*

// ═══════════════════════════════════════════════
// Claim Flow
// ═══════════════════════════════════════════════

export const MAX_ACTIVE_CLAIMS_PER_WALLET = 10;
export const MAX_MINTS_PER_CLAIM_BATCH = 10;
/** Pending/signing claims older than this are expired (blockhash invalid). */
export const CLAIM_PENDING_EXPIRY_MS = 5 * 60 * 1000;
/** Submitted claims not confirmed within this window are expired. */
export const CLAIM_SUBMITTED_EXPIRY_MS = 2 * 60 * 1000;
/** Failed/expired claims can be retried within this window. */
export const CLAIM_RECOVERY_WINDOW_MS = 15 * 60 * 1000;
/** HMAC confirm token validity window in minutes. Must match CLAIM_RECOVERY_WINDOW_MS. */
export const CLAIM_HMAC_MAX_AGE_MINUTES = 15;
/** Wait time for Solana finalization after confirmed status (typically 6-12s). */
export const SOLANA_FINALIZATION_WAIT_MS = 15_000;

// ═══════════════════════════════════════════════
// Security Headers
// ═══════════════════════════════════════════════

export const HSTS_HEADER = 'max-age=63072000; includeSubDomains; preload';

// ═══════════════════════════════════════════════
// Timing Constants
// ═══════════════════════════════════════════════

export const CACHE_TTL_MS = 40 * 60 * 1000; // 40 minutes
export const CACHE_TTL_HEAVY_MS = 2 * 60 * 60 * 1000; // 2 hours — for creators with 500+ fee records
export const LIVE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
