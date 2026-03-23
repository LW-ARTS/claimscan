'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { track } from '@vercel/analytics';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useClaimBags } from '@/lib/hooks/useClaimBags';
import { formatTokenAmount, formatUsd, safeBigInt, toUsdValue } from '@/lib/utils';
import { CLAIMSCAN_FEE_BPS, MIN_FEE_LAMPORTS } from '@/lib/constants';
import type { Database } from '@/lib/supabase/types';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

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
  const walletAdapter = useWallet();
  const { execute, cancel, phase, progress, results, error } = useClaimBags();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  const tokenMints = useMemo(() => fees.map((f) => f.token_address), [fees]);
  const connectedWallet = walletAdapter.publicKey?.toBase58() ?? null;
  const walletMismatch = connectedWallet !== null && connectedWallet !== wallet;

  const bagsWalletMismatch = bagsRegisteredWallet
    && connectedWallet
    && connectedWallet !== bagsRegisteredWallet;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    function onChange(e: MediaQueryListEvent) { setIsMobile(e.matches); }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Turnstile invisible widget — renders when dialog opens, generates token automatically
  useEffect(() => {
    if (!open || !TURNSTILE_SITE_KEY || !turnstileRef.current) return;
    setTurnstileToken(null);

    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.appendChild(script);
    }

    function renderWidget() {
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void } };
      if (!w.turnstile || !turnstileRef.current) return;
      // Clear previous widget instance safely
      while (turnstileRef.current.firstChild) {
        turnstileRef.current.removeChild(turnstileRef.current.firstChild);
      }
      w.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(null),
        theme: 'light',
        size: 'invisible',
      });
    }

    const interval = setInterval(() => {
      const w = window as unknown as { turnstile?: unknown };
      if (w.turnstile) {
        clearInterval(interval);
        renderWidget();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [open]);

  const [balanceError, setBalanceError] = useState(false);

  useEffect(() => {
    if (!open || !connectedWallet) return;
    let cancelled = false;
    setBalanceError(false);
    // Use server-side RPC (has Helius key) instead of client-side public RPC
    fetch(`/api/balance?wallet=${encodeURIComponent(connectedWallet)}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`${res.status}`)))
      .then((data: { sol: number }) => { if (!cancelled) setSolBalance(data.sol); })
      .catch(() => {
        if (cancelled) return;
        setSolBalance(null);
        setBalanceError(true);
      });
    return () => { cancelled = true; };
  }, [open, connectedWallet]);

  const totalUnclaimedUsd = useMemo(() => {
    let total = 0;
    for (const fee of fees) {
      const amount = safeBigInt(fee.total_unclaimed);
      if (amount > 0n) total += toUsdValue(amount, 9, solPrice);
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
    if (phase === 'fetching') completeFiredRef.current = false;
    if (phase === 'complete' && !completeFiredRef.current) {
      completeFiredRef.current = true;
      const confirmed = results.filter((r) => r.status === 'confirmed').map((r) => r.tokenMint);
      const failed = results.filter((r) => r.status === 'failed').length;
      track('claim_completed', {
        platform: 'bags',
        success: confirmed.length > 0,
        confirmed_count: confirmed.length,
        failed_count: failed,
        total_count: results.length,
      });
      if (confirmed.length > 0) onClaimComplete(confirmed);
    }
  }, [phase, results, onClaimComplete]);

  const processed = results.filter((r) => r.status !== 'pending').length;
  const progressPercent = progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0;

  const handleClaim = () => {
    track('claim_initiated', {
      platform: 'bags',
      token_count: fees.length,
      total_unclaimed_usd: Math.round(totalUnclaimedUsd * 100) / 100,
    });
    execute(tokenMints, turnstileToken ?? undefined);
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
      <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[480px] border-border bg-card p-0 shadow-xl max-h-[85dvh] overflow-y-auto overscroll-contain">
        {/* Turnstile invisible widget container */}
        <div ref={turnstileRef} className="hidden" />
        <div className="flex flex-col gap-0 px-5 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-6" style={{ fontFamily: 'var(--font-sans)' }}>

          {/* ─── Header ─── */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl sm:text-[32px] font-bold leading-tight tracking-tight text-foreground" style={{ fontFamily: 'var(--font-sans)' }}>
                {phase === 'idle' && 'Claim Your Fees'}
                {phase === 'fetching' && 'Preparing...'}
                {phase === 'signing' && 'Sign Transactions'}
                {phase === 'submitting' && 'Submitting...'}
                {phase === 'complete' && 'Claim Complete'}
              </h2>
              <p className="text-xs sm:text-[13px] leading-relaxed text-muted-foreground" style={{ fontFamily: 'var(--font-mono)', maxWidth: 340 }}>
                {phase === 'idle' && `Claim unclaimed fees from ${fees.length} token${fees.length !== 1 ? 's' : ''} on Bags.fm`}
                {phase === 'fetching' && 'Generating claim transactions from Bags...'}
                {phase === 'signing' && 'Approve the transaction in your wallet to continue.'}
                {phase === 'submitting' && 'Confirming transactions on Solana...'}
                {phase === 'complete' && (
                  progress.completed > 0
                    ? `${progress.completed} of ${progress.total} claim${progress.completed !== 1 ? 's' : ''} confirmed.`
                    : 'No claims were successful.'
                )}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-border text-foreground transition-colors hover:bg-muted active:scale-95"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ─── Preview state ─── */}
          {phase === 'idle' && (
            <div className="flex flex-col">
              {/* Token list */}
              <div className="mt-6 flex flex-col">
                <div className="h-px w-full bg-border" />
                <div className="max-h-52 overflow-y-auto">
                  {fees.map((fee, i) => {
                    const unclaimed = safeBigInt(fee.total_unclaimed);
                    const usd = toUsdValue(unclaimed, 9, solPrice);
                    return (
                      <div key={fee.id}>
                        <div className="flex items-center justify-between py-3 sm:py-4">
                          <span className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[100px] sm:max-w-none" style={{ fontFamily: 'var(--font-sans)' }}>
                            {fee.token_symbol
                              ? `$${fee.token_symbol.replace(/[^\w\s\-\.]/g, '').trim().slice(0, 16)}`
                              : fee.token_address.slice(0, 8) + '...'}
                          </span>
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="text-xs sm:text-sm font-medium text-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                              {formatTokenAmount(fee.total_unclaimed, 9)} SOL
                            </span>
                            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                              {formatUsd(usd)}
                            </span>
                          </div>
                        </div>
                        {i < fees.length - 1 && <div className="h-px w-full bg-border" />}
                      </div>
                    );
                  })}
                </div>
                <div className="h-px w-full bg-border" />
              </div>

              {/* Summary box */}
              <div className="mt-4 sm:mt-5 flex flex-col gap-3 border border-border p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                    Total unclaimed
                  </span>
                  <span className="text-base sm:text-lg font-extrabold text-foreground" style={{ fontFamily: 'var(--font-sans)' }}>
                    {formatUsd(totalUnclaimedUsd)}
                  </span>
                </div>
                {feeApplied && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                      ClaimScan fee (0.85%)
                    </span>
                    <span className="text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                      {feeSol.toFixed(4)} SOL {formatUsd(feeUsd)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                    Estimated gas
                  </span>
                  <span className="text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                    ~{estimatedGas.toFixed(4)} SOL
                  </span>
                </div>
              </div>

              {/* Warnings */}
              <div className="mt-4 sm:mt-5 flex flex-col gap-3">
                {hasInsufficientSol && (
                  <div className="bg-muted p-4">
                    <p className="text-xs leading-relaxed tracking-wide text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                      Insufficient SOL for gas fees. You need at least ~{estimatedGas.toFixed(4)} SOL.
                    </p>
                  </div>
                )}

                {balanceError && (
                  <div className="bg-muted p-4">
                    <p className="text-xs leading-relaxed tracking-wide text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                      Unable to check SOL balance. Ensure you have enough SOL for gas fees before claiming.
                    </p>
                  </div>
                )}

                {bagsWalletMismatch && (
                  <div className="flex flex-col gap-2 border border-border bg-muted px-5 py-4">
                    <p className="text-sm font-semibold text-foreground">
                      Wrong wallet connected
                    </p>
                    <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                      Bags.fm requires the wallet linked to your social profile to claim fees. Connect the wallet registered with Bags:
                    </p>
                    <p className="break-all font-mono text-xs font-medium text-foreground">
                      {bagsRegisteredWallet}
                    </p>
                    <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                      To link a different wallet, verify your profile at bags.fm first.
                    </p>
                  </div>
                )}

                {!bagsWalletMismatch && walletMismatch && (
                  <div className="bg-muted p-4">
                    <p className="text-xs leading-relaxed tracking-wide text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                      Connected wallet differs from this profile. Claims will use your connected wallet.
                    </p>
                  </div>
                )}

                {isMobile && (
                  <div className="bg-muted p-4">
                    <p className="text-xs leading-relaxed tracking-wide text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                      You&apos;ll be redirected to your wallet app to sign. Return to this browser after signing.
                    </p>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="mt-4 sm:mt-5">
                <button
                  onClick={handleClaim}
                  disabled={phase !== 'idle' || hasInsufficientSol || !!bagsWalletMismatch}
                  className="flex h-12 sm:h-14 w-full cursor-pointer items-center justify-center gap-2 sm:gap-2.5 bg-foreground text-background transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <span className="text-xs sm:text-[13px] font-medium tracking-[1.5px] sm:tracking-[2px]" style={{ fontFamily: 'var(--font-mono)' }}>
                    CLAIM {fees.length} TOKENS
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ─── Fetching state ─── */}
          {phase === 'fetching' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
              <p className="text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                Preparing claim transactions...
              </p>
            </div>
          )}

          {/* ─── Signing state ─── */}
          {phase === 'signing' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
              <p className="text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                Waiting for wallet approval...
              </p>
              <button
                onClick={cancel}
                className="cursor-pointer border border-border px-5 py-3 text-xs text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ─── Submitting state ─── */}
          {phase === 'submitting' && (
            <div className="mt-6 flex flex-col gap-3">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-center text-[11px] tabular-nums text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                {processed} / {progress.total} tokens processed
              </p>

              <div className="flex flex-col gap-0 max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.claimAttemptId || r.tokenMint}>
                    <div className="flex items-center justify-between py-2">
                      <span className="truncate max-w-[120px] text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                        {r.tokenMint.slice(0, 8)}...
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={cancel}
                className="mt-2 w-full cursor-pointer border border-border py-3 text-xs text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
              >
                Cancel Remaining
              </button>
            </div>
          )}

          {/* ─── Complete state ─── */}
          {phase === 'complete' && (
            <div className="mt-6 flex flex-col gap-3">
              {progress.completed > 0 && (
                <div className="flex items-center justify-center gap-2 bg-muted py-3">
                  <svg className="h-4 w-4 text-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-xs font-semibold text-foreground" style={{ fontFamily: 'var(--font-sans)' }}>
                    {progress.completed} claim{progress.completed !== 1 ? 's' : ''} confirmed
                  </p>
                </div>
              )}

              {progress.failed > 0 && (
                <div className="bg-muted p-4">
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                    {progress.failed} claim{progress.failed !== 1 ? 's' : ''} failed
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-muted p-4">
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>
                </div>
              )}

              <div className="flex flex-col max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.claimAttemptId || r.tokenMint}>
                    <div className="flex items-center justify-between py-2">
                      <span className="truncate max-w-[120px] text-xs text-muted-foreground/60" style={{ fontFamily: 'var(--font-mono)' }}>
                        {r.tokenMint.slice(0, 8)}...
                      </span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {r.txSignature && /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(r.txSignature) && (
                          <a
                            href={`https://solscan.io/tx/${r.txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="View transaction on Solscan"
                            onClick={() => track('external_link_clicked', { explorer: 'Solscan', chain: 'sol' })}
                            className="text-muted-foreground/60 transition-colors hover:text-foreground"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onOpenChange(false)}
                className="flex h-12 sm:h-14 w-full cursor-pointer items-center justify-center bg-foreground text-xs sm:text-[13px] font-medium tracking-[1.5px] sm:tracking-[2px] text-background transition-all hover:bg-foreground/90 active:scale-[0.98]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                DONE
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; color: string }> = {
    confirmed: { text: 'Confirmed', color: 'text-foreground font-semibold' },
    failed: { text: 'Failed', color: 'text-muted-foreground/60' },
    submitted: { text: 'Confirming...', color: 'text-muted-foreground' },
    pending: { text: 'Pending', color: 'text-muted-foreground/40' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`text-xs ${c.color}`} style={{ fontFamily: 'var(--font-mono)' }}>
      {c.text}
    </span>
  );
}
