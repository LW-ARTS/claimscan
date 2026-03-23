import * as Sentry from '@sentry/nextjs';

/** Safely call Sentry without crashing callers if SDK is unavailable */
function safe(fn: () => void) {
  try { fn(); } catch { /* Sentry unavailable */ }
}

/** Track claim lifecycle events as breadcrumbs + alerts on failures */
export function trackClaimEvent(
  event: 'initiated' | 'success' | 'failure' | 'fee_collected' | 'fee_skipped',
  data: Record<string, string | number> = {}
) {
  safe(() => {
    Sentry.addBreadcrumb({
      category: 'claim',
      message: `claim.${event}`,
      data,
      level: event === 'failure' ? 'error' : 'info',
    });

    if (event === 'failure') {
      Sentry.captureMessage(`Claim failed`, {
        level: 'warning',
        tags: {
          claim_event: event,
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          ),
        },
      });
    }
  });
}

/** Alert on operations exceeding performance budget */
export function trackPerformance(
  operation: string,
  durationMs: number,
  budgetMs: number
) {
  if (durationMs > budgetMs) {
    safe(() => {
      Sentry.captureMessage(`Performance budget exceeded: ${operation}`, {
        level: 'warning',
        extra: {
          operation,
          durationMs,
          budgetMs,
          exceededBy: `${Math.round((durationMs / budgetMs - 1) * 100)}%`,
        },
      });
    });
  }
}

/** Track fee collection for revenue monitoring */
export function trackFeeCollection(
  collected: boolean,
  feeLamports: string
) {
  safe(() => {
    Sentry.addBreadcrumb({
      category: 'revenue',
      message: collected ? 'fee_collected' : 'fee_skipped',
      data: { feeLamports },
      level: 'info',
    });
  });
}
