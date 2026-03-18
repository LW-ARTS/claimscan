/**
 * Request signing — lightweight anti-replay and anti-scraping layer.
 *
 * The frontend signs each API request with a rotating HMAC derived from:
 *   - A server-provided secret baked into the JS bundle via NEXT_PUBLIC_API_SIGN_KEY
 *   - The current timestamp (rounded to 30s windows)
 *   - The request path
 *
 * This prevents casual scripted scraping (curl, python-requests) because
 * the signing key is embedded in minified JS and rotates. It does NOT stop
 * a determined attacker who reverse-engineers the bundle — it raises the bar.
 *
 * The signature is sent via X-Request-Sig header: `{timestamp}.{hex-signature}`
 */

const WINDOW_MS = 30_000; // 30-second signing windows
const MAX_DRIFT_WINDOWS = 2; // accept current ± 2 windows (±60s clock drift)

/**
 * Generate a signature for a request (client-side).
 */
export async function signRequest(path: string): Promise<string> {
  const key = process.env.NEXT_PUBLIC_API_SIGN_KEY;
  if (!key) return '';

  const timestamp = Math.floor(Date.now() / WINDOW_MS);
  const message = `${timestamp}:${path}`;
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${timestamp}.${hex}`;
}

/**
 * Verify a request signature (server-side / middleware).
 * Returns true if signature is valid or if signing is not configured.
 */
export async function verifyRequestSignature(
  sig: string | null,
  path: string
): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_API_SIGN_KEY;

  // If signing is not configured: fail-closed in production, permissive in dev
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[request-signing] NEXT_PUBLIC_API_SIGN_KEY not configured in production');
      return false;
    }
    return true;
  }

  // If configured but no signature provided, reject
  if (!sig) return false;

  const dotIndex = sig.indexOf('.');
  if (dotIndex === -1) return false;

  const timestampStr = sig.slice(0, dotIndex);
  const providedHex = sig.slice(dotIndex + 1);

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Validate hex format (64 hex chars = SHA-256)
  if (!/^[0-9a-f]{64}$/.test(providedHex)) return false;

  const currentWindow = Math.floor(Date.now() / WINDOW_MS);

  // Check current window and allowed drift windows
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  for (let drift = -MAX_DRIFT_WINDOWS; drift <= MAX_DRIFT_WINDOWS; drift++) {
    const windowTs = currentWindow + drift;
    if (windowTs !== timestamp) continue;

    const message = `${windowTs}:${path}`;
    const expected = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    if (expectedHex.length !== providedHex.length) continue;
    let mismatch = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      mismatch |= expectedHex.charCodeAt(i) ^ providedHex.charCodeAt(i);
    }
    if (mismatch === 0) return true;
  }

  return false;
}
