'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useClaimBags } from '@/lib/hooks/useClaimBags';
import { formatTokenAmount, formatUsd, safeBigInt, toUsdValue } from '@/lib/utils';
import { CLAIMSCAN_FEE_BPS, MIN_FEE_LAMPORTS } from '@/lib/constants';
import type { Database } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

interface ClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: string;
  fees: FeeRecord[];
  solPrice: number;
  onClaimComplete: (claimedMints: string[]) => void;
}

export function ClaimDialog({
  open,
  onOpenChange,
  wallet,
  fees,
  solPrice,
  onClaimComplete,
}: ClaimDialogProps) {
  const { connection } = useConnection();
  const walletAdapter = useWallet();
  const { execute, cancel, phase, progress, results, error } = useClaimBags();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const tokenMints = useMemo(() => fees.map((f) => f.token_address), [fees]);
  const connectedWallet = walletAdapter.publicKey?.toBase58() ?? null;
  const walletMismatch = connectedWallet !== null && connectedWallet !== wallet;

  // Detect mobile on mount (avoids SSR mismatch)
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  const [balanceError, setBalanceError] = useState(false);

  // Fetch SOL balance for gas check — use CONNECTED wallet, not profile wallet
  useEffect(() => {
    if (!open || !connectedWallet) return;
    let cancelled = false;
    setBalanceError(false);
    connection
      .getBalance(new PublicKey(connectedWallet))
      .then((bal) => { if (!cancelled) setSolBalance(bal / 1e9); })
      .catch(() => {
        if (cancelled) return;
        setSolBalance(null);
        setBalanceError(true);
      });
    return () => { cancelled = true; };
  }, [open, connectedWallet, connection]);

  // Total unclaimed in USD
  const totalUnclaimedUsd = useMemo(() => {
    let total = 0;
    for (const fee of fees) {
      const amount = safeBigInt(fee.total_unclaimed);
      if (amount > 0n) {
        total += toUsdValue(amount, 9, solPrice);
      }
    }
    return total;
  }, [fees, solPrice]);

  // Total unclaimed in lamports (for fee calculation)
  const totalUnclaimedLamports = useMemo(() => {
    let total = 0n;
    for (const fee of fees) total += safeBigInt(fee.total_unclaimed);
    return total;
  }, [fees]);

  // ClaimScan service fee (0.85%)
  const feeLamports = totalUnclaimedLamports * BigInt(CLAIMSCAN_FEE_BPS) / 10_000n;
  const feeApplied = feeLamports >= MIN_FEE_LAMPORTS;
  const feeSol = Number(feeLamports) / 1e9;
  const feeUsd = feeSol * solPrice;

  // Estimated gas (~0.005 SOL per tx + fee tx if applicable)
  const estimatedGas = (fees.length + (feeApplied ? 1 : 0)) * 0.005;
  const hasInsufficientSol = solBalance !== null && solBalance < estimatedGas;

  // Trigger onClaimComplete exactly once when claim finishes
  const completeFiredRef = useRef(false);
  useEffect(() => {
    if (phase === 'fetching') {
      completeFiredRef.current = false; // Reset at start of new claim session
    }
    if (phase === 'complete' && !completeFiredRef.current) {
      completeFiredRef.current = true;
      const confirmed = results
        .filter((r) => r.status === 'confirmed')
        .map((r) => r.tokenMint);
      if (confirmed.length > 0) {
        onClaimComplete(confirmed);
      }
    }
  }, [phase, results, onClaimComplete]);

  const processed = results.filter((r) => r.status !== 'pending').length;
  const progressPercent = progress.total > 0
    ? Math.round((processed / progress.total) * 100)
    : 0;

  const handleClaim = () => {
    execute(tokenMints);
  };

  const handleClose = () => {
    if (phase === 'fetching' || phase === 'signing' || phase === 'submitting') {
      cancel();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {phase === 'idle' && 'Claim Fees'}
            {phase === 'fetching' && 'Preparing Transactions...'}
            {phase === 'signing' && 'Sign Transactions'}
            {phase === 'submitting' && 'Submitting Transactions'}
            {phase === 'complete' && 'Claim Complete'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {phase === 'idle' && `Claim unclaimed fees from ${fees.length} token${fees.length !== 1 ? 's' : ''} on Bags.fm`}
            {phase === 'fetching' && 'Generating claim transactions from Bags...'}
            {phase === 'signing' && 'Please approve the transaction(s) in your wallet.'}
            {phase === 'submitting' && 'Confirming transactions on Solana...'}
            {phase === 'complete' && (
              progress.completed > 0
                ? `${progress.completed} of ${progress.total} claim${progress.completed !== 1 ? 's' : ''} confirmed.`
                : 'No claims were successful.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Preview state */}
          {phase === 'idle' && (
            <>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {fees.map((fee) => {
                  const unclaimed = safeBigInt(fee.total_unclaimed);
                  const usd = toUsdValue(unclaimed, 9, solPrice);
                  return (
                    <div
                      key={fee.id}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <span className="font-mono text-sm">
                        {fee.token_symbol
                          ? `$${fee.token_symbol.replace(/[^\w\s\-\.]/g, '').trim().slice(0, 20)}`
                          : fee.token_address.slice(0, 8) + '...'}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-medium tabular-nums">
                          {formatTokenAmount(fee.total_unclaimed, 9)} SOL
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                          {formatUsd(usd)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total unclaimed</span>
                  <span className="font-semibold">{formatUsd(totalUnclaimedUsd)}</span>
                </div>
                {feeApplied && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ClaimScan fee (0.85%)</span>
                    <span className="font-mono tabular-nums">
                      {feeSol.toFixed(4)} SOL
                      <span className="ml-1 text-muted-foreground/60">{formatUsd(feeUsd)}</span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated gas</span>
                  <span className="font-mono tabular-nums">~{estimatedGas.toFixed(4)} SOL</span>
                </div>
                {solBalance !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your SOL balance</span>
                    <span className={`font-mono tabular-nums ${hasInsufficientSol ? 'text-red-400' : ''}`}>
                      {solBalance.toFixed(4)} SOL
                    </span>
                  </div>
                )}
              </div>

              {hasInsufficientSol && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  Insufficient SOL for gas fees. You need at least ~{estimatedGas.toFixed(4)} SOL.
                </p>
              )}

              {balanceError && (
                <p className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                  Unable to check SOL balance. Ensure you have enough SOL for gas fees before claiming.
                </p>
              )}

              {walletMismatch && (
                <p className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                  Connected wallet differs from this profile. Claims will use your connected wallet.
                </p>
              )}

              {isMobile && (
                <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  You&apos;ll be redirected to your wallet app to sign. Return to this browser after signing.
                </p>
              )}

              <button
                onClick={handleClaim}
                disabled={phase !== 'idle' || hasInsufficientSol}
                className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Claim {fees.length} Token{fees.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {/* Fetching state */}
          {phase === 'fetching' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <p className="text-sm text-muted-foreground">Preparing claim transactions...</p>
            </div>
          )}

          {/* Signing state */}
          {phase === 'signing' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <p className="text-sm text-muted-foreground">
                Waiting for wallet approval...
              </p>
              <button
                onClick={cancel}
                className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Submitting state */}
          {phase === 'submitting' && (
            <div className="space-y-3">
              <Progress value={progressPercent} className="h-2" />
              <p className="text-center text-xs text-muted-foreground tabular-nums">
                {results.filter((r) => r.status !== 'pending').length} / {progress.total} tokens processed
              </p>

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <div
                    key={r.claimAttemptId || r.tokenMint}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono truncate max-w-[120px]">
                      {r.tokenMint.slice(0, 8)}...
                    </span>
                    <span className={
                      r.status === 'confirmed' ? 'text-emerald-500 font-medium' :
                      r.status === 'failed' ? 'text-red-400' :
                      r.status === 'submitted' ? 'text-yellow-500' :
                      'text-muted-foreground'
                    }>
                      {r.status === 'confirmed' && 'Confirmed'}
                      {r.status === 'failed' && 'Failed'}
                      {r.status === 'submitted' && 'Confirming...'}
                      {r.status === 'pending' && 'Pending'}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={cancel}
                className="w-full rounded-lg border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel Remaining
              </button>
            </div>
          )}

          {/* Complete state */}
          {phase === 'complete' && (
            <div className="space-y-3">
              {progress.completed > 0 && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center">
                  <p className="text-sm font-medium text-emerald-500">
                    {progress.completed} claim{progress.completed !== 1 ? 's' : ''} confirmed
                  </p>
                </div>
              )}

              {progress.failed > 0 && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center">
                  <p className="text-xs text-red-400">
                    {progress.failed} claim{progress.failed !== 1 ? 's' : ''} failed
                  </p>
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <div
                    key={r.claimAttemptId || r.tokenMint}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono truncate max-w-[120px]">
                      {r.tokenMint.slice(0, 8)}...
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={
                        r.status === 'confirmed' ? 'text-emerald-500 font-medium' :
                        'text-red-400'
                      }>
                        {r.status === 'confirmed' ? 'Confirmed' : 'Failed'}
                      </span>
                      {r.txSignature && /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(r.txSignature) && (
                        <a
                          href={`https://solscan.io/tx/${r.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onOpenChange(false)}
                className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
