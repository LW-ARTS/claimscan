import type { Platform, Chain } from '@/lib/supabase/types';

export interface WalletFixture {
  /** Adapter/platform name -- must match a valid Platform value */
  adapterName: Platform;
  /** Primary chain for this adapter */
  chain: Chain;
  /** Real public wallet address for a known creator with active tokens */
  walletAddress: string;
  /**
   * Minimum number of TokenFee results expected from getHistoricalFees.
   * Used by tests and health check to detect stale/broken fixtures.
   * Set conservatively -- raise once a live run confirms actual counts.
   */
  expectedMinResultCount: number;
}

export const WALLET_FIXTURES: WalletFixture[] = [
  {
    adapterName: 'bags',
    chain: 'sol',
    walletAddress: 'BTeqNydtKyDaSxQNRm8ByaUDPK3cpQ1FsXMtaF1Hfaom',
    expectedMinResultCount: 10,
    // finnbags -- Bags.fm founder. 4106 fee_records in DB (2026-04-10).
  },
  {
    adapterName: 'pump',
    chain: 'sol',
    walletAddress: 'BLfPswvLtt4tiegAk6j6cke1sJRUEicp3EPcuqQBwJe5',
    expectedMinResultCount: 1,
    // prguitarman -- Pump.fun creator. Pump returns synthetic vault aggregate rows
    // (SOL:pump, SOL:pumpswap), so count is low but stable.
  },
  {
    adapterName: 'clanker',
    chain: 'base',
    walletAddress: '0x40e82A6269e6a98b852C8ebC5DCdc4f352dCA6b7',
    expectedMinResultCount: 10,
    // vitalik.eth -- 36 Clanker fee_records in DB (2026-04-10).
  },
  {
    adapterName: 'zora',
    chain: 'base',
    walletAddress: '0x3776975b2B1BE4AF83D0c8C4b08F96cf3b05cA6E',
    expectedMinResultCount: 1,
    // vitalikbuterin -- 2 Zora fee_records in DB; Zora coverage is thin.
  },
  {
    adapterName: 'bankr',
    chain: 'base',
    walletAddress: '0x987442429caC9D4ae98c700aE9008e062a92858d',
    expectedMinResultCount: 5,
    // elonmusk -- 14 Bankr fee_records in DB (2026-04-10).
  },
  {
    adapterName: 'believe',
    chain: 'sol',
    walletAddress: '55ak4pnVc1hkBURu1Q3kXmZvyZaPvpWKPGC7M3yKvAfZ',
    expectedMinResultCount: 5,
    // satiri121 -- 13 Believe fee_records in DB (2026-04-10).
  },
  {
    adapterName: 'raydium',
    chain: 'sol',
    walletAddress: '93qpYMHajKduTyocPemNop24pCrKkhJWXd7MiKJYeegv',
    expectedMinResultCount: 1,
    // Anon creator -- 1 Raydium fee_record in DB; only adapter with scan data.
  },
  {
    adapterName: 'revshare',
    chain: 'sol',
    walletAddress: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    expectedMinResultCount: 1,
    // RevShare.dev authority -- withdrawWithheldAuthority for earliest Token-2022 mints.
    // No DB records yet (adapter not scanned); raise threshold after first live run.
  },
  {
    adapterName: 'coinbarrel',
    chain: 'sol',
    walletAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    expectedMinResultCount: 1,
    // Raydium Authority V4 -- appears as CREATOR_FEE_RECIPIENT in Coinbarrel DAMM V2 pools.
    // No DB records yet (adapter not scanned); raise threshold after first live run.
  },
];

/** Look up a fixture by adapter name. Throws if not found (test misconfiguration). */
export function getFixture(adapterName: Platform): WalletFixture {
  const fixture = WALLET_FIXTURES.find((f) => f.adapterName === adapterName);
  if (!fixture) {
    throw new Error(`No fixture found for adapter "${adapterName}". Add it to WALLET_FIXTURES.`);
  }
  return fixture;
}
