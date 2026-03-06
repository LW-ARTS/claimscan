import { NextResponse } from 'next/server';
import { parseSearchQuery, resolveWallets } from '@/lib/resolve/identity';

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
    });
  } catch (error) {
    console.error('[resolve] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
