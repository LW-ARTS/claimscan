import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Honeypot endpoint — disguised as attractive scraper targets (e.g. /api/v2/data, /api/admin).
 * Legitimate users never hit these paths. Any request here is from a scraper or scanner.
 * Logs the attempt for forensic review in Vercel logs.
 */
function logAndReject(request: NextRequest) {
  const ip =
    (request as unknown as { ip?: string }).ip ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const ua = request.headers.get('user-agent') ?? 'none';
  const path = request.nextUrl.pathname;

  console.warn(`[honeypot] Scraper detected | path=${path} | ip=${ip} | ua=${ua.slice(0, 200)}`);

  // Return a convincing 403 that doesn't reveal this is a honeypot
  return NextResponse.json(
    { error: 'Forbidden' },
    { status: 403 }
  );
}

export function GET(request: NextRequest) { return logAndReject(request); }
export function POST(request: NextRequest) { return logAndReject(request); }
export function PUT(request: NextRequest) { return logAndReject(request); }
export function DELETE(request: NextRequest) { return logAndReject(request); }
