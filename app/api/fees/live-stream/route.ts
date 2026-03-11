import { getAllAdapters } from '@/lib/platforms';
import { isValidWalletInput } from '@/lib/utils';
import type { ResolvedWallet, TokenFee } from '@/lib/platforms/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 55;

/**
 * SSE streaming endpoint for live fees.
 * Each adapter pushes a `partial-result` event as soon as it completes,
 * so fast adapters (Pump, Bags) appear instantly while slow ones
 * (Coinbarrel, RevShare) stream in later.
 *
 * This bypasses the Vercel Hobby 10s limit on the JSON route because
 * SSE connections with `runtime = 'nodejs'` get up to 55s.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return new Response('Content-Type must be application/json', { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const rawWallets = (body as Record<string, unknown>)?.wallets;
  if (!Array.isArray(rawWallets) || rawWallets.length === 0) {
    return new Response('wallets must be a non-empty array', { status: 400 });
  }

  const wallets: ResolvedWallet[] = [];
  for (const w of rawWallets.slice(0, 10)) {
    if (!isValidWalletInput(w)) {
      return new Response('Invalid wallet object', { status: 400 });
    }
    wallets.push({
      address: w.address,
      chain: w.chain as ResolvedWallet['chain'],
      sourcePlatform: w.sourcePlatform as ResolvedWallet['sourcePlatform'],
    });
  }

  const encoder = new TextEncoder();
  const adapters = getAllAdapters().filter((a) => a.supportsLiveFees);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed by client
        }
      };

      // Fire each adapter independently — push results as they arrive.
      // Pass request.signal so adapters abort when the client disconnects.
      const { signal } = request;
      const tasks = wallets.flatMap((wallet) =>
        adapters
          .filter((a) => a.chain === wallet.chain)
          .map(async (adapter) => {
            try {
              const fees = await adapter.getLiveUnclaimedFees(wallet.address, signal);
              if (fees.length > 0) {
                send('partial-result', {
                  platform: adapter.platform,
                  chain: adapter.chain,
                  fees,
                });
              }
            } catch (err) {
              console.warn(
                `[live-stream] ${adapter.platform} failed:`,
                err instanceof Error ? err.message : err
              );
              send('adapter-error', {
                platform: adapter.platform,
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            }
          })
      );

      await Promise.allSettled(tasks);

      send('complete', { timestamp: new Date().toISOString() });

      try {
        controller.close();
      } catch {
        // Already closed
      }
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
