import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock server-only (not installed outside Next.js)
vi.mock('server-only', () => ({}));

import { generateConfirmToken, verifyConfirmToken } from '@/lib/claim/hmac';

const TEST_SECRET = 'test-hmac-secret-must-be-at-least-32chars!';

beforeAll(() => {
  vi.stubEnv('CLAIM_HMAC_SECRET', TEST_SECRET);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ─── generateConfirmToken + verifyConfirmToken round-trip ───

describe('HMAC claim tokens', () => {
  const wallet = '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12';
  const claimAttemptId = 'attempt-001';

  it('generates a token with the expected format (minuteTs.hex64)', () => {
    const token = generateConfirmToken(claimAttemptId, wallet);
    const [ts, hex] = token.split('.');
    expect(Number(ts)).toBeGreaterThan(0);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('round-trips: generated token verifies successfully', () => {
    const token = generateConfirmToken(claimAttemptId, wallet);
    expect(verifyConfirmToken(token, claimAttemptId, wallet)).toBe(true);
  });

  // ─── Expired token ──────────────────────────────────────

  it('rejects an expired token (> 15 minutes old)', () => {
    // Generate token at the current time
    const token = generateConfirmToken(claimAttemptId, wallet);

    // Advance time by 16 minutes (960_000 ms)
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60_000);

    expect(verifyConfirmToken(token, claimAttemptId, wallet)).toBe(false);

    vi.useRealTimers();
  });

  it('accepts a token still within the 15-minute window', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const token = generateConfirmToken(claimAttemptId, wallet);

    // Advance 14 minutes — still valid
    vi.setSystemTime(now + 14 * 60_000);
    expect(verifyConfirmToken(token, claimAttemptId, wallet)).toBe(true);

    vi.useRealTimers();
  });

  // ─── Wrong wallet ───────────────────────────────────────

  it('rejects verification with a different wallet', () => {
    const token = generateConfirmToken(claimAttemptId, wallet);
    const wrongWallet = '0x0000000000000000000000000000000000000000';
    expect(verifyConfirmToken(token, claimAttemptId, wrongWallet)).toBe(false);
  });

  // ─── Wrong claimAttemptId ───────────────────────────────

  it('rejects verification with a different claimAttemptId', () => {
    const token = generateConfirmToken(claimAttemptId, wallet);
    expect(verifyConfirmToken(token, 'attempt-999', wallet)).toBe(false);
  });

  // ─── Malformed tokens ──────────────────────────────────

  describe('malformed tokens', () => {
    it('rejects a token with no dot separator', () => {
      expect(verifyConfirmToken('nodothere', claimAttemptId, wallet)).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(verifyConfirmToken('', claimAttemptId, wallet)).toBe(false);
    });

    it('rejects a random string', () => {
      expect(verifyConfirmToken('just-some-random-garbage', claimAttemptId, wallet)).toBe(false);
    });

    it('rejects a token with a non-numeric timestamp part', () => {
      expect(verifyConfirmToken('abc.0000000000000000000000000000000000000000000000000000000000000000', claimAttemptId, wallet)).toBe(false);
    });

    it('rejects a token with hex that is not 64 chars', () => {
      const minuteTs = Math.floor(Date.now() / 60_000);
      expect(verifyConfirmToken(`${minuteTs}.deadbeef`, claimAttemptId, wallet)).toBe(false);
    });
  });

  // ─── Tampered HMAC ─────────────────────────────────────

  it('rejects a token with a tampered HMAC (single character changed)', () => {
    const token = generateConfirmToken(claimAttemptId, wallet);
    const [ts, hex] = token.split('.');

    // Flip the first hex character
    const firstChar = hex[0];
    const flipped = firstChar === 'a' ? 'b' : 'a';
    const tampered = `${ts}.${flipped}${hex.slice(1)}`;

    expect(verifyConfirmToken(tampered, claimAttemptId, wallet)).toBe(false);
  });

  it('rejects a token with the HMAC entirely replaced', () => {
    const token = generateConfirmToken(claimAttemptId, wallet);
    const ts = token.split('.')[0];
    const fakeHex = '0'.repeat(64);

    expect(verifyConfirmToken(`${ts}.${fakeHex}`, claimAttemptId, wallet)).toBe(false);
  });
});
