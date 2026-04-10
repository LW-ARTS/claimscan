import { vi } from 'vitest';

// Must be called before any import that reaches lib/platforms/index.ts
// or any lib that has `import 'server-only'` at the top.
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
