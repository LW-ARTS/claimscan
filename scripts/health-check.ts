#!/usr/bin/env npx tsx
// scripts/health-check.ts

function validateEnv(): void {
  const missing: string[] = [];

  const required = [
    'SOLANA_RPC_URL',
    'BASE_RPC_URL',
    'ETH_RPC_URL',
    'BSC_RPC_URL',
    'ZORA_API_KEY',
    'BANKR_API_KEY',
    'HELIUS_API_KEY',
  ];

  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }

  // Bags: either BAGS_API_KEYS or BAGS_API_KEY must be set
  if (!process.env.BAGS_API_KEYS && !process.env.BAGS_API_KEY) {
    missing.push('BAGS_API_KEYS (or BAGS_API_KEY)');
  }

  if (missing.length > 0) {
    for (const m of missing) console.error(`MISSING: ${m}`);
    process.exit(1);
  }
}

validateEnv();

// TODO Phase 5: probe adapters
console.log('Env OK — all required vars present.');
