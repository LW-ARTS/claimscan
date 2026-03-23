import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'crypto';

// ═══════════════════════════════════════════════
// Structured Logger with Trace IDs
// ═══════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  msg: string;
  traceId?: string;
  durationMs?: number;
  platform?: string;
  chain?: string;
  wallet?: string;
  handle?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? 'debug'] ?? 0;

function emit(entry: LogEntry): void {
  if (LOG_LEVELS[entry.level] < MIN_LEVEL) return;

  const { level, msg, module, ...rest } = entry;
  const structured = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...rest,
  };

  // Output JSON in production, readable in dev
  if (process.env.NODE_ENV === 'production') {
    const line = JSON.stringify(structured);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } else {
    const prefix = `[${module}]`;
    if (level === 'error') console.error(prefix, msg, rest);
    else if (level === 'warn') console.warn(prefix, msg, rest);
    else if (level === 'debug') console.debug(prefix, msg, rest);
    else console.log(prefix, msg, rest);
  }

  // Send errors and warnings to Sentry as breadcrumbs
  if (level === 'error' || level === 'warn') {
    Sentry.addBreadcrumb({
      category: module,
      message: msg,
      level: level === 'error' ? 'error' : 'warning',
      data: rest,
    });
  }
}

// ═══════════════════════════════════════════════
// Scoped Logger — one per module/request
// ═══════════════════════════════════════════════

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  /** Create a child logger with additional default fields */
  child(fields: Record<string, unknown>): Logger;
  /** Measure an async operation and log its duration */
  time<T>(msg: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T>;
  /** The trace ID for this logger */
  traceId: string;
}

export function createLogger(module: string, traceId?: string): Logger {
  const tid = traceId ?? randomUUID().slice(0, 12);
  return _createLogger(module, tid, {});
}

function _createLogger(
  module: string,
  traceId: string,
  defaults: Record<string, unknown>
): Logger {
  const log = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    emit({ level, module, msg, traceId, ...defaults, ...extra });
  };

  return {
    traceId,
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    child: (fields) => _createLogger(module, traceId, { ...defaults, ...fields }),
    async time<T>(msg: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        const durationMs = Math.round(performance.now() - start);
        log('info', msg, { durationMs, status: 'ok', ...extra });
        return result;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        log('error', msg, {
          durationMs,
          status: 'error',
          err: err instanceof Error ? err.message : String(err),
          ...extra,
        });
        throw err;
      }
    },
  };
}
