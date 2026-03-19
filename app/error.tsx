'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <>
      <title>Error | ClaimScan</title>
      <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-6 flex gap-4">
          <button
            onClick={reset}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-bold uppercase tracking-wide text-background transition-all hover:bg-foreground/90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </>
  );
}
