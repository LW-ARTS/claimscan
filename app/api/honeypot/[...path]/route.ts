import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('honeypot');

/**
 * Honeypot endpoint — disguised as attractive scraper targets (e.g. /api/v2/data, /api/admin).
 * Legitimate users never hit these paths. Any request here is from a scraper or scanner.
 * Logs the attempt via structured logger for forensic review.
 */
function logAndReject(request: NextRequest) {
  // L-02: only trust x-real-ip on Vercel (spoofable in any other environment)
  const ip =
    (request as unknown as { ip?: string }).ip ??
    (process.env.VERCEL ? (request.headers.get('x-real-ip') ?? 'unknown') : 'unknown');
  const ua = request.headers.get('user-agent') ?? 'none';
  const path = request.nextUrl.pathname;

  const sanitize = (s: string) => s.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 200);
  log.warn('Scraper detected', { path: sanitize(path), ip: sanitize(ip), ua: sanitize(ua) });

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
