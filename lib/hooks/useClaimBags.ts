'use client';

import { useState, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  PublicKey,
} from '@solana/web3.js';
import { getBase58Encoder } from '@solana/codecs';
import {
  CLAIMSCAN_FEE_WALLET,
  MIN_FEE_LAMPORTS,
} from '@/lib/constants';

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

/** Known Bags.fm program IDs that are allowed in claim transactions. */
const BAGS_ALLOWED_PROGRAMS = new Set([
  '11111111111111111111111111111111',       // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
  'ComputeBudget111111111111111111111111111111', // Compute Budget
  'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', // Meteora DBC
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Meteora DAMM V2
  'FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi', // Bags Fee Share V1
  'FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK', // Bags Fee Share V2
  'Eq1EVs15EAWww1YtPTtWPzJRLPJoS6VYP9oW9SbNr3yp', // Bags Address Lookup Table
]);

/**
 * Validate that a deserialized Bags API transaction only invokes known programs
 * and that the fee payer is the connected wallet. Prevents malicious transactions
 * from a compromised Bags API.
 */
function validateBagsTx(tx: VersionedTransaction, walletPubkey: PublicKey): string | null {
  try {
    const message = tx.message;
    const accountKeys = message.staticAccountKeys;

    // Check fee payer (first account key) is the connected wallet
    if (!accountKeys[0]?.equals(walletPubkey)) {
      return 'Transaction fee payer does not match connected wallet';
    }

    // Determine total keys available (static + ALT-resolved)
    const totalStaticKeys = accountKeys.length;
    const altKeyCount = 'addressTableLookups' in message
      ? (message.addressTableLookups as Array<{ writableIndexes: number[]; readonlyIndexes: number[] }>)
          .reduce((sum, alt) => sum + alt.writableIndexes.length + alt.readonlyIndexes.length, 0)
      : 0;

    // Check all instruction program IDs are in the allowlist
    for (const ix of message.compiledInstructions) {
      // If programIdIndex points to an ALT-resolved key (not in static keys),
      // we cannot resolve it client-side without fetching the ALT account.
      // Reject to be safe — legitimate Bags txs use static keys for programs.
      if (ix.programIdIndex >= totalStaticKeys) {
        return `Program at index ${ix.programIdIndex} resolved via Address Lookup Table — cannot verify (${altKeyCount} ALT keys detected)`;
      }
      const programId = accountKeys[ix.programIdIndex]?.toBase58();
      if (!programId || !BAGS_ALLOWED_PROGRAMS.has(programId)) {
        return `Unknown program in transaction: ${programId?.slice(0, 12) ?? 'undefined'}...`;
      }
    }

    return null; // Valid
  } catch (err) {
    return err instanceof Error ? err.message : 'Transaction validation failed';
  }
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

/** Max mints per /api/claim/bags request (matches server-side limit). */
const API_BATCH_SIZE = 10;
/** Timeout for wallet signing prompts (mobile deep-link can hang). */
const SIGN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

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
      // 1. Fetch claim transactions from backend — chunk into API_BATCH_SIZE
      //    to fit each request within Vercel Hobby's 10s serverless limit.
      const allTransactions: Array<{
        tokenMint: string;
        claimAttemptId: string;
        confirmToken: string;
        txs: Array<{ tx: string; blockhash: { blockhash: string; lastValidBlockHeight: number } }>;
      }> = [];
      const allFailedMints: Array<{ tokenMint: string; error: string }> = [];
      let serverFeeLamports = 0n; // Accumulated from server responses

      for (let ci = 0; ci < tokenMints.length; ci += API_BATCH_SIZE) {
        if (controller.signal.aborted) return;
        const chunk = tokenMints.slice(ci, ci + API_BATCH_SIZE);

        const res = await fetch('/api/claim/bags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress, tokenMints: chunk }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Request failed' }));
          // If one batch fails, mark those mints as failed and continue
          for (const mint of chunk) {
            allFailedMints.push({ tokenMint: mint, error: errData.error || `HTTP ${res.status}` });
          }
          continue;
        }

        const batchData = await res.json() as {
          transactions: typeof allTransactions;
          feeLamports: string;
          failedMints: typeof allFailedMints;
        };
        allTransactions.push(...batchData.transactions);
        allFailedMints.push(...batchData.failedMints);
        if (batchData.feeLamports && /^\d+$/.test(batchData.feeLamports)) {
          serverFeeLamports += BigInt(batchData.feeLamports);
        }
      }

      if (controller.signal.aborted) return;

      // Build tx entries with confirmTokens
      const allTxEntries: TxEntry[] = allTransactions.flatMap((t) =>
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
        ...allTransactions.map((t) => ({
          tokenMint: t.tokenMint,
          claimAttemptId: t.claimAttemptId,
          status: 'pending' as const,
        })),
        ...allFailedMints.map((f) => ({
          tokenMint: f.tokenMint,
          claimAttemptId: '',
          status: 'failed' as const,
          error: f.error,
        })),
      ];
      setResults(claimResults);

      // Progress tracks tokens (same unit as results array)
      const totalTokens = allTransactions.length + allFailedMints.length;
      setProgress({ completed: 0, failed: allFailedMints.length, total: totalTokens });

      if (allTxEntries.length === 0) {
        setPhase('complete');
        return;
      }

      // 2. Build fee tx (if applicable) BEFORE signing so it can be included in the batch
      //    Fee amount is calculated SERVER-SIDE from fee_records — not client-controlled.
      let unsignedFeeTx: VersionedTransaction | null = null;
      let feeBlockhash: { blockhash: string; lastValidBlockHeight: number } | null = null;
      const feeLamports = serverFeeLamports;

      if (feeLamports >= MIN_FEE_LAMPORTS && allTxEntries.length > 0) {
        try {
          const latestBlockhash = await connection.getLatestBlockhash('confirmed');
          feeBlockhash = latestBlockhash;
          const feeInstruction = SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(CLAIMSCAN_FEE_WALLET),
            lamports: feeLamports,
          });
          const feeMessage = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [feeInstruction],
          }).compileToV0Message();
          unsignedFeeTx = new VersionedTransaction(feeMessage);
        } catch (feeErr) {
          console.warn('[useClaimBags] Fee tx build failed:', feeErr instanceof Error ? feeErr.message : feeErr);
        }
      }

      // 2b. Sign transactions in batches (fee tx bundled into last batch for single popup)
      setPhase('signing');
      const batchSize = getSignBatchSize();
      let signedFeeTx: VersionedTransaction | null = null;
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

        // Deserialize and validate with per-entry error handling
        const txsToSign: VersionedTransaction[] = [];
        const validBatch: TxEntry[] = [];
        for (const entry of batch) {
          try {
            const tx = deserializeBagsTx(entry.tx);
            // H1 fix: Validate tx only invokes known Bags programs and fee payer is user
            const validationErr = validateBagsTx(tx, publicKey);
            if (validationErr) throw new Error(validationErr);
            txsToSign.push(tx);
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

        const isLastBatch = i + batchSize >= allTxEntries.length;

        // If no valid claim txs in this batch but it's the last and we have a fee tx,
        // we still need to sign the fee tx (earlier batches may have confirmed claims)
        if (simValidTxs.length === 0 && !(isLastBatch && unsignedFeeTx)) continue;

        // Await signing status update BEFORE calling signAllTransactions
        if (simValidBatch.length > 0) {
          await Promise.allSettled(
            simValidBatch.map((entry) =>
              confirmClaimStatus(entry.claimAttemptId, walletAddress, entry.confirmToken, undefined, 'signing')
            )
          );
        }

        // Bundle fee tx into last batch for single wallet popup
        const txsForWallet = [...simValidTxs];
        if (isLastBatch && unsignedFeeTx) {
          txsForWallet.push(unsignedFeeTx);
        }

        if (txsForWallet.length === 0) continue;

        let signed: VersionedTransaction[];
        let signTimeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          const signPromise = signAllTransactions(txsForWallet);
          const timeoutPromise = new Promise<never>((_, reject) => {
            signTimeoutId = setTimeout(() => reject(new Error('Wallet signing timed out. Please try again.')), SIGN_TIMEOUT_MS);
          });
          try {
            signed = await Promise.race([signPromise, timeoutPromise]);
          } finally {
            clearTimeout(signTimeoutId);
          }
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
          // M2: Detect both rejection and wallet disconnect
          const isAbort = reason.includes('reject') || reason.includes('denied')
            || reason.includes('cancel') || reason.includes('disconnect')
            || reason.includes('timed out') || !publicKey;
          if (isAbort) {
            setError(reason.includes('timed out') ? 'Wallet signing timed out' : 'Wallet signing rejected');
            setPhase('complete');
            return;
          }
          continue;
        }

        // Verify wallet returned the same number of transactions
        if (signed.length !== txsForWallet.length) {
          await failEntries(simValidBatch, walletAddress, 'Wallet returned mismatched transaction count');
          continue;
        }

        // Extract the signed fee tx if it was included in this batch
        if (isLastBatch && unsignedFeeTx && signed.length > simValidTxs.length) {
          signedFeeTx = signed[signed.length - 1]; // fee tx is always last
          signed = signed.slice(0, -1); // remove fee tx from claim txs
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
      let failed = allFailedMints.length;
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
            // Remove from activeEntries so cancel() doesn't re-fail confirmed claims
            activeEntriesRef.current = activeEntriesRef.current.filter(
              (e) => e.claimAttemptId !== entry.claimAttemptId
            );
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
            activeEntriesRef.current = activeEntriesRef.current.filter(
              (e) => e.claimAttemptId !== entry.claimAttemptId
            );
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

      // 4. Submit fee tx ONLY if at least one claim confirmed
      if (signedFeeTx && feeBlockhash && completed > 0) {
        const FEE_MAX_RETRIES = 3;
        let feeSig: string | null = null;
        let activeFeeBlockhash = feeBlockhash;
        let activeFeeTx = signedFeeTx;

        // Check if the original blockhash is still valid before submitting.
        // If expired (common with hardware wallets), rebuild + re-sign with fresh blockhash.
        try {
          const currentHeight = await connection.getBlockHeight('confirmed');
          if (currentHeight > feeBlockhash.lastValidBlockHeight) {
            console.warn('[useClaimBags] Fee tx blockhash expired, rebuilding with fresh blockhash');
            const freshBlockhash = await connection.getLatestBlockhash('confirmed');
            const freshInstruction = SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: new PublicKey(CLAIMSCAN_FEE_WALLET),
              lamports: feeLamports,
            });
            const freshMessage = new TransactionMessage({
              payerKey: publicKey,
              recentBlockhash: freshBlockhash.blockhash,
              instructions: [freshInstruction],
            }).compileToV0Message();
            const freshTx = new VersionedTransaction(freshMessage);
            // Re-sign requires a second wallet popup (only for Ledger/slow signers)
            let reSignTimeout: ReturnType<typeof setTimeout> | undefined;
            const reSignPromise = signAllTransactions([freshTx]);
            const reSignTimeoutPromise = new Promise<never>((_, reject) => {
              reSignTimeout = setTimeout(() => reject(new Error('Fee re-sign timed out')), SIGN_TIMEOUT_MS);
            });
            try {
              const reSignResult = await Promise.race([reSignPromise, reSignTimeoutPromise]);
              const [reSigned] = reSignResult;
              activeFeeTx = reSigned;
              activeFeeBlockhash = freshBlockhash;
            } finally {
              clearTimeout(reSignTimeout);
            }
          }
        } catch (heightErr) {
          // If height check fails, try submitting with original blockhash anyway
          console.warn('[useClaimBags] Blockhash validity check failed, trying original:', heightErr instanceof Error ? heightErr.message : heightErr);
        }

        for (let attempt = 0; attempt < FEE_MAX_RETRIES; attempt++) {
          try {
            feeSig = await connection.sendRawTransaction(activeFeeTx.serialize(), {
              skipPreflight: false,
              maxRetries: 2,
            });
            break;
          } catch (feeErr) {
            console.warn(`[useClaimBags] Fee tx send attempt ${attempt + 1}/${FEE_MAX_RETRIES} failed:`, feeErr instanceof Error ? feeErr.message : feeErr);
            if (attempt < FEE_MAX_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
        }

        if (feeSig) {
          const solWhole = feeLamports / 1_000_000_000n;
          const solFrac = (feeLamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '') || '0';
          console.info(`[useClaimBags] Fee tx sent: ${feeSig} (${solWhole}.${solFrac} SOL)`);

          // Use the first confirmed claim's HMAC token to authenticate the fee log.
          // This prevents unauthorized fee injection from on-chain observers.
          const authEntry = allTransactions[0];
          fetch('/api/claim/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              feeTx: true,
              txSignature: feeSig,
              wallet: walletAddress,
              feeLamports: feeLamports.toString(),
              claimAttemptId: authEntry?.claimAttemptId,
              confirmToken: authEntry?.confirmToken,
            }),
          })
            .then((res) => {
              if (!res.ok) console.warn(`[useClaimBags] Fee log failed: HTTP ${res.status} (sig: ${feeSig})`);
            })
            .catch((err) => {
              console.warn('[useClaimBags] Fee log network error (sig:', feeSig, '):', err instanceof Error ? err.message : err);
            });

          connection.confirmTransaction(
            { signature: feeSig, ...activeFeeBlockhash },
            'confirmed'
          ).catch(() => {
            console.warn('[useClaimBags] Fee tx confirmation timed out (sig:', feeSig, ')');
          });
        }
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
