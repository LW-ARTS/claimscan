import 'server-only';
import { parseAbiItem } from 'viem';
import { bscClient, bscLogsClient } from './bsc';
import type { BscAddress } from './types';
import { FLAP_PORTAL_DEPLOY_BLOCK as FLAP_PORTAL_DEPLOY_BLOCK_CONST } from '@/lib/constants-evm';
import { createLogger } from '@/lib/logger';

const log = createLogger('flap-reads');

// ═══════════════════════════════════════════════
// Event ABI
//
// Source: BscScan-verified Portal implementation at
//   0x225894eAdeABBBA41ECdfd88a3eF88Aa0AF31D44 (Solidity 0.8.24, "Contract Source Code Verified (Exact Match)").
//
// CRITICAL: ZERO indexed parameters. The blueprint's speculative
// `(indexed token, indexed creator, indexed vault, bool isTaxToken, uint16 taxBps, string meta)`
// is WRONG and must not be used. topic0 is the only log-hash filter;
// `log.address === FLAP_PORTAL` is the primary spoof defense.
// ═══════════════════════════════════════════════

export const FLAP_TOKEN_CREATED_EVENT = parseAbiItem(
  'event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)',
);

// ═══════════════════════════════════════════════
// Decoded log shape
// ═══════════════════════════════════════════════

export interface FlapTokenCreatedLog {
  ts: bigint;
  creator: BscAddress;
  nonce: bigint;
  tokenAddress: BscAddress;
  name: string;
  symbol: string;
  meta: string;
  block: bigint;
  txHash: `0x${string}`;
}

// ═══════════════════════════════════════════════
// Runtime guard: prevents deploy with placeholder
//
// Call at the top of every cron run. Throws if deploy block is 0n — which
// would indicate the constants-evm.ts block slipped past code review with
// unresolved placeholders. FP-01 mandatory behavior.
// ═══════════════════════════════════════════════

export function assertDeployBlockNotPlaceholder(): void {
  // Widen to `bigint` via an explicitly-typed local so the comparison remains a
  // live runtime check. If we use the imported literal directly, TS narrows it
  // to `39_980_228n` and flags `=== 0n` as dead code — but a future refactor
  // that regenerates constants from a placeholder 0n must fail here before any
  // DB write. This guard MUST execute, not be optimised away.
  const FLAP_PORTAL_DEPLOY_BLOCK: bigint = FLAP_PORTAL_DEPLOY_BLOCK_CONST;
  if (FLAP_PORTAL_DEPLOY_BLOCK === 0n) {
    throw new Error(
      'FLAP_PORTAL_DEPLOY_BLOCK is placeholder (0n) — refusing to run indexer. ' +
        'Update lib/constants-evm.ts with the verified value from RESEARCH.md (39_980_228n).',
    );
  }
}

// ═══════════════════════════════════════════════
// scanTokenCreated
//
// Fetch + decode TokenCreated logs from the Portal over [fromBlock, toBlock].
// Viem's getLogs({ address }) filters at eth_getLogs level, but we also apply
// a post-decode equality check (belt-and-suspenders) to:
//   1. Guard against RPC-provider behavior changes that might weaken the address filter.
//   2. Guard against logs emerging from internal transactions / fallback paths.
//   3. Make spoof rejection testable in isolation (unit test feeds a forged log).
//
// TokenCreated emits ZERO indexed params — if log.address == attacker contract,
// an attacker could craft a correct topic0 and fake-encode any args, seeding
// garbage rows into our flap_tokens table. The address check is the ONLY
// spoof defense.
// ═══════════════════════════════════════════════

export async function scanTokenCreated(args: {
  portal: BscAddress;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<FlapTokenCreatedLog[]> {
  // Uses bscLogsClient (public BSC RPCs, 50K block range cap) over bscClient
  // (Alchemy free tier caps eth_getLogs at 10 blocks). Caller MUST keep
  // (toBlock - fromBlock) ≤ 50K. With Vercel Hobby's daily cron + BSC's
  // ~28K blocks/day, 50K windows give ~22K block headroom.
  const logs = await bscLogsClient.getLogs({
    address: args.portal,
    event: FLAP_TOKEN_CREATED_EVENT,
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
  });

  // Belt-and-suspenders spoof protection.
  for (const logEntry of logs) {
    if (logEntry.address.toLowerCase() !== args.portal.toLowerCase()) {
      throw new Error(
        `Spoofed TokenCreated log from ${logEntry.address} (expected ${args.portal})`,
      );
    }
  }

  return logs.map((logEntry) => ({
    ts: logEntry.args.ts!,
    creator: logEntry.args.creator! as BscAddress,
    nonce: logEntry.args.nonce!,
    tokenAddress: logEntry.args.token! as BscAddress,
    name: logEntry.args.name ?? '',
    symbol: logEntry.args.symbol ?? '',
    meta: logEntry.args.meta ?? '',
    block: logEntry.blockNumber!,
    txHash: logEntry.transactionHash!,
  }));
}

// ═══════════════════════════════════════════════
// batchVaultClaimable
//
// Read `claimable(user)` from many vaults in a single multicall batch.
// Callers (Plan 03 handler registry) pass their own ABI so this primitive
// doesn't take a dependency on vault-specific shapes.
//
// Uses allowFailure: true so a single unreachable / reverting vault returns
// { status: 'failure' } instead of tanking the whole batch (D-15).
// Chunk size 200 matches the flaunch-reads MULTICALL_BATCH_SIZE (lib/chains/flaunch-reads.ts L18-20).
// ═══════════════════════════════════════════════

const MULTICALL_BATCH_SIZE = 200;

export interface VaultClaimablePair {
  vault: BscAddress;
  user: BscAddress;
  abi: readonly unknown[];
}

export type MulticallClaimableResult =
  | { status: 'success'; result: bigint }
  | { status: 'failure'; error: Error };

// Structural type the cast recovers — matches flaunch-reads.ts L63-65 convention.
// Viem's heterogeneous multicall return doesn't infer over `as never` contracts,
// so we re-type the result after the call. `allowFailure: true` preserves runtime safety.
type MulticallSuccess<T> = { status: 'success'; result: T };
type MulticallFailure = { status: 'failure'; error?: { message?: string } };
type RawMulticallResult<T> = MulticallSuccess<T> | MulticallFailure;

export async function batchVaultClaimable(
  pairs: VaultClaimablePair[],
): Promise<MulticallClaimableResult[]> {
  if (pairs.length === 0) return [];

  const out: MulticallClaimableResult[] = [];
  for (let i = 0; i < pairs.length; i += MULTICALL_BATCH_SIZE) {
    const slice = pairs.slice(i, i + MULTICALL_BATCH_SIZE);
    const chunkRaw = await bscClient.multicall({
      contracts: slice.map((p) => ({
        address: p.vault as `0x${string}`,
        abi: p.abi,
        functionName: 'claimable',
        args: [p.user],
      })) as never,
      allowFailure: true,
    });
    const chunk = chunkRaw as Array<RawMulticallResult<bigint>>;
    for (const result of chunk) {
      if (result.status === 'success') {
        out.push({ status: 'success', result: result.result });
      } else {
        log.warn('batchVaultClaimable.failure', {
          vault: (slice[chunk.indexOf(result)]?.vault ?? '').slice(0, 10),
          error: result.error?.message ?? 'unknown',
        });
        out.push({
          status: 'failure',
          error: new Error(result.error?.message ?? 'unknown'),
        });
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════
// batchReadDecimals — D-10 locked decimals mechanism
//
// CONTEXT.md D-10 (L61): "Backfill script e cron escrevem `decimals` no mesmo
// upsert do `TokenCreated` (via `readDecimals()` multicall)."
//
// Batch-read ERC20 decimals for a list of tokens via multicall with
// allowFailure: true (per D-15). Returns an array parallel to the input:
//   - index i success → number (uint8 from ERC20.decimals())
//   - index i failure (non-standard token, no decimals() function, revert) → null
//
// Caller MUST fallback to 18 when result is null AND log a breadcrumb. Rationale:
// 99% of BSC ERC20 tokens use 18 decimals, but D-10 locks the mechanism "read from
// chain on first discovery" so the rare non-18 token displays correctly. Null
// fallback is defensive observability (logger.warn), not a hard fail.
//
// Consumers:
//   - Plan 04 cron (app/api/cron/index-flap/route.ts): read decimals after
//     vault classification, write `decimals: decimalsResults[i] ?? 18` into
//     flap_tokens upsert row.
//   - Plan 07 backfill (scripts/backfill-flap.ts): read decimals after Bitquery
//     parse, write `decimals: decimalsResults[i] ?? 18` into flap_tokens upsert row.
//
// Security note: return values are treated as untrusted. null → fallback to
// constant 18; any number → implicitly trusted but clamped by ERC20 spec (uint8).
// Attackers deploying a malicious decimals() that returns unexpected values
// can at worst mis-display their own token — no cross-token risk.
//
// Chunk size 200 matches MULTICALL_BATCH_SIZE above.
// ═══════════════════════════════════════════════

const ERC20_DECIMALS_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

export async function batchReadDecimals(
  tokens: readonly BscAddress[],
  opts?: { signal?: AbortSignal },
): Promise<(number | null)[]> {
  if (tokens.length === 0) return [];

  const out: (number | null)[] = [];
  for (let i = 0; i < tokens.length; i += MULTICALL_BATCH_SIZE) {
    if (opts?.signal?.aborted) break;
    const slice = tokens.slice(i, i + MULTICALL_BATCH_SIZE);
    const chunkRaw = await bscClient.multicall({
      contracts: slice.map((token) => ({
        address: token as `0x${string}`,
        abi: ERC20_DECIMALS_ABI,
        functionName: 'decimals',
      })) as never,
      allowFailure: true,
    });
    const chunk = chunkRaw as Array<RawMulticallResult<number | bigint>>;
    for (const result of chunk) {
      if (result.status === 'success') {
        out.push(Number(result.result));
      } else {
        out.push(null);
      }
    }
  }
  return out;
}
