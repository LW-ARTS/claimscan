const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResult {
  success: boolean;
  error?: string;
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 * Returns { success: true } if verification passes or Turnstile is not configured.
 */
export async function verifyTurnstile(token: string | null, ip: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // If Turnstile is not configured, skip verification (opt-in feature)
  if (!secret) return { success: true };

  if (!token) return { success: false, error: 'Missing captcha token' };

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });

    if (!res.ok) {
      console.error('[turnstile] Verify endpoint returned', res.status);
      // Fail open on Cloudflare outages to avoid blocking all users
      return { success: true };
    }

    const data = await res.json();
    if (!data.success) {
      return { success: false, error: `Captcha failed: ${(data['error-codes'] ?? []).join(', ')}` };
    }

    return { success: true };
  } catch (err) {
    console.error('[turnstile] Verification error:', err instanceof Error ? err.message : err);
    // Fail open on network errors
    return { success: true };
  }
}
