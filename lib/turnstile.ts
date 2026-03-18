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

  // If Turnstile is not configured: permissive ONLY in local dev, fail-closed everywhere else
  // (prevents staging/preview deployments from accidentally running without captcha)
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      return { success: true };
    }
    console.error('[turnstile] TURNSTILE_SECRET_KEY not configured — failing closed');
    return { success: false, error: 'Captcha not configured' };
  }

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
      return { success: false, error: 'Captcha service unavailable' };
    }

    const data = await res.json();
    if (!data.success) {
      return { success: false, error: `Captcha failed: ${(data['error-codes'] ?? []).join(', ')}` };
    }

    return { success: true };
  } catch (err) {
    console.error('[turnstile] Verification error:', err instanceof Error ? err.message : err);
    return { success: false, error: 'Captcha verification unavailable' };
  }
}
