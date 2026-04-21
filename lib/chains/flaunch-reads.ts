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
 * Discriminated result for historical earnings reads so the adapter can bail
 * gracefully on partial RPC failure. `degraded` means enough round-3 calls
 * failed that the returned `total` is likely under-counted; callers should
 * prefer the previously-cached row over emitting a flap.
 */
export type FlaunchEarningsResult =
  | { kind: 'ok'; total: bigint }
  | { kind: 'degraded'; total: bigint; successRatio: number }
  | { kind: 'error' };

/**
 * Sum of totalFeesAllocated across all given Takeover.fun token addresses.
 * Three multicall round-trips: tokenAddress → tokenId → poolId → totalFeesAllocated.
 * Each round is chunked at MULTICALL_BATCH_SIZE. The signal is checked between
 * rounds (viem 2.47 does not support per-call AbortSignal).
 */
export async function readFlaunchHistoricalEarnings(
  tokenAddresses: BaseAddress[],
  signal?: AbortSignal,
): Promise<FlaunchEarningsResult> {
  if (tokenAddresses.length === 0) return { kind: 'ok', total: 0n };
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

    if (validByTokenId.length === 0) return { kind: 'ok', total: 0n };

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

    if (validByPoolId.length === 0) return { kind: 'ok', total: 0n };

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

    const total = round3.reduce((sum, r) => {
      return r.status === 'success' ? sum + (r.result as bigint) : sum;
    }, 0n);

    const round3Success = round3.filter((r) => r.status === 'success').length;
    const successRatio = round3Success / validByPoolId.length;

    if (successRatio < MIN_SUCCESS_RATIO) {
      return { kind: 'degraded', total, successRatio };
    }

    return { kind: 'ok', total };
  } catch (err) {
    log.warn('readFlaunchHistoricalEarnings_failed', {
      count: tokenAddresses.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'error' };
  }
}
