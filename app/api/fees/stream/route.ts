import { registerSSEClient, unregisterSSEClient } from '@/lib/helius/sse-registry';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';
import { verifyRequestSignature } from '@/lib/request-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Vercel Hobby hard limit — SSE connections are killed after 10s.
 * On Vercel Pro this should be increased to 300 for long-lived SSE. */
export const maxDuration = 10;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sig = searchParams.get('sig');
  const isValid = await verifyRequestSignature(sig, '/api/fees/stream');
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid request signature' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const walletsParam = searchParams.get('wallets');

  if (!walletsParam) {
    return new Response(JSON.stringify({ error: 'Missing wallets parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let walletAddresses: string[];
  try {
    const parsed = JSON.parse(walletsParam);
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    walletAddresses = parsed
      .filter((w: unknown): w is { address: string } =>
        typeof w === 'object' && w !== null && 'address' in w && typeof (w as { address: unknown }).address === 'string'
      )
      .map((w: { address: string }) => w.address)
      .filter((addr: string) => isValidSolanaAddress(addr) || isValidEvmAddress(addr))
      .slice(0, 10); // Max 10 wallets per connection
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid wallets parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (walletAddresses.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid wallets' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Register for SSE updates on each wallet
      for (const wallet of walletAddresses) {
        registerSSEClient(wallet, controller);
      }

      // Send initial connection confirmation
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        for (const wallet of walletAddresses) {
          unregisterSSEClient(wallet, controller);
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
