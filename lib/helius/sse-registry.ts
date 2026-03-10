// ═══════════════════════════════════════════════
// SSE Client Registry
// In-memory registry of connected SSE clients for real-time push.
// NOTE: Instance-local in serverless (Vercel). For multi-instance
// deployments, this would need Redis pub/sub or similar.
// ═══════════════════════════════════════════════

/** Map of wallet address → set of SSE stream controllers */
const sseClients = new Map<string, Set<ReadableStreamDefaultController>>();

export function registerSSEClient(
  wallet: string,
  controller: ReadableStreamDefaultController
): void {
  if (!sseClients.has(wallet)) {
    sseClients.set(wallet, new Set());
  }
  sseClients.get(wallet)!.add(controller);
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
export function getSSEClientCount(): number {
  let count = 0;
  for (const clients of sseClients.values()) {
    count += clients.size;
  }
  return count;
}
