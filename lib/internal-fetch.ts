/**
 * Shared helpers for internal server-side fetches (e.g., API routes fetching
 * their own opengraph-image route). Validates the host against an allowlist
 * to prevent SSRF if `VERCEL_URL`/`NEXT_PUBLIC_APP_URL` ever resolves to an
 * attacker-controlled value (env misconfig or spoofed `X-Forwarded-Host`).
 */

/**
 * Resolve the canonical host for internal fetches. Returns `null` if the
 * resolved host is not in the allowlist — callers should 500 and log.
 *
 * Allowlist mirrors the tightened regex from H-1/L-01: the hyphen separator
 * after "claimscan" blocks attacker-owned projects like `claimscanevil.vercel.app`.
 */
export function resolveSafeHost(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://claimscan.tech';
  let host: string;
  try {
    // `||` (not `??`) so an empty-string VERCEL_URL (local `vercel dev`
    // without a linked env) falls back to NEXT_PUBLIC_APP_URL instead of
    // blocking with "SSRF resolved host not in allowlist".
    host = process.env.VERCEL_URL || new URL(appUrl).host;
  } catch {
    return null;
  }
  if (
    host !== 'claimscan.tech' &&
    host !== 'www.claimscan.tech' &&
    !/^claimscan(-[a-z0-9-]+)?\.vercel\.app$/.test(host)
  ) {
    return null;
  }
  return host;
}

export function resolveInternalProtocol(): 'http' | 'https' {
  return process.env.NODE_ENV === 'production' ? 'https' : 'http';
}
