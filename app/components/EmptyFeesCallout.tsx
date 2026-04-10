import Link from 'next/link';
import type { IdentityProvider } from '@/lib/supabase/types';

interface EmptyFeesCalloutProps {
  handle: string;
  provider: IdentityProvider;
}

/**
 * Empty state card shown when a creator profile resolves but has no fee records.
 * Visual language intentionally echoes the scan radar from app/[handle]/loading.tsx —
 * a static, frozen version of the same sonar frame communicates "we scanned, found nothing"
 * instead of a generic "Page Not Found" illustration.
 */
export function EmptyFeesCallout({ handle, provider }: EmptyFeesCalloutProps) {
  const isWallet = provider === 'wallet';
  const headline = isWallet ? 'No tracked fees on this wallet' : 'No fees found yet';

  const body = isWallet
    ? `We scanned all 9 launchpads across Solana, Base, Ethereum and BNB Chain. This wallet hasn't earned creator fees on any of them.`
    : `We scanned all 9 launchpads across Solana, Base, Ethereum and BNB Chain. ${handle ? `@${handle}` : 'This account'} hasn't earned creator fees on any of them. The account might be new, or hasn't been indexed yet.`;

  return (
    <div className="animate-fade-in-up delay-200 px-5 py-12 sm:px-12 sm:py-16">
      <div className="mx-auto flex max-w-[560px] flex-col items-center rounded-[14px] border border-dashed border-[var(--border-default)] bg-[var(--bg-card)] px-6 py-10 text-center sm:px-12 sm:py-14">
        {/* Static sonar radar — frozen version of the one in [handle]/loading.tsx */}
        <div className="relative flex h-[72px] w-[72px] items-center justify-center">
          <svg className="absolute h-[72px] w-[72px]" viewBox="0 0 72 72" aria-hidden="true">
            {/* Outer ring: faint full circle */}
            <circle
              cx="36"
              cy="36"
              r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              className="text-[var(--text-primary)]/[0.06]"
            />
            {/* Outer ring: short dashed arc accent (rotated like the radar sweep) */}
            <circle
              cx="36"
              cy="36"
              r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeDasharray="18 196"
              transform="rotate(-120 36 36)"
              className="text-[var(--text-primary)]/25"
            />
            {/* Middle ring: dashed circle */}
            <circle
              cx="36"
              cy="36"
              r="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 4"
              className="text-[var(--text-primary)]/15"
            />
            {/* Inner reticle */}
            <circle
              cx="36"
              cy="36"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 5"
              className="text-[var(--text-primary)]/20"
            />
            {/* Center dot */}
            <circle cx="36" cy="36" r="1.6" fill="currentColor" className="text-[var(--text-primary)]/40" />
          </svg>
        </div>

        {/* Status line — mono caps matching the SCANNING label on the loading skeleton */}
        <p className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[3px] text-[var(--text-tertiary)]">
          Scan complete &middot; 0 records
        </p>

        {/* Headline */}
        <h2 className="mt-3 text-[18px] font-bold tracking-tight text-[var(--text-primary)] sm:text-[20px]">
          {headline}
        </h2>

        {/* Body copy */}
        <p className="mt-2.5 max-w-[440px] text-[14px] leading-relaxed text-[var(--text-secondary)]">
          {body}
        </p>

        {/* CTA: browse the leaderboard */}
        <Link
          href="/leaderboard"
          className="pressable hover-glow mt-7 inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-accent)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          Browse top earners
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
