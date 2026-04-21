import 'server-only';
import { parseAbi } from 'viem';
import { baseClient } from './base';
import type { BaseAddress } from './types';
import {
  FLAUNCH_REVENUE_MANAGER,
  FLAUNCH_FEE_ESCROW,
  FLAUNCH_MEMESTREAM_NFT,
} from '@/lib/constants-evm';
import { createLogger } from '@/lib/logger';

const log = createLogger('flaunch-reads');

// Matches clanker-reads.ts:24 convention. Keeps multicall3 calldata under RPC
// size limits on wallets with hundreds of Takeover.fun coins.
const MULTICALL_BATCH_SIZE = 200;

// Minimum ratio of successful round-3 reads before we trust the historical
// earnings sum. Below this, the wallet result is marked degraded so the
// adapter can bail and keep the previous cached row in the DB instead of
// flapping the user-visible value to a lower number.
const MIN_SUCCESS_RATIO = 0.8;

const REVENUE_MANAGER_ABI = parseAbi([
  'function balances(address recipient) view returns (uint256)',
]);

const MEMESTREAM_NFT_ABI = parseAbi([
  'function tokenId(address token) view returns (uint256)',
  'function poolId(uint256 tokenId) view returns (bytes32)',
]);

const FEE_ESCROW_ABI = parseAbi([
  'function totalFeesAllocated(bytes32 poolId) view returns (uint256)',
]);

/**
 * Aggregated ETH-wei claimable for a wallet from RevenueManager (all PM versions).
 * Returns 0n on network error or when the signal is already aborted.
 */
export async function readFlaunchBalances(
  recipient: BaseAddress,
  signal?: AbortSignal,
): Promise<bigint> {
  if (signal?.aborted) return 0n;
  try {
    const value = await baseClient.readContract({
      address: FLAUNCH_REVENUE_MANAGER,
      abi: REVENUE_MANAGER_ABI,
      functionName: 'balances',
      args: [recipient],
    });
    return value as bigint;
  } catch (err) {
    log.warn('readFlaunchBalances_failed', {
      recipient: recipient.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return 0n;
  }
}

type MulticallSuccess<T> = { status: 'success'; result: T };
type MulticallFailure = { status: 'failure'; error?: { message?: string } };
type MulticallResult<T> = MulticallSuccess<T> | MulticallFailure;

/**
 * Chunk an array of contract calls and run them across multiple multicall3
 * invocations, concatenating the per-item results. allowFailure is always true
 * so a bad call only drops that item, never poisons the batch.
 */
async function chunkedMulticall<T, R>(
  items: T[],
  buildCall: (item: T) => {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  },
): Promise<Array<MulticallResult<R>>> {
  const out: Array<MulticallResult<R>> = [];
  for (let i = 0; i < items.length; i += MULTICALL_BATCH_SIZE) {
    const slice = items.slice(i, i + MULTICALL_BATCH_SIZE);
    const chunkResults = await baseClient.multicall({
      // Cast: buildCall produces MulticallContract-shaped objects; viem's
      // generic inference over a heterogeneous abi list is not worth the
      // complexity here — allowFailure preserves runtime safety.
      contracts: slice.map(buildCall) as never,
      allowFailure: true,
    });
    out.push(...(chunkResults as Array<MulticallResult<R>>));
  }
  return out;
}

/**
 * Per-coin historical earnings keyed by lowercase 0x token address.
 * The adapter uses this to emit one TokenFee row per coin instead of an
 * aggregated synthetic row.
 */
export type FlaunchPerCoinEarnings = Map<string, bigint>;

/**
 * Discriminated result for historical earnings reads so the adapter can bail
 * gracefully on partial RPC failure. `degraded` means enough round-3 calls
 * failed that the returned `perCoin` map is likely under-counted; callers
 * should prefer the previously-cached rows over emitting a flap.
 *
 * `total` is the sum of `perCoin` values, retained as a convenience so callers
 * that only need the aggregate (e.g., legacy fallback paths) don't have to
 * recompute it.
 */
export type FlaunchEarningsResult =
  | { kind: 'ok'; perCoin: FlaunchPerCoinEarnings; total: bigint }
  | { kind: 'degraded'; perCoin: FlaunchPerCoinEarnings; total: bigint; successRatio: number }
  | { kind: 'error' };

/**
 * Per-pool totalFeesAllocated for all given Takeover.fun token addresses.
 * Three multicall round-trips: tokenAddress → tokenId → poolId → totalFeesAllocated.
 * Each round is chunked at MULTICALL_BATCH_SIZE. The signal is checked between
 * rounds (viem 2.47 does not support per-call AbortSignal).
 *
 * The result preserves the per-pool breakdown so the adapter can emit
 * one row per coin. The summed `total` is provided for convenience.
 */
export async function readFlaunchHistoricalEarnings(
  tokenAddresses: BaseAddress[],
  signal?: AbortSignal,
): Promise<FlaunchEarningsResult> {
  if (tokenAddresses.length === 0) return { kind: 'ok', perCoin: new Map(), total: 0n };
  if (signal?.aborted) return { kind: 'error' };
  try {
    // Round 1: tokenId per address
    const round1 = await chunkedMulticall<BaseAddress, bigint>(
      tokenAddresses,
      (addr) => ({
        address: FLAUNCH_MEMESTREAM_NFT as `0x${string}`,
        abi: MEMESTREAM_NFT_ABI,
        functionName: 'tokenId' as const,
        args: [addr as `0x${string}`],
      }),
    );

    if (signal?.aborted) return { kind: 'error' };

    const tokenIds = round1.map((r) =>
      r.status === 'success' ? (r.result as bigint) : null,
    );

    // Filter out nulls AND zero token ids (unregistered tokens on some NFT
    // contracts return 0 instead of reverting — don't cascade pool 0 reads).
    const validByTokenId = tokenIds
      .map((tid, i) => ({ tid, addr: tokenAddresses[i] }))
      .filter((x): x is { tid: bigint; addr: BaseAddress } =>
        x.tid !== null && x.tid !== 0n,
      );

    if (validByTokenId.length === 0) return { kind: 'ok', perCoin: new Map(), total: 0n };

    // Round 2: poolId per tokenId
    const round2 = await chunkedMulticall<{ tid: bigint; addr: BaseAddress }, `0x${string}`>(
      validByTokenId,
      ({ tid }) => ({
        address: FLAUNCH_MEMESTREAM_NFT as `0x${string}`,
        abi: MEMESTREAM_NFT_ABI,
        functionName: 'poolId' as const,
        args: [tid],
      }),
    );

    if (signal?.aborted) return { kind: 'error' };

    const poolIds = round2.map((r) =>
      r.status === 'success' ? (r.result as `0x${string}`) : null,
    );

    const validByPoolId = poolIds
      .map((pid, i) => ({ pid, ...validByTokenId[i] }))
      .filter((x): x is { pid: `0x${string}`; tid: bigint; addr: BaseAddress } => x.pid !== null);

    if (validByPoolId.length === 0) return { kind: 'ok', perCoin: new Map(), total: 0n };

    // Round 3: totalFeesAllocated per poolId
    const round3 = await chunkedMulticall<{ pid: `0x${string}`; tid: bigint; addr: BaseAddress }, bigint>(
      validByPoolId,
      ({ pid }) => ({
        address: FLAUNCH_FEE_ESCROW as `0x${string}`,
        abi: FEE_ESCROW_ABI,
        functionName: 'totalFeesAllocated' as const,
        args: [pid],
      }),
    );

    // Build per-coin map keyed by lowercase token address. Failed reads are
    // dropped silently — they're factored into the success ratio below.
    const perCoin: FlaunchPerCoinEarnings = new Map();
    let total = 0n;
    let successCount = 0;
    for (let i = 0; i < round3.length; i++) {
      const r = round3[i];
      if (r.status === 'success') {
        const value = r.result as bigint;
        if (value > 0n) {
          perCoin.set(validByPoolId[i].addr.toLowerCase(), value);
        }
        total += value;
        successCount++;
      }
    }

    const successRatio = successCount / validByPoolId.length;

    if (successRatio < MIN_SUCCESS_RATIO) {
      return { kind: 'degraded', perCoin, total, successRatio };
    }

    return { kind: 'ok', perCoin, total };
  } catch (err) {
    log.warn('readFlaunchHistoricalEarnings_failed', {
      count: tokenAddresses.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'error' };
  }
}
