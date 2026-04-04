import { describe, it, expect, vi } from 'vitest';

// Mock server-only and logger (bankr.ts imports both)
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import { wethToWei } from '@/lib/platforms/bankr';
import { safeBigInt } from '@/lib/utils';

// ─── wethToWei ──────────────────────────────────────────

describe('wethToWei', () => {
  it('converts "1.5" to correct wei string', () => {
    expect(wethToWei('1.5')).toBe('1500000000000000000');
  });

  it('converts "0" to "0"', () => {
    expect(wethToWei('0')).toBe('0');
  });

  it('converts sub-wei precision (19 decimals) to "0"', () => {
    // 0.0000000000000000001 has 19 decimal places — below 18-digit precision
    expect(wethToWei('0.0000000000000000001')).toBe('0');
  });

  it('converts negative value to "0"', () => {
    expect(wethToWei('-1.0')).toBe('0');
  });

  it('converts scientific notation "1e18" to "0" (not a plain decimal)', () => {
    // wethToWei only accepts plain decimal format; sci notation doesn't match the regex
    expect(wethToWei('1e18')).toBe('0');
  });

  it('converts integer without decimal "100" correctly', () => {
    expect(wethToWei('100')).toBe('100000000000000000000');
  });

  it('converts empty string to "0"', () => {
    expect(wethToWei('')).toBe('0');
  });

  it('converts "abc" to "0"', () => {
    expect(wethToWei('abc')).toBe('0');
  });

  it('converts null to "0"', () => {
    expect(wethToWei(null)).toBe('0');
  });

  it('converts undefined to "0"', () => {
    expect(wethToWei(undefined)).toBe('0');
  });

  it('converts "0.000000" to "0"', () => {
    expect(wethToWei('0.000000')).toBe('0');
  });

  it('handles a leading "<" character (e.g. "<0.001")', () => {
    // bankr.ts strips leading '<' before parsing
    const result = wethToWei('<0.001');
    expect(result).toBe('1000000000000000');
  });

  it('handles raw wei strings (19+ digit integers) as passthrough', () => {
    const rawWei = '1000000000000000000000'; // 1000 ETH in wei, 22 digits
    expect(wethToWei(rawWei)).toBe(rawWei);
  });

  it('converts "0.005417" (typical Bankr fee) correctly', () => {
    expect(wethToWei('0.005417')).toBe('5417000000000000');
  });

  it('converts "1" to 1e18 wei', () => {
    expect(wethToWei('1')).toBe('1000000000000000000');
  });

  it('rejects unreasonably large values (> 27 digits result)', () => {
    // A value that would produce > 1 billion ETH in wei
    expect(wethToWei('99999999999')).toBe('0');
  });

  it('handles whitespace around the value', () => {
    expect(wethToWei('  1.5  ')).toBe('1500000000000000000');
  });
});

// ─── safeBigInt (additional coverage) ───────────────────

describe('safeBigInt', () => {
  it('converts normal integer string "12345" to 12345n', () => {
    expect(safeBigInt('12345')).toBe(12345n);
  });

  it('truncates decimal string "123.456" to 123n', () => {
    expect(safeBigInt('123.456')).toBe(123n);
  });

  it('handles scientific notation "1e9" correctly', () => {
    expect(safeBigInt('1e9')).toBe(1000000000n);
  });

  it('clamps negative value "-5" to 0n', () => {
    expect(safeBigInt('-5')).toBe(0n);
  });

  it('returns 0n for empty string', () => {
    expect(safeBigInt('')).toBe(0n);
  });

  it('handles very large integer strings correctly', () => {
    const large = '999999999999999999999999';
    expect(safeBigInt(large)).toBe(999999999999999999999999n);
  });

  it('returns 0n for non-numeric string "abc"', () => {
    expect(safeBigInt('abc')).toBe(0n);
  });

  it('returns 0n for null', () => {
    expect(safeBigInt(null)).toBe(0n);
  });

  it('returns 0n for undefined', () => {
    expect(safeBigInt(undefined)).toBe(0n);
  });

  it('handles scientific notation with decimal "1.5e18"', () => {
    // Number("1.5e18") = 1.5e18, .toFixed(0) produces "1500000000000000000"
    expect(safeBigInt('1.5e18')).toBe(1500000000000000000n);
  });

  it('returns 0n for Infinity-producing strings', () => {
    expect(safeBigInt('1e999')).toBe(0n);
  });
});
