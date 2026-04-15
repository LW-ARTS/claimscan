import { describe, it, expect } from 'vitest';
import {
  RESERVED_PAGE_PATHS,
  isSameOriginReferer,
  shouldSkipEnumerationCheck,
} from '@/lib/proxy-helpers';

const ORIGINS: ReadonlySet<string> = new Set([
  'https://claimscan.tech',
  'https://www.claimscan.tech',
  'https://claimscan-foo.vercel.app',
]);

describe('RESERVED_PAGE_PATHS', () => {
  it('contains all top-level page routes that match HANDLE_ROUTE_RE', () => {
    expect(RESERVED_PAGE_PATHS.has('/leaderboard')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/docs')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/terms')).toBe(true);
  });

  it('contains browser auto-fetched assets', () => {
    expect(RESERVED_PAGE_PATHS.has('/favicon.ico')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/robots.txt')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/sitemap.xml')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/site.webmanifest')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/manifest.json')).toBe(true);
    expect(RESERVED_PAGE_PATHS.has('/apple-touch-icon.png')).toBe(true);
  });

  it('does not contain real handle examples', () => {
    expect(RESERVED_PAGE_PATHS.has('/toly')).toBe(false);
    expect(RESERVED_PAGE_PATHS.has('/finnbags')).toBe(false);
    expect(RESERVED_PAGE_PATHS.has('/vitalik.eth')).toBe(false);
  });
});

describe('isSameOriginReferer', () => {
  it('returns false for null referer', () => {
    expect(isSameOriginReferer(null, ORIGINS)).toBe(false);
  });

  it('returns false for empty referer', () => {
    expect(isSameOriginReferer('', ORIGINS)).toBe(false);
  });

  it('returns true for canonical origin', () => {
    expect(isSameOriginReferer('https://claimscan.tech/leaderboard', ORIGINS)).toBe(true);
    expect(isSameOriginReferer('https://claimscan.tech/', ORIGINS)).toBe(true);
  });

  it('returns true for www variant', () => {
    expect(isSameOriginReferer('https://www.claimscan.tech/docs', ORIGINS)).toBe(true);
  });

  it('returns true for vercel preview origin in the set', () => {
    expect(isSameOriginReferer('https://claimscan-foo.vercel.app/', ORIGINS)).toBe(true);
  });

  it('returns false for unrelated origin', () => {
    expect(isSameOriginReferer('https://evil.example.com/leaderboard', ORIGINS)).toBe(false);
  });

  it('returns false for spoofed lookalike', () => {
    expect(isSameOriginReferer('https://claimscan.tech.evil.com/', ORIGINS)).toBe(false);
  });

  it('returns false for malformed URL', () => {
    expect(isSameOriginReferer('not-a-url', ORIGINS)).toBe(false);
    expect(isSameOriginReferer('://broken', ORIGINS)).toBe(false);
  });

  it('ignores path and query when matching', () => {
    expect(isSameOriginReferer('https://claimscan.tech/leaderboard?q=1#x', ORIGINS)).toBe(true);
  });
});

describe('shouldSkipEnumerationCheck', () => {
  it('skips for reserved page paths regardless of referer', () => {
    expect(shouldSkipEnumerationCheck('/leaderboard', null, ORIGINS)).toBe(true);
    expect(shouldSkipEnumerationCheck('/favicon.ico', null, ORIGINS)).toBe(true);
    expect(shouldSkipEnumerationCheck('/docs', 'https://evil.com/', ORIGINS)).toBe(true);
  });

  it('skips for handle paths when referer is same-origin', () => {
    expect(
      shouldSkipEnumerationCheck('/toly', 'https://claimscan.tech/leaderboard', ORIGINS),
    ).toBe(true);
    expect(
      shouldSkipEnumerationCheck('/finnbags', 'https://www.claimscan.tech/', ORIGINS),
    ).toBe(true);
  });

  it('does NOT skip for handle paths with no referer (direct nav)', () => {
    expect(shouldSkipEnumerationCheck('/toly', null, ORIGINS)).toBe(false);
  });

  it('does NOT skip for handle paths with foreign referer', () => {
    expect(
      shouldSkipEnumerationCheck('/toly', 'https://evil.example.com/', ORIGINS),
    ).toBe(false);
    expect(
      shouldSkipEnumerationCheck('/toly', 'https://google.com/search', ORIGINS),
    ).toBe(false);
  });

  it('does NOT skip when referer is malformed', () => {
    expect(shouldSkipEnumerationCheck('/toly', 'garbage', ORIGINS)).toBe(false);
  });

  it('respects custom reservedPaths argument', () => {
    const customReserved = new Set(['/custom']);
    expect(shouldSkipEnumerationCheck('/custom', null, ORIGINS, customReserved)).toBe(true);
    expect(shouldSkipEnumerationCheck('/leaderboard', null, ORIGINS, customReserved)).toBe(false);
  });
});
