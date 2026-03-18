'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Something went wrong</h2>
          <p className="text-muted-foreground">An unexpected error occurred. Please try again.</p>
          <button
            onClick={reset}
            className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-bold text-background"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
