import { NextResponse } from 'next/server';
import { fetchLiveUnclaimedFees } from '@/lib/resolve/identity';
import { isValidWalletInput } from '@/lib/utils';
import type { ResolvedWallet } from '@/lib/platforms/types';

/** Vercel Hobby hard limit is 10s. This tells the runtime we want the full budget. */
export const maxDuration = 60;

/**
 * Validate and parse a wallets array from raw input.
 */
function validateWallets(parsed: unknown): ResolvedWallet[] | NextResponse {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return NextResponse.json(
      { error: 'wallets must be a non-empty array' },
      { status: 400 }
    );
  }

  const validated: ResolvedWallet[] = [];
  for (const w of parsed.slice(0, 10)) {
    if (!isValidWalletInput(w)) {
      return NextResponse.json(
        { error: 'Invalid wallet object. Required: address, chain (sol|base|eth), sourcePlatform' },
        { status: 400 }
      );
    }
    validated.push({
      address: w.address,
      chain: w.chain as ResolvedWallet['chain'],
      sourcePlatform: w.sourcePlatform as ResolvedWallet['sourcePlatform'],
    });
  }
  return validated;
}

async function fetchAndRespond(validated: ResolvedWallet[]) {
  try {
    const fees = await fetchLiveUnclaimedFees(validated);
    return NextResponse.json({
      fees,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[fees/live] unexpected error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET deprecated — return 410 Gone with migration guidance
export async function GET() {
  return NextResponse.json(
    { error: 'GET is no longer supported. Use POST with a JSON body: { "wallets": [...] }' },
    { status: 410 }
  );
}

/**
 * POST handler for clients that need to send larger wallet arrays
 * without hitting URL length limits.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const wallets = (body as Record<string, unknown>)?.wallets;
  if (!wallets) {
    return NextResponse.json(
      { error: 'Request body must contain a "wallets" array' },
      { status: 400 }
    );
  }

  const result = validateWallets(wallets);
  if (result instanceof NextResponse) return result;
  return fetchAndRespond(result);
}
