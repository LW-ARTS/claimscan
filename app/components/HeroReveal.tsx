'use client';

import { useState, useEffect, useCallback, startTransition, type ReactNode } from 'react';

/**
 * Full-screen reveal animation for the homepage hero.
 *
 * Timeline (1.3 s total):
 *  0.0 s - 0.4 s  Logo scales in with subtle blur clear
 *  0.2 s - 0.5 s  "ClaimScan" text fades in below logo
 *  0.0 s - 0.8 s  Hold (logo + text visible, OVERLAY_HOLD_MS)
 *  0.8 s - 1.3 s  Overlay fades out (OVERLAY_FADE_MS), content animations begin
 *
 * Only plays once per browser session (sessionStorage).
 * Skips entirely when prefers-reduced-motion is enabled.
 *
 * Uses pure CSS animations instead of motion/react for smaller bundle.
 */

const OVERLAY_HOLD_MS = 800; // when overlay starts fading out
const OVERLAY_FADE_MS = 500; // fade-out duration
const CONTENT_UNBLOCK_MS = 800; // unblock child CSS animations (slightly before overlay fully gone)

export function HeroReveal({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'overlay' | 'exiting' | 'done'>('overlay');
  const [skipReveal, setSkipReveal] = useState(false);

  const finish = useCallback(() => {
    setPhase('done');
    sessionStorage.setItem('hero-revealed', '1');
  }, []);

  useEffect(() => {
    const alreadyPlayed = sessionStorage.getItem('hero-revealed');
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (alreadyPlayed || prefersReduced) {
      startTransition(() => {
        setPhase('done');
        setSkipReveal(true);
      });
      return;
    }

    // Start fading out overlay after hold period
    const exitTimer = setTimeout(() => setPhase('exiting'), OVERLAY_HOLD_MS);

    // Mark as done & persist
    const doneTimer = setTimeout(() => {
      finish();
    }, OVERLAY_HOLD_MS + OVERLAY_FADE_MS);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [finish]);

  // Unblock child CSS animations slightly before overlay fully disappears
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (skipReveal) {
      startTransition(() => setContentReady(true));
      return;
    }
    const t = setTimeout(() => setContentReady(true), CONTENT_UNBLOCK_MS);
    return () => clearTimeout(t);
  }, [skipReveal]);

  // If skipping, render children directly (no wrapper overhead)
  if (skipReveal) return <>{children}</>;

  return (
    <>
      {/* Overlay */}
      {phase !== 'done' && (
        <div
          aria-hidden="true"
          className="hero-reveal-overlay"
          data-phase={phase}
        >
          {/* Logo + wordmark */}
          <div className="hero-reveal-logo-group">
            {/* ClaimScan icon */}
            <div className="flex h-20 w-20 items-center justify-center sm:h-28 sm:w-28">
              <svg
                viewBox="0 0 1536 1536"
                className="h-full w-full"
                fill="oklch(0.97 0 0)"
              >
                <path d="M423.29,1057.61c73.39,27.03,157.91,21.13,226.43-18.56,27.81,12.19,56.66,20.64,87.33,23.87,22.65,2.38,44.08,1.23,67.87-.08-66.43,70.96-159.31,117.02-255.01,125.04-92.42,7.74-184.22-18.8-259.71-72.07-43.39-30.62-80.98-68.05-110.52-112.52-51.31-77.25-75.89-170.48-70.2-263.06,1.82-29.67,7.02-57.88,14.6-86.33,18.65-70,57.7-135.89,108.18-187.69,22.72-23.31,47.86-42.92,75.34-60.42,73.79-46.98,165.41-69.45,252.43-57.8,33.74,4.51,65.9,12.76,97.27,25.66,35.6,14.64,68.23,33.16,98.73,56.89l-33.54,43.05c-26.27,4.38-51.1,11.69-75.71,22.37-17.76-9.51-35.36-17.84-54.95-23.75-65.88-19.89-137.14-13.95-198.62,17.02-58.64,29.53-105.98,80.25-135.29,138.4-11.67,23.16-19.73,46.63-25.44,71.78-19.66,86.59-1.01,177.29,50.58,249.4,35.41,49.48,82.97,87.65,140.22,108.82Z" />
                <path d="M835.47,1091.06l34.68-44.12c19.42-7.64,38.04-16.24,56.04-28.35,43.59,31.05,92.81,50.62,145.66,58.55,41.63,6.25,83.08,6.56,124.29-1.7,23.69-4.75,45.72-12.22,65.76-25.44,35.69-23.53,50.6-59.63,46.03-101.95-6.85-63.44-68.56-89.71-120.95-109.19l-61.42-18.61-62.19-18.14c4.6-42.54.41-83.65-11.36-124.55,26.49,9.98,50.92,17.9,76.87,24.56l78.27,22.63c25.34,7.94,49.4,16.75,73.49,27.72,11.75,5.35,22.09,11.18,33.23,17.76,69.5,41.02,114.4,107.05,113.7,189.77-.62,73.23-30.17,132.61-89.82,174.85-50.75,35.94-113.07,52.29-174.82,57.18-96.03,7.61-200.84-14.28-282.1-66.66-15.98-10.33-30.52-20.79-45.39-34.31Z" />
                <path d="M918.11,652.5c52.02,66.98,51.6,160.01,2.33,227.33,2.11,8.63.4,16.99-5.43,23.5-5.51,6.16-14.12,8.35-22.94,7.03-54.05,46.4-128.44,59.57-194.75,32.34-31.61-12.98-59.1-33.06-79.78-60.64-39.48-52.66-50.13-120.75-25.12-184.72,20.96-53.62,68.79-97.96,128.33-113.03,57.82-14.64,119.25-1.72,167.3,35.41l29.03-31.09c-21.37-17.44-44.53-31.62-70.77-40.95-61.21-21.75-129.77-17.19-186.98,13.46-96.59,51.74-144.01,158.38-117.29,264.79,21.95,87.4,96.24,155.48,184.54,171.39,84.31,15.19,169.11-16.74,223.18-82.98,69.26-84.85,69.2-208.42-.4-294.27l16.51-17.98c95.31,113.49,75.03,283.5-43.72,372.17-48.14,35.94-106.77,54.33-168.27,50.95-113.87-6.26-210.24-87.64-236.87-198.42-9.92-41.28-9.07-83.78,1.65-125.01,19.88-76.48,74.23-139.04,146.46-170.97,39.84-17.61,83.47-23.98,127.14-20.19,60.52,5.25,116.93,32.46,159.63,75.9l-94.52,101.82-52.66,57.11c10.15,18.31,6.69,41.4-9.37,54.62-16.47,13.55-40.71,12.86-55.92-1.19s-18.3-38.03-6.57-55.37c12.09-17.85,35.03-23.6,54.58-14.35l36.52-40.2c-30.29-22.26-79.54-26.29-109.27-.42-4.91,9.4-8.65,27.64-26.65,25.07-18.65,27.57-22.13,64.31-6.6,96.31,13.17,27.15,40.12,48.86,72.51,53.3,35.29,4.83,68.73-8.72,90.57-36.92,23.32-30.11,26.66-71.32,8.33-105.09l17.84-17.55c28.12,44.55,23.65,101.7-9.99,142.31-21.97,26.53-55.03,41.58-89.62,42.41-74.65,1.78-130.52-61.41-123.47-133.5,1.98-20.29,9.31-38.08,20.13-54.81-2.45-9.12-2.46-19.89,4.72-27.04s16.82-8.86,26.48-5.42c42.52-29.19,100.11-28.62,142.17,2.64l29.28-30.9c-22.19-17.65-48.32-29.64-75.9-34.15-96.38-15.77-184.61,55.16-190.64,152.16-4.05,65.12,30.39,126.11,88.59,156.28s131.42,22.97,181.77-20.53c-1.54-8.64.53-16.26,6.08-22.23s13.02-7.8,21.31-6.93c41.77-57.8,41.72-135.55-.52-193.34l17.01-18.1Z" />
                <path d="M1319.67,548.91c-72.01-54.84-144.4-90.07-236.62-93.18-60.12-2.02-123.94,11.37-171.02,50.86-39.67-21.55-82.63-33.75-128.57-35.84,11.87-17.31,25.86-31.44,41.49-44.95,69.62-59.37,157.39-83.24,248.06-83.47,117.9-.3,223.8,41.8,315.66,114.36l-34.82,46.31-34.19,45.92Z" />
              </svg>
            </div>

            {/* Wordmark */}
            <span className="hero-reveal-wordmark">
              ClaimScan
            </span>
          </div>
        </div>
      )}

      {/* Page content (CSS animations frozen until overlay exits) */}
      <div className={contentReady ? '' : 'reveal-pending'}>
        {children}
      </div>
    </>
  );
}
