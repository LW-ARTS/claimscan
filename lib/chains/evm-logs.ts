import 'server-only';
import type { Address } from 'viem';

/**
 * Minimal client interface for getLogs calls.
 * Using a structural type instead of viem's PublicClient avoids chain-generic
 * mismatches (e.g. Base "deposit" tx types vs mainnet).
 */
interface LogsClient {
  getLogs(params: Record<string, unknown>): Promise<unknown[]>;
}

// ═══════════════════════════════════════════════
// Shared chunked getLogs infrastructure for EVM chains
// ═══════════════════════════════════════════════

/** Return type for log entries from getLogs. */
export type LogEntry = { address: string; args: Record<string, unknown> };

/** Fetch logs for a single chunk range with retry + exponential backoff on 429. */
async function fetchLogsChunk(
  client: LogsClient,
  tag: string,
  params: {
    address: Address | Address[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any;
    args: Record<string, Address>;
    fromBlock: bigint;
    toBlock: bigint;
  }
): Promise<LogEntry[]> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (client as any).getLogs({
        address: params.address,
        event: params.event,
        args: params.args,
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      });
      return logs as LogEntry[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = msg.includes('429') || msg.includes('rate limit') || msg.includes('503') || msg.includes('no backend');
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = 1_000 * (attempt + 1); // 1s, 2s, 3s
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return []; // unreachable but satisfies TS
}

/**
 * Split a large getLogs range into fixed-size chunks processed in parallel batches.
 * Works around RPC block-range limits on public RPCs.
 *
 * @param client      - viem PublicClient to use for getLogs calls
 * @param tag         - log prefix for warnings (e.g. '[base]' or '[eth]')
 * @param chunkSize   - max blocks per getLogs query
 * @param parallel    - number of concurrent chunk requests per round
 * @param throttleMs  - delay between parallel rounds (0 to disable)
 * @param params      - getLogs parameters (address, event, args, fromBlock, toBlock)
 */
export async function chunkedGetLogs(
  client: LogsClient,
  tag: string,
  chunkSize: bigint,
  parallel: number,
  throttleMs: number,
  params: {
    address: Address | Address[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any;
    args: Record<string, Address>;
    fromBlock: bigint;
    toBlock: bigint;
  }
): Promise<LogEntry[]> {
  const { fromBlock, toBlock } = params;
  if (fromBlock > toBlock) return [];

  // Build list of [start, end] chunk ranges
  const chunks: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
    chunks.push([start, end]);
  }

  const allLogs: LogEntry[] = [];

  // Process in parallel batches -- retry logic handles 429s
  for (let i = 0; i < chunks.length; i += parallel) {
    const batch = chunks.slice(i, i + parallel);
    const results = await Promise.allSettled(
      batch.map(([start, end]) =>
        fetchLogsChunk(client, tag, { ...params, fromBlock: start, toBlock: end })
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allLogs.push(...r.value);
      } else {
        console.warn(`${tag} chunkedGetLogs chunk failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }

    // Throttle between rounds to avoid overwhelming public RPCs
    if (throttleMs > 0 && i + parallel < chunks.length) {
      await new Promise((r) => setTimeout(r, throttleMs));
    }
  }

  return allLogs;
}
