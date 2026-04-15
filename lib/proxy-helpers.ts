/**
 * Pure helpers consumed by proxy.ts. Extracted so they can be unit-tested
 * without standing up a full NextRequest mock.
 */

/**
 * Paths that match HANDLE_ROUTE_RE in proxy.ts but are NOT creator handles.
 * Without this denylist, browser auto-fetches (favicon, manifest) and normal
 * site navigation (/docs, /terms, /leaderboard) count toward the per-IP
 * enumeration budget, which causes legitimate users to hit a lockout.
 */
export const RESERVED_PAGE_PATHS: ReadonlySet<string> = new Set<string>([
  '/leaderboard',
  '/docs',
  '/terms',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/site.webmanifest',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
]);

/**
 * True if the referer header points at one of the provided allowed origins.
 * Returns false on missing or malformed values — callers treat that as a
 * cross-origin request and apply the normal limit check.
 */
export function isSameOriginReferer(
  referer: string | null,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!referer) return false;
  try {
    return allowedOrigins.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

/**
 * Decide whether to skip the per-IP enumeration check for a given request.
 * Skips when the path is reserved (non-handle navigation/asset) or when the
 * referer is one of our own origins (legitimate browse from /leaderboard).
 */
export function shouldSkipEnumerationCheck(
  pathname: string,
  referer: string | null,
  allowedOrigins: ReadonlySet<string>,
  reservedPaths: ReadonlySet<string> = RESERVED_PAGE_PATHS,
): boolean {
  return reservedPaths.has(pathname) || isSameOriginReferer(referer, allowedOrigins);
}
