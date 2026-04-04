import { NextResponse } from 'next/server';
import { parseSearchQuery, resolveWallets } from '@/lib/resolve/identity';
import { verifyTurnstile } from '@/lib/turnstile';

export const maxDuration = 60;

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  try {
    const body = await request.json();

    // Turnstile verification (matches /api/search pattern)
    const ip = (request as unknown as { ip?: string }).ip
      ?? (process.env.VERCEL ? request.headers.get('x-real-ip')?.trim() : null)
      ?? null;
    const turnstile = await verifyTurnstile(body.cfTurnstileToken ?? null, ip);
    if (!turnstile.success) {
      return NextResponse.json(
        { error: turnstile.error ?? 'Captcha verification failed' },
        { status: 403 }
      );
    }

    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!query || query.length < 2 || query.length > 256) {
      return NextResponse.json(
        { error: 'Query must be 2-256 characters' },
        { status: 400 }
      );
    }

    const parsed = parseSearchQuery(query);
    const wallets = await resolveWallets(parsed.value, parsed.provider);

    return NextResponse.json({
      query: parsed.value,
      provider: parsed.provider,
      wallets,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[resolve] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
