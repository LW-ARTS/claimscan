// ═══════════════════════════════════════════════
// SSE Client Registry
// In-memory registry of connected SSE clients for real-time push.
// NOTE: Instance-local in serverless (Vercel). For multi-instance
// deployments, this would need Redis pub/sub or similar.
// ═══════════════════════════════════════════════

/** Map of wallet address → set of SSE stream controllers */
const sseClients = new Map<string, Set<ReadableStreamDefaultController>>();

/** Max SSE connections per wallet to prevent memory exhaustion from connection flooding. */
const MAX_SSE_PER_WALLET = 10;

/** Global cap on total SSE connections across all wallets. */
const MAX_TOTAL_SSE_CLIENTS = 500;

export function registerSSEClient(
  wallet: string,
  controller: ReadableStreamDefaultController
): void {
  if (!sseClients.has(wallet)) {
    sseClients.set(wallet, new Set());
  }
  const set = sseClients.get(wallet)!;
  if (set.size >= MAX_SSE_PER_WALLET) return; // Drop excess per-wallet
  // Global cap to prevent connection flooding across many wallets
  let totalClients = 0;
  for (const s of sseClients.values()) totalClients += s.size;
  if (totalClients >= MAX_TOTAL_SSE_CLIENTS) return;
  set.add(controller);
}

export function unregisterSSEClient(
  wallet: string,
  controller: ReadableStreamDefaultController
): void {
  sseClients.get(wallet)?.delete(controller);
  if (sseClients.get(wallet)?.size === 0) {
    sseClients.delete(wallet);
  }
}

/**
 * Push an SSE event to all clients watching a specific wallet.
 * Returns the number of clients notified.
 */
export function pushSSEEvent(wallet: string, data: Record<string, unknown>): number {
  const clients = sseClients.get(wallet);
  if (!clients || clients.size === 0) return 0;

  const ssePayload = `data: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(ssePayload);
  let notified = 0;

  for (const controller of clients) {
    try {
      controller.enqueue(encoded);
      notified++;
    } catch {
      // Client disconnected — remove from registry
      clients.delete(controller);
    }
  }

  if (clients.size === 0) {
    sseClients.delete(wallet);
  }

  return notified;
}

/**
 * Get count of connected SSE clients (debug/metrics).
 */
function getSSEClientCount(): number {
  let count = 0;
  for (const clients of sseClients.values()) {
    count += clients.size;
  }
  return count;
}
