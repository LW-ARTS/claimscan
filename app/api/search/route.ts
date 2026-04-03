import { NextResponse } from 'next/server';
import { resolveAndPersistCreator } from '@/lib/services/creator';
import { verifyTurnstile } from '@/lib/turnstile';

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

    // L-2: Use trusted IP resolution (Vercel platform IP > x-real-ip), not spoofable x-forwarded-for
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

    const query = body.query?.trim();

    if (!query || typeof query !== 'string' || query.length < 2 || query.length > 256) {
      return NextResponse.json(
        { error: 'Query must be 2-256 characters' },
        { status: 400 }
      );
    }

    const result = await resolveAndPersistCreator(query);

    if (!result.creator) {
      return NextResponse.json({
        creator: null,
        wallets: [],
        fees: [],
        cached: false,
        message: 'No wallets found for this identity',
      }, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    // Strip internal DB properties from the creator object before returning.
    // fee_records is redundant (returned separately as `fees`) and leaks table names.
    const { fee_records: _drop, ...creatorPublic } = result.creator as Record<string, unknown>;
    return NextResponse.json({
      creator: creatorPublic,
      wallets: result.wallets,
      fees: result.fees,
      cached: result.cached,
      refreshing: false,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[search] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
