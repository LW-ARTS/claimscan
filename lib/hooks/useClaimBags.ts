'use client';

import { useState, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { getBase58Encoder } from '@solana/codecs';

/**
 * Deserialize a Bags API transaction string into a VersionedTransaction.
 * Handles both base58 (observed in v3) and base64 (documented in v2) formats.
 * Detection: base64 contains +, /, or = which are invalid in base58.
 */
function deserializeBagsTx(txString: string): VersionedTransaction {
  const isBase64 = /[+/=]/.test(txString);
  const bytes = isBase64
    ? new Uint8Array(Buffer.from(txString, 'base64'))
    : new Uint8Array(getBase58Encoder().encode(txString));
  return VersionedTransaction.deserialize(bytes);
}

export type ClaimPhase = 'idle' | 'fetching' | 'signing' | 'submitting' | 'complete';

export interface ClaimResult {
  tokenMint: string;
  claimAttemptId: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  txSignature?: string;
  error?: string;
}

interface UseClaimBagsReturn {
  execute: (tokenMints: string[]) => Promise<void>;
  cancel: () => void;
  phase: ClaimPhase;
  progress: { completed: number; failed: number; total: number };
  results: ClaimResult[];
  error: string | null;
}

const SIGN_BATCH_SIZE_MOBILE = 5;
const SIGN_BATCH_SIZE_DESKTOP = 10;

function getSignBatchSize(): number {
  return typeof window !== 'undefined' && window.innerWidth < 768
    ? SIGN_BATCH_SIZE_MOBILE
    : SIGN_BATCH_SIZE_DESKTOP;
}

interface TxEntry {
  tx: string;
  blockhash: { blockhash: string; lastValidBlockHeight: number };
  tokenMint: string;
  claimAttemptId: string;
  confirmToken: string;
}

type ClaimStatus = 'signing' | 'submitted' | 'confirmed' | 'failed' | 'expired';

async function confirmClaimStatus(
  claimAttemptId: string,
  wallet: string,
  confirmToken: string,
  txSignature: string | undefined,
  status: ClaimStatus,
  errorReason?: string
): Promise<void> {
  try {
    const body: Record<string, unknown> = { claimAttemptId, wallet, confirmToken, status };
    if (txSignature) body.txSignature = txSignature;
    if (errorReason) body.errorReason = errorReason;
    const res = await fetch('/api/claim/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[useClaimBags] confirm rejected: HTTP ${res.status} for ${status}`, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('[useClaimBags] confirm network error:', err instanceof Error ? err.message : err);
  }
}

/** Mark all entries as failed in the DB. Fires in parallel for speed. Best-effort. */
async function failEntries(entries: TxEntry[], wallet: string, reason: string): Promise<void> {
  const seen = new Set<string>();
  const promises: Promise<void>[] = [];
  for (const entry of entries) {
    if (seen.has(entry.claimAttemptId)) continue;
    seen.add(entry.claimAttemptId);
    promises.push(confirmClaimStatus(entry.claimAttemptId, wallet, entry.confirmToken, undefined, 'failed', reason));
  }
  await Promise.allSettled(promises);
}

export function useClaimBags(): UseClaimBagsReturn {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const [phase, setPhase] = useState<ClaimPhase>('idle');
  const [progress, setProgress] = useState({ completed: 0, failed: 0, total: 0 });
  const [results, setResults] = useState<ClaimResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeEntriesRef = useRef<TxEntry[]>([]);
  const walletRef = useRef<string>('');

  // Guarded state setters — skip updates if the operation was aborted (dialog closed mid-flight)
  const safeSetResults = useCallback((updater: (prev: ClaimResult[]) => ClaimResult[]) => {
    if (!abortRef.current?.signal.aborted) setResults(updater);
  }, []);
  const safeSetProgress = useCallback((val: { completed: number; failed: number; total: number }) => {
    if (!abortRef.current?.signal.aborted) setProgress(val);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    // Mark all remaining active entries as failed in DB (parallel, non-blocking)
    const entries = activeEntriesRef.current;
    const wallet = walletRef.current;
    activeEntriesRef.current = [];
    walletRef.current = '';
    if (entries.length > 0 && wallet) {
      failEntries(entries, wallet, 'Cancelled by user');
    }
    setPhase('idle');
    setError('Claim cancelled');
  }, []);

  const execute = useCallback(async (tokenMints: string[]) => {
    if (!publicKey || !signAllTransactions) {
      setError('Wallet not connected');
      return;
    }

    const walletAddress = publicKey.toBase58();
    walletRef.current = walletAddress;
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('fetching');
    setError(null);
    setResults([]);
    setProgress({ completed: 0, failed: 0, total: 0 });
    activeEntriesRef.current = [];

    try {
      // 1. Fetch claim transactions from backend
      const res = await fetch('/api/claim/bags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, tokenMints }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        transactions: Array<{
          tokenMint: string;
          claimAttemptId: string;
          confirmToken: string;
          txs: Array<{ tx: string; blockhash: { blockhash: string; lastValidBlockHeight: number } }>;
        }>;
        failedMints: Array<{ tokenMint: string; error: string }>;
      };

      if (controller.signal.aborted) return;

      // Build tx entries with confirmTokens
      const allTxEntries: TxEntry[] = data.transactions.flatMap((t) =>
        t.txs.map((tx) => ({
          ...tx,
          tokenMint: t.tokenMint,
          claimAttemptId: t.claimAttemptId,
          confirmToken: t.confirmToken,
        }))
      );
      activeEntriesRef.current = allTxEntries;

      // Initialize results — one per token (not per tx)
      const claimResults: ClaimResult[] = [
        ...data.transactions.map((t) => ({
          tokenMint: t.tokenMint,
          claimAttemptId: t.claimAttemptId,
          status: 'pending' as const,
        })),
        ...data.failedMints.map((f) => ({
          tokenMint: f.tokenMint,
          claimAttemptId: '',
          status: 'failed' as const,
          error: f.error,
        })),
      ];
      setResults(claimResults);

      // Progress tracks tokens (same unit as results array)
      const totalTokens = data.transactions.length + data.failedMints.length;
      setProgress({ completed: 0, failed: data.failedMints.length, total: totalTokens });

      if (allTxEntries.length === 0) {
        setPhase('complete');
        return;
      }

      // 2. Sign transactions in batches
      setPhase('signing');
      const batchSize = getSignBatchSize();
      const signedTxs: Array<{
        signed: VersionedTransaction;
        tokenMint: string;
        claimAttemptId: string;
        confirmToken: string;
        blockhash: { blockhash: string; lastValidBlockHeight: number };
      }> = [];

      for (let i = 0; i < allTxEntries.length; i += batchSize) {
        if (controller.signal.aborted) return;

        const batch = allTxEntries.slice(i, i + batchSize);

        // Deserialize with per-entry error handling
        const txsToSign: VersionedTransaction[] = [];
        const validBatch: TxEntry[] = [];
        for (const entry of batch) {
          try {
            txsToSign.push(deserializeBagsTx(entry.tx));
            validBatch.push(entry);
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'Invalid transaction data';
            await confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, undefined, 'failed', reason);
            safeSetResults((prev) =>
              prev.map((r) =>
                r.claimAttemptId === entry.claimAttemptId
                  ? { ...r, status: 'failed' as const, error: reason }
                  : r
              )
            );
          }
        }

        if (txsToSign.length === 0) continue;

        // Simulate transactions BEFORE presenting to wallet for signing.
        // Catches failures early (insufficient funds, pool migrated, malformed tx)
        // and prevents the user from signing txs that will fail on-chain.
        const simResults = await Promise.allSettled(
          txsToSign.map((tx) => connection.simulateTransaction(tx, { sigVerify: false }))
        );

        const simValidTxs: VersionedTransaction[] = [];
        const simValidBatch: TxEntry[] = [];
        for (let si = 0; si < simResults.length; si++) {
          const simResult = simResults[si];
          if (simResult.status === 'rejected' || simResult.value.value.err) {
            const simErr = simResult.status === 'rejected'
              ? (simResult.reason instanceof Error ? simResult.reason.message : 'Simulation failed')
              : `Simulation failed: ${JSON.stringify(simResult.value.value.err)}`;
            await confirmClaimStatus(validBatch[si].claimAttemptId, walletAddress, validBatch[si].confirmToken, undefined, 'failed', simErr);
            // Remove from activeEntries so cancel() doesn't re-fail already-failed entries
            activeEntriesRef.current = activeEntriesRef.current.filter(
              (e) => e.claimAttemptId !== validBatch[si].claimAttemptId
            );
            safeSetResults((prev) =>
              prev.map((r) =>
                r.claimAttemptId === validBatch[si].claimAttemptId
                  ? { ...r, status: 'failed' as const, error: simErr }
                  : r
              )
            );
          } else {
            simValidTxs.push(txsToSign[si]);
            simValidBatch.push(validBatch[si]);
          }
        }

        if (simValidTxs.length === 0) continue;

        // Await signing status update BEFORE calling signAllTransactions
        // to prevent race condition where 'submitted' arrives before 'signing'
        await Promise.allSettled(
          simValidBatch.map((entry) =>
            confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, undefined, 'signing')
          )
        );

        let signed: VersionedTransaction[];
        try {
          signed = await signAllTransactions(simValidTxs);
        } catch (signErr) {
          const reason = signErr instanceof Error ? signErr.message : 'Wallet signing failed';
          await failEntries(simValidBatch, walletAddress, reason);
          for (const entry of simValidBatch) {
            safeSetResults((prev) =>
              prev.map((r) =>
                r.claimAttemptId === entry.claimAttemptId
                  ? { ...r, status: 'failed' as const, error: reason }
                  : r
              )
            );
          }
          if (reason.includes('reject') || reason.includes('denied') || reason.includes('cancel')) {
            setError('Wallet signing rejected');
            setPhase('complete');
            return;
          }
          continue;
        }

        // Verify wallet returned the same number of transactions
        if (signed.length !== simValidTxs.length) {
          await failEntries(simValidBatch, walletAddress, 'Wallet returned mismatched transaction count');
          continue;
        }

        for (let j = 0; j < signed.length; j++) {
          signedTxs.push({
            signed: signed[j],
            tokenMint: simValidBatch[j].tokenMint,
            claimAttemptId: simValidBatch[j].claimAttemptId,
            confirmToken: simValidBatch[j].confirmToken,
            blockhash: simValidBatch[j].blockhash,
          });
        }
      }

      if (controller.signal.aborted) return;

      // 3. Submit all transactions in parallel, then confirm in parallel
      setPhase('submitting');
      let completed = 0;
      let failed = data.failedMints.length;
      const totalCount = totalTokens;

      // Phase 3a: Send signed txs to RPC in chunks of RPC_CONCURRENCY
      // to avoid overwhelming the RPC provider with unbounded connections
      const RPC_CONCURRENCY = 5;
      const submitted: Array<{
        sig: string;
        claimAttemptId: string;
        confirmToken: string;
        blockhash: { blockhash: string; lastValidBlockHeight: number };
      }> = [];

      for (let ci = 0; ci < signedTxs.length; ci += RPC_CONCURRENCY) {
        if (controller.signal.aborted) break;
        const chunk = signedTxs.slice(ci, ci + RPC_CONCURRENCY);
        await Promise.allSettled(
          chunk.map(async (entry) => {
            if (controller.signal.aborted) return;
            try {
              const rawTx = entry.signed.serialize();
              const sig = await connection.sendRawTransaction(rawTx, {
                skipPreflight: false,
                maxRetries: 2,
              });
              await confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, sig, 'submitted');
              safeSetResults((prev) =>
                prev.map((r) =>
                  r.claimAttemptId === entry.claimAttemptId
                    ? { ...r, status: 'submitted' as const, txSignature: sig }
                    : r
                )
              );
              submitted.push({
                sig,
                claimAttemptId: entry.claimAttemptId,
                confirmToken: entry.confirmToken,
                blockhash: entry.blockhash,
              });
              safeSetProgress({ completed, failed, total: totalCount });
            } catch (sendErr) {
              failed++;
              const reason = sendErr instanceof Error ? sendErr.message : 'Send failed';
              await confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, undefined, 'failed', reason);
              safeSetResults((prev) =>
                prev.map((r) =>
                  r.claimAttemptId === entry.claimAttemptId
                    ? { ...r, status: 'failed' as const, error: reason }
                    : r
                )
              );
              safeSetProgress({ completed, failed, total: totalCount });
            }
          })
        );
      }

      // Phase 3b: Confirm submitted txs in chunks of RPC_CONCURRENCY
      for (let ci = 0; ci < submitted.length; ci += RPC_CONCURRENCY) {
        if (controller.signal.aborted) break;
        const chunk = submitted.slice(ci, ci + RPC_CONCURRENCY);
        await Promise.allSettled(
          chunk.map(async (entry) => {
          if (controller.signal.aborted) return;
          try {
            const confirmation = await connection.confirmTransaction(
              {
                signature: entry.sig,
                blockhash: entry.blockhash.blockhash,
                lastValidBlockHeight: entry.blockhash.lastValidBlockHeight,
              },
              'confirmed'
            );
            if (confirmation.value.err) {
              throw new Error('Transaction failed on-chain');
            }
            completed++;
            await confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, entry.sig, 'confirmed');
            safeSetResults((prev) =>
              prev.map((r) =>
                r.claimAttemptId === entry.claimAttemptId
                  ? { ...r, status: 'confirmed' as const }
                  : r
              )
            );
          } catch (confirmErr) {
            failed++;
            const reason = confirmErr instanceof Error ? confirmErr.message : 'Confirmation failed';
            await confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, entry.sig, 'failed', reason);
            safeSetResults((prev) =>
              prev.map((r) =>
                r.claimAttemptId === entry.claimAttemptId
                  ? { ...r, status: 'failed' as const, error: reason }
                  : r
              )
            );
          }
          safeSetProgress({ completed, failed, total: totalCount });
        })
        );
      }

      // Recalculate from results to include all failure paths (simulation, send, confirm)
      setPhase('complete');
      setResults((prev) => {
        const finalCompleted = prev.filter((r) => r.status === 'confirmed').length;
        const finalFailed = prev.filter((r) => r.status === 'failed').length;
        safeSetProgress({ completed: finalCompleted, failed: finalFailed, total: totalCount });
        return prev;
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Claim failed';
      setError(message);
      setPhase('complete');
    } finally {
      activeEntriesRef.current = [];
      walletRef.current = '';
    }
  }, [publicKey, signAllTransactions, connection]);

  return { execute, cancel, phase, progress, results, error };
}
