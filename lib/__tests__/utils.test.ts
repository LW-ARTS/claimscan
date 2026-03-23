import { describe, it, expect } from 'vitest';
import {
  safeBigInt,
  formatTokenAmount,
  formatUsd,
  computeFeeUsd,
  toUsdValue,
  isWalletAddress,
  isValidWalletInput,
} from '@/lib/utils';

// ─── safeBigInt ──────────────────────────────────────────

describe('safeBigInt', () => {
  it('returns 0n for null', () => {
    expect(safeBigInt(null)).toBe(0n);
  });

  it('returns 0n for undefined', () => {
    expect(safeBigInt(undefined)).toBe(0n);
  });

  it('returns 0n for empty string', () => {
    expect(safeBigInt('')).toBe(0n);
  });

  it('returns 0n for "0"', () => {
    expect(safeBigInt('0')).toBe(0n);
  });

  it('converts "123" to 123n', () => {
    expect(safeBigInt('123')).toBe(123n);
  });

  it('clamps negative values to 0n', () => {
    expect(safeBigInt('-5')).toBe(0n);
    expect(safeBigInt('-999999')).toBe(0n);
  });

  it('truncates decimal strings to 0n (integer part is "0" equivalent)', () => {
    expect(safeBigInt('0.5')).toBe(0n);
  });

  it('truncates decimal strings keeping integer part', () => {
    expect(safeBigInt('123.456')).toBe(123n);
  });

  it('handles large integer strings correctly', () => {
    const large = '999999999999999999';
    expect(safeBigInt(large)).toBe(999999999999999999n);
  });

  it('returns 0n for garbage input', () => {
    expect(safeBigInt('abc')).toBe(0n);
    expect(safeBigInt('!@#')).toBe(0n);
  });

  it('returns 0n for whitespace-only string', () => {
    expect(safeBigInt('   ')).toBe(0n);
  });
});

// ─── formatTokenAmount ──────────────────────────────────

describe('formatTokenAmount', () => {
  it('formats 1000000000 with 9 decimals as "1.00"', () => {
    expect(formatTokenAmount('1000000000', 9)).toBe('1.00');
  });

  it('returns "0" for raw "0"', () => {
    expect(formatTokenAmount('0', 9)).toBe('0');
  });

  it('formats large values with M suffix', () => {
    // 2_000_000 tokens with 9 decimals = 2000000 * 10^9
    const raw = '2000000000000000';
    expect(formatTokenAmount(raw, 9)).toContain('M');
  });

  it('formats thousands with K suffix', () => {
    // 5000 tokens with 9 decimals = 5000 * 10^9
    const raw = '5000000000000';
    expect(formatTokenAmount(raw, 9)).toContain('K');
  });

  it('formats sub-1 amounts with leading zeros', () => {
    // 0.5 tokens with 9 decimals = 500000000
    const raw = '500000000';
    expect(formatTokenAmount(raw, 9)).toBe('0.50');
  });

  it('returns "0" for negative decimals', () => {
    expect(formatTokenAmount('1000', -1)).toBe('0');
  });

  it('returns "0" for decimals > 78', () => {
    expect(formatTokenAmount('1000', 79)).toBe('0');
  });

  it('handles 18 decimals (EVM standard)', () => {
    // 1 ETH = 10^18 wei
    const oneEth = '1000000000000000000';
    expect(formatTokenAmount(oneEth, 18)).toBe('1.00');
  });

  it('handles very small fractional amounts', () => {
    // 0.001 tokens with 9 decimals = 1000000
    const raw = '1000000';
    expect(formatTokenAmount(raw, 9)).toBe('0.0010');
  });
});

// ─── formatUsd ──────────────────────────────────────────

describe('formatUsd', () => {
  it('formats 0 as "$0.00"', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('formats 1234.5 as "$1.23K"', () => {
    expect(formatUsd(1234.5)).toBe('$1.23K');
  });

  it('formats small positive value with 4 decimals', () => {
    expect(formatUsd(0.001)).toBe('$0.0010');
  });

  it('formats millions with M suffix', () => {
    expect(formatUsd(2_500_000)).toBe('$2.50M');
  });

  it('formats values >= 1 with 2 decimals', () => {
    expect(formatUsd(42.789)).toBe('$42.79');
  });

  it('returns "$0.00" for negative', () => {
    expect(formatUsd(-10)).toBe('$0.00');
  });

  it('returns "$0.00" for NaN', () => {
    expect(formatUsd(NaN)).toBe('$0.00');
  });

  it('returns "$0.00" for Infinity', () => {
    expect(formatUsd(Infinity)).toBe('$0.00');
  });
});

// ─── computeFeeUsd ──────────────────────────────────────

describe('computeFeeUsd', () => {
  const solPrice = 150;
  const ethPrice = 3000;

  it('returns total_earned_usd when available', () => {
    const fee = {
      total_earned_usd: 500,
      total_unclaimed: '1000000000',
      total_earned: '1000000000',
      chain: 'sol',
      platform: 'pump',
    };
    expect(computeFeeUsd(fee, solPrice, ethPrice)).toBe(500);
  });

  it('computes SOL fee from amount when total_earned_usd is null (native platform)', () => {
    // 1 SOL = 10^9 lamports, price $150 → $150
    const fee = {
      total_earned_usd: null,
      total_unclaimed: '1000000000',
      total_earned: '1000000000',
      chain: 'sol',
      platform: 'pump',
    };
    const result = computeFeeUsd(fee, solPrice, ethPrice);
    expect(result).toBeCloseTo(150, 1);
  });

  it('computes ETH fee from amount (native platform)', () => {
    // 1 ETH = 10^18 wei, price $3000 → $3000
    const fee = {
      total_earned_usd: null,
      total_unclaimed: '1000000000000000000',
      total_earned: '1000000000000000000',
      chain: 'base',
      platform: 'zora',
    };
    const result = computeFeeUsd(fee, solPrice, ethPrice);
    expect(result).toBeCloseTo(3000, 0);
  });

  it('returns 0 for non-native platform without total_earned_usd', () => {
    const fee = {
      total_earned_usd: null,
      total_unclaimed: '1000000000',
      total_earned: '1000000000',
      chain: 'sol',
      platform: 'clanker',
    };
    expect(computeFeeUsd(fee, solPrice, ethPrice)).toBe(0);
  });

  it('returns 0 when all amounts are zero', () => {
    const fee = {
      total_earned_usd: null,
      total_unclaimed: '0',
      total_earned: '0',
      chain: 'sol',
      platform: 'pump',
    };
    expect(computeFeeUsd(fee, solPrice, ethPrice)).toBe(0);
  });

  it('falls back to total_unclaimed when total_earned is 0', () => {
    // 0.5 SOL = 500_000_000 lamports → $75
    const fee = {
      total_earned_usd: null,
      total_unclaimed: '500000000',
      total_earned: '0',
      chain: 'sol',
      platform: 'pump',
    };
    const result = computeFeeUsd(fee, solPrice, ethPrice);
    expect(result).toBeCloseTo(75, 1);
  });

  it('allows native-token row fallback via token_address prefix', () => {
    const fee = {
      total_earned_usd: null,
      total_unclaimed: '1000000000',
      total_earned: '1000000000',
      chain: 'sol',
      platform: 'believe',
      token_address: 'SOL:believe:somepool',
    };
    const result = computeFeeUsd(fee, solPrice, ethPrice);
    expect(result).toBeCloseTo(150, 1);
  });
});

// ─── toUsdValue ─────────────────────────────────────────

describe('toUsdValue', () => {
  it('converts 1 SOL to correct USD', () => {
    // 1 SOL = 10^9 lamports at $150 = $150
    expect(toUsdValue(1_000_000_000n, 9, 150)).toBeCloseTo(150, 2);
  });

  it('converts 1 ETH to correct USD', () => {
    // 1 ETH = 10^18 wei at $3000 = $3000
    expect(toUsdValue(10n ** 18n, 18, 3000)).toBeCloseTo(3000, 0);
  });

  it('returns 0 for zero amount', () => {
    expect(toUsdValue(0n, 9, 150)).toBe(0);
  });

  it('returns 0 for zero price', () => {
    expect(toUsdValue(1_000_000_000n, 9, 0)).toBe(0);
  });

  it('returns 0 for negative decimals', () => {
    expect(toUsdValue(1000n, -1, 100)).toBe(0);
  });

  it('handles amounts larger than MAX_SAFE_INTEGER', () => {
    // 10_000 ETH in wei = 10^22
    const bigAmount = 10n ** 22n;
    const result = toUsdValue(bigAmount, 18, 3000);
    expect(result).toBeCloseTo(30_000_000, -3); // $30M
  });
});

// ─── isWalletAddress ────────────────────────────────────

describe('isWalletAddress', () => {
  it('recognizes a valid Solana address', () => {
    // Real Solana address (base58, 32-44 chars)
    expect(isWalletAddress('8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR')).toBe(true);
  });

  it('recognizes a valid EVM 0x address', () => {
    expect(isWalletAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isWalletAddress('')).toBe(false);
  });

  it('rejects a too-short string', () => {
    expect(isWalletAddress('abc')).toBe(false);
  });

  it('rejects a random word', () => {
    expect(isWalletAddress('hello world')).toBe(false);
  });

  it('rejects 0x with wrong length', () => {
    expect(isWalletAddress('0x1234')).toBe(false);
  });

  it('rejects Solana address with invalid base58 chars (0, O, I, l)', () => {
    // 'O' is not valid base58
    expect(isWalletAddress('OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO')).toBe(false);
  });
});

// ─── isValidWalletInput ─────────────────────────────────

describe('isValidWalletInput', () => {
  it('accepts a valid SOL wallet input', () => {
    const input = {
      address: '8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR',
      chain: 'sol',
      sourcePlatform: 'pump',
    };
    expect(isValidWalletInput(input)).toBe(true);
  });

  it('accepts a valid Base wallet input', () => {
    const input = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      chain: 'base',
      sourcePlatform: 'clanker',
    };
    expect(isValidWalletInput(input)).toBe(true);
  });

  it('accepts a valid ETH wallet input', () => {
    const input = {
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      chain: 'eth',
      sourcePlatform: 'bankr',
    };
    expect(isValidWalletInput(input)).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidWalletInput(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidWalletInput(undefined)).toBe(false);
  });

  it('rejects missing address', () => {
    expect(isValidWalletInput({ chain: 'sol', sourcePlatform: 'pump' })).toBe(false);
  });

  it('rejects missing chain', () => {
    expect(isValidWalletInput({
      address: '8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR',
      sourcePlatform: 'pump',
    })).toBe(false);
  });

  it('rejects invalid chain', () => {
    expect(isValidWalletInput({
      address: '8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR',
      chain: 'btc',
      sourcePlatform: 'pump',
    })).toBe(false);
  });

  it('rejects invalid platform', () => {
    expect(isValidWalletInput({
      address: '8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR',
      chain: 'sol',
      sourcePlatform: 'fake_platform',
    })).toBe(false);
  });

  it('rejects SOL chain with EVM address format', () => {
    expect(isValidWalletInput({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      chain: 'sol',
      sourcePlatform: 'pump',
    })).toBe(false);
  });

  it('rejects EVM chain with Solana address format', () => {
    expect(isValidWalletInput({
      address: '8VU2cuNTgxqXEfCXrhLzt7rbVxeoev881C9jY3LGivzR',
      chain: 'base',
      sourcePlatform: 'clanker',
    })).toBe(false);
  });
});
