import { describe, it, expect } from 'vitest';

// This import chain reaches lib/platforms/index.ts which has `import 'server-only'`.
// The test passes only if setup.ts ran the vi.mock('server-only') stub first.
import { getAllAdapters } from '@/lib/platforms';

describe('integration setup smoke', () => {
  it('imports adapter registry without server-only crash', () => {
    const adapters = getAllAdapters();
    expect(adapters).toBeInstanceOf(Array);
    expect(adapters.length).toBeGreaterThan(0);
  });
});
