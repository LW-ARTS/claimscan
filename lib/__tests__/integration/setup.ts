import { vi } from 'vitest';
import { config } from 'dotenv';

// Register server-only stub before any adapter import
vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    time: vi.fn((_msg: string, fn: () => unknown) => fn()),
  }),
}));

// Load integration-specific env (API keys etc.) if the file exists.
// CI injects secrets via environment; local dev uses .env.test.
config({ path: '.env.test' });
