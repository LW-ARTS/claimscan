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
  bagsRegisteredWallet?: string | null;
  fees: FeeRecord[];
  solPrice: number;
  onClaimComplete: (claimedMints: string[]) => void;
}

export function ClaimDialog({
  open,
  onOpenChange,
  wallet,
  bagsRegisteredWallet,
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

  const bagsWalletMismatch = bagsRegisteredWallet
    && connectedWallet
    && connectedWallet !== bagsRegisteredWallet;

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  const [balanceError, setBalanceError] = useState(false);

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

  const totalUnclaimedLamports = useMemo(() => {
    let total = 0n;
    for (const fee of fees) total += safeBigInt(fee.total_unclaimed);
    return total;
  }, [fees]);

  const feeLamports = totalUnclaimedLamports * BigInt(CLAIMSCAN_FEE_BPS) / 10_000n;
  const feeApplied = feeLamports >= MIN_FEE_LAMPORTS;
  const feeSol = Number(feeLamports * 1000n / 1_000_000_000n) / 1000;
  const feeUsd = feeSol * solPrice;

  const txCount = fees.length + (feeApplied ? 1 : 0);
  const estimatedGas = txCount * 0.00015;
  const hasInsufficientSol = solBalance !== null && solBalance < estimatedGas;

  const completeFiredRef = useRef(false);
  useEffect(() => {
    if (phase === 'fetching') {
      completeFiredRef.current = false;
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
      if (!window.confirm('A claim is in progress. Cancel it?')) return;
      cancel();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md border-white/[0.08] bg-[#0c0c0e]/95 backdrop-blur-xl shadow-2xl shadow-black/40">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-white/90">
            {phase === 'idle' && 'Claim Fees'}
            {phase === 'fetching' && 'Preparing Transactions...'}
            {phase === 'signing' && 'Sign Transactions'}
            {phase === 'submitting' && 'Submitting Transactions'}
            {phase === 'complete' && 'Claim Complete'}
          </DialogTitle>
          <DialogDescription className="text-xs text-white/40">
            {phase === 'idle' && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Bags.fm
                </span>
                <span className="mx-1.5 text-white/20">|</span>
                {fees.length} token{fees.length !== 1 ? 's' : ''} unclaimed
              </>
            )}
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

        <div className="space-y-3 pt-1">
          {/* ─── Preview state ─── */}
          {phase === 'idle' && (
            <>
              {/* Token list */}
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
                {fees.map((fee) => {
                  const unclaimed = safeBigInt(fee.total_unclaimed);
                  const usd = toUsdValue(unclaimed, 9, solPrice);
                  return (
                    <div
                      key={fee.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="font-mono text-xs text-white/70">
                        {fee.token_symbol
                          ? `$${fee.token_symbol.replace(/[^\w\s\-\.]/g, '').trim().slice(0, 16)}`
                          : fee.token_address.slice(0, 8) + '...'}
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs font-medium tabular-nums text-white/90">
                          {formatTokenAmount(fee.total_unclaimed, 9)} SOL
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-white/30">
                          {formatUsd(usd)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

              {/* Summary */}
              <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">Total unclaimed</span>
                  <span className="text-sm font-semibold tabular-nums text-white">
                    {formatUsd(totalUnclaimedUsd)}
                  </span>
                </div>
                {feeApplied && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">ClaimScan fee (0.85%)</span>
                    <span className="font-mono text-xs tabular-nums text-white/60">
                      {feeSol.toFixed(4)} SOL
                      <span className="ml-1 text-white/30">{formatUsd(feeUsd)}</span>
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">Estimated gas</span>
                  <span className="font-mono text-xs tabular-nums text-white/60">
                    ~{estimatedGas.toFixed(4)} SOL
                  </span>
                </div>
                {solBalance !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">Your balance</span>
                    <span className={`font-mono text-xs tabular-nums ${hasInsufficientSol ? 'text-red-400' : 'text-white/60'}`}>
                      {solBalance.toFixed(4)} SOL
                    </span>
                  </div>
                )}
              </div>

              {/* Alerts */}
              {hasInsufficientSol && (
                <Alert variant="error">
                  Insufficient SOL for gas fees. You need at least ~{estimatedGas.toFixed(4)} SOL.
                </Alert>
              )}

              {balanceError && (
                <Alert variant="warning">
                  Unable to check SOL balance. Ensure you have enough SOL for gas fees before claiming.
                </Alert>
              )}

              {bagsWalletMismatch && (
                <div className="space-y-2 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-4 py-3">
                  <p className="text-xs font-medium text-red-400/90">Wrong wallet connected</p>
                  <p className="text-[11px] leading-relaxed text-red-400/60">
                    Bags.fm requires the wallet linked to your social profile to claim fees.
                    Connect the wallet registered with Bags:
                  </p>
                  <p className="font-mono text-[10px] break-all text-red-400/40 select-all">
                    {bagsRegisteredWallet}
                  </p>
                  <p className="text-[11px] text-red-400/40">
                    To link a different wallet, verify your profile at bags.fm first.
                  </p>
                </div>
              )}

              {!bagsWalletMismatch && walletMismatch && (
                <Alert variant="warning">
                  Connected wallet differs from this profile. Claims will use your connected wallet.
                </Alert>
              )}

              {isMobile && (
                <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[11px] text-white/30">
                  You&apos;ll be redirected to your wallet app to sign. Return to this browser after signing.
                </p>
              )}

              {/* CTA */}
              <button
                onClick={handleClaim}
                disabled={phase !== 'idle' || hasInsufficientSol || !!bagsWalletMismatch}
                className="group relative w-full overflow-hidden rounded-xl bg-white px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-black transition-all duration-200 hover:shadow-[0_0_24px_rgba(255,255,255,0.08)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                  </svg>
                  Claim {fees.length} Token{fees.length !== 1 ? 's' : ''}
                </span>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </button>
            </>
          )}

          {/* ─── Fetching state ─── */}
          {phase === 'fetching' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
                <div className="absolute inset-1 animate-spin rounded-full border border-white/5 border-b-white/30" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              </div>
              <p className="text-xs text-white/40">Preparing claim transactions...</p>
            </div>
          )}

          {/* ─── Signing state ─── */}
          {phase === 'signing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 animate-ping rounded-full bg-white/5" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="h-6 w-6 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a48.667 48.667 0 0 0-6 0c0 1.97-.147 3.915-.43 5.824M7.5 10.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-white/40">Waiting for wallet approval...</p>
              <button
                onClick={cancel}
                className="rounded-lg border border-white/[0.06] px-4 py-1.5 text-[11px] text-white/30 transition-colors hover:border-white/10 hover:text-white/50"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ─── Submitting state ─── */}
          {phase === 'submitting' && (
            <div className="space-y-3">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-center text-[11px] text-white/30 tabular-nums">
                {processed} / {progress.total} tokens processed
              </p>

              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {results.map((r) => (
                  <div
                    key={r.claimAttemptId || r.tokenMint}
                    className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono text-[11px] text-white/40 truncate max-w-[120px]">
                      {r.tokenMint.slice(0, 8)}...
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>

              <button
                onClick={cancel}
                className="w-full rounded-lg border border-white/[0.06] py-2 text-[11px] text-white/30 transition-colors hover:border-white/10 hover:text-white/50"
              >
                Cancel Remaining
              </button>
            </div>
          )}

          {/* ─── Complete state ─── */}
          {phase === 'complete' && (
            <div className="space-y-3">
              {progress.completed > 0 && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] py-3">
                  <svg className="h-4 w-4 text-emerald-500/80" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-xs font-medium text-emerald-500/80">
                    {progress.completed} claim{progress.completed !== 1 ? 's' : ''} confirmed
                  </p>
                </div>
              )}

              {progress.failed > 0 && (
                <Alert variant="error">
                  {progress.failed} claim{progress.failed !== 1 ? 's' : ''} failed
                </Alert>
              )}

              {error && <Alert variant="error">{error}</Alert>}

              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {results.map((r) => (
                  <div
                    key={r.claimAttemptId || r.tokenMint}
                    className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono text-[11px] text-white/40 truncate max-w-[120px]">
                      {r.tokenMint.slice(0, 8)}...
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.txSignature && /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(r.txSignature) && (
                        <a
                          href={`https://solscan.io/tx/${r.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/20 transition-colors hover:text-white/50"
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
                className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition-all duration-200 hover:shadow-[0_0_20px_rgba(255,255,255,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
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

/* ─── Reusable sub-components ─── */

function Alert({ variant, children }: { variant: 'error' | 'warning'; children: React.ReactNode }) {
  const styles = {
    error: 'border-red-500/10 bg-red-500/[0.04] text-red-400/70',
    warning: 'border-amber-500/10 bg-amber-500/[0.04] text-amber-400/70',
  };
  return (
    <p className={`rounded-xl border px-4 py-2.5 text-[11px] leading-relaxed ${styles[variant]}`}>
      {children}
    </p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; className: string }> = {
    confirmed: { text: 'Confirmed', className: 'text-emerald-500/80' },
    failed: { text: 'Failed', className: 'text-red-400/70' },
    submitted: { text: 'Confirming...', className: 'text-amber-400/70' },
    pending: { text: 'Pending', className: 'text-white/20' },
  };
  const c = config[status] ?? config.pending;
  return <span className={`text-[11px] font-medium ${c.className}`}>{c.text}</span>;
}
