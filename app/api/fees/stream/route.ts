import { registerSSEClient, unregisterSSEClient } from '@/lib/helius/sse-registry';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';

// ═══════════════════════════════════════════════
// SSE Stream Endpoint
// Clients connect here for real-time fee update notifications.
// When a Helius webhook fires, the webhook receiver pushes
// events through this stream to connected clients.
// ═══════════════════════════════════════════════

export const runtime = 'nodejs'; // SSE needs long-lived connections
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletsParam = searchParams.get('wallets');

  if (!walletsParam) {
    return new Response('Missing wallets parameter', { status: 400 });
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
    return new Response('Invalid wallets parameter', { status: 400 });
  }

  if (walletAddresses.length === 0) {
    return new Response('No valid wallets', { status: 400 });
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
