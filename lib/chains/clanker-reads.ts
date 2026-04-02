import 'server-only';
import { parseAbi, parseAbiItem, type Address } from 'viem';
import { chunkedGetLogs } from './evm-logs';
import { createLogger } from '@/lib/logger';
const log = createLogger('clanker-reads');

// ═══════════════════════════════════════════════
// ABIs (shared across Base + BSC)
// ═══════════════════════════════════════════════

export const clankerFeeLockerAbi = parseAbi([
  'function availableFees(address feeOwner, address token) view returns (uint256)',
]);

const erc20TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

// ═══════════════════════════════════════════════
// Generic Clanker Reads (chain-agnostic)
// ═══════════════════════════════════════════════

/** Max tokens per multicall batch. */
const MULTICALL_BATCH_SIZE = 200;

/**
 * Minimal client interface for multicall reads.
 * Structural type avoids chain-generic mismatches between Base/BSC viem clients.
 */
interface MulticallClient {
  multicall(params: {
    contracts: readonly {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }[];
    allowFailure: boolean;
  }): Promise<Array<{ status: 'success'; result: unknown } | { status: 'failure'; error?: { message?: string } }>>;
}

/**
 * Minimal client interface for getLogs + getBlockNumber.
 */
interface LogsBlockClient {
  getLogs(params: Record<string, unknown>): Promise<unknown[]>;
  getBlockNumber(): Promise<bigint>;
}

/**
 * Batch read unclaimed fees for multiple tokens via multicall.
 * Chain-agnostic — pass the appropriate client and FeeLocker address.
 */
/**
 * Batch read unclaimed WETH fees for multiple Clanker tokens via multicall.
 * Chain-agnostic — pass the appropriate client, FeeLocker, and WETH address.
 *
 * IMPORTANT: availableFees(owner, feeToken) returns fees denominated in the
 * feeToken currency. We pass WETH (not the Clanker token) to get ETH-denominated
 * fees. Passing the Clanker token address returns fees in that token's own units,
 * which produces wildly inflated values when treated as ETH.
 */
export async function batchClankerFeesGeneric(
  client: MulticallClient,
  feeLockerAddress: Address,
  owner: Address,
  tokens: Address[],
  tag: string,
  wethAddress?: Address,
): Promise<Array<{ token: Address; available: bigint; claimed: bigint }>> {
  if (tokens.length === 0) return [];

  // Query WETH fees per Clanker token.
  // availableFees(owner, WETH) returns the total WETH across ALL tokens.
  // To get per-token breakdown, we query availableFees(owner, clankerToken)
  // BUT we need WETH-denominated results. The FeeLocker stores fees per
  // (owner, feeToken) pair. For WETH fees: feeToken = WETH address.
  //
  // If wethAddress is provided, query WETH fees (correct).
  // If not, fall back to token-denominated fees (legacy, may be inaccurate).
  const feeQueryToken = wethAddress;

  const allResults: Array<{ token: Address; available: bigint; claimed: bigint }> = [];

  if (feeQueryToken) {
    // Query total WETH fees for this owner (single call, not per-token)
    const contracts = [{
      address: feeLockerAddress,
      abi: clankerFeeLockerAbi as readonly unknown[],
      functionName: 'availableFees' as const,
      args: [owner, feeQueryToken] as readonly unknown[],
    }];

    const results = await client.multicall({ contracts, allowFailure: true });
    const totalWeth = results[0]?.status === 'success' && typeof results[0].result === 'bigint'
      ? results[0].result
      : 0n;

    // Distribute evenly across tokens (FeeLocker doesn't break down WETH per token)
    // This is an approximation — the real split depends on trading volume per token
    if (totalWeth > 0n && tokens.length > 0) {
      const perToken = totalWeth / BigInt(tokens.length);
      for (const token of tokens) {
        allResults.push({ token, available: perToken, claimed: 0n });
      }
    }
    return allResults;
  }

  // Legacy fallback: query per-token (returns token-denominated amounts)
  for (let start = 0; start < tokens.length; start += MULTICALL_BATCH_SIZE) {
    const chunk = tokens.slice(start, start + MULTICALL_BATCH_SIZE);

    const contracts = chunk.map((token) => ({
      address: feeLockerAddress,
      abi: clankerFeeLockerAbi as readonly unknown[],
      functionName: 'availableFees' as const,
      args: [owner, token] as readonly unknown[],
    }));

    const results = await client.multicall({
      contracts,
      allowFailure: true,
    });

    const chunkResults = chunk.map((token, i) => {
      const availResult = results[i];
      if (availResult.status === 'failure') {
        log.warn(`${tag} multicall availableFees failed for token=${token}:`, { error: availResult.error?.message ?? 'unknown' });
      }
      return {
        token,
        available: availResult.status === 'success' && typeof availResult.result === 'bigint'
          ? availResult.result
          : 0n,
        claimed: 0n,
      };
    });

    allResults.push(...chunkResults);
  }

  return allResults;
}

/**
 * Get total claimed fees per token by scanning Transfer events FROM the FeeLocker TO the owner.
 * Chain-agnostic — pass the appropriate client, addresses, and tuning params.
 */
export async function getClankerClaimLogsGeneric(
  logsClient: LogsBlockClient,
  feeLockerAddress: Address,
  deployBlock: bigint,
  scanWindow: bigint,
  chunkSize: bigint,
  parallelChunks: number,
  throttleMs: number,
  timeoutMs: number,
  tag: string,
  owner: Address,
  tokens: Address[],
): Promise<Map<string, bigint>> {
  if (tokens.length === 0) return new Map();

  const scan = async (): Promise<Map<string, bigint>> => {
    const claimMap = new Map<string, bigint>();
    const t0 = Date.now();
    const latestBlock = await logsClient.getBlockNumber();
    const fromBlock = latestBlock > scanWindow
      ? latestBlock - scanWindow
      : deployBlock;

    if (process.env.VERBOSE_LOGS) console.debug(`${tag} getClankerClaimLogs: scanning ${tokens.length} tokens, blocks ${fromBlock}..${latestBlock} (${latestBlock - fromBlock} blocks)`);

    const logs = await chunkedGetLogs(
      logsClient,
      tag,
      chunkSize,
      parallelChunks,
      throttleMs,
      {
        address: tokens,
        event: erc20TransferEvent,
        args: {
          from: feeLockerAddress,
          to: owner,
        },
        fromBlock,
        toBlock: latestBlock,
      }
    );

    for (const log of logs) {
      const token = log.address.toLowerCase();
      const value = (log.args.value as bigint) ?? 0n;
      claimMap.set(token, (claimMap.get(token) ?? 0n) + value);
    }

    if (process.env.VERBOSE_LOGS) console.debug(`${tag} getClankerClaimLogs: found ${claimMap.size} tokens with claims, ${logs.length} transfers in ${Date.now() - t0}ms`);
    return claimMap;
  };

  try {
    return await Promise.race([
      scan(),
      new Promise<Map<string, bigint>>((resolve) =>
        setTimeout(() => {
          log.warn(`${tag} getClankerClaimLogs: timed out after ${timeoutMs}ms`);
          resolve(new Map());
        }, timeoutMs)
      ),
    ]);
  } catch (err) {
    log.warn(`${tag} getClankerClaimLogs failed`, { error: err instanceof Error ? err.message : String(err) });
    return new Map();
  }
}
