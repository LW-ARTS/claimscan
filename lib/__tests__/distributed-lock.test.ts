import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure the shared mock state exists BEFORE vi.mock runs
// (vi.mock is hoisted to the top of the file, above regular const/let).
const { store, setFn, scriptLoadFn, evalshaFn, createFailingSet } = vi.hoisted(() => {
  const store = new Map<string, string>();

  // Default set implementation: honors nx (NX = only set if not exists)
  const setFn = vi.fn(
    async (
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number },
    ): Promise<'OK' | null> => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
  );

  const scriptLoadFn = vi.fn(async (_script: string): Promise<string> => {
    return 'sha-release-script';
  });

  // Default evalsha implementation: compare-and-delete
  const evalshaFn = vi.fn(
    async (_sha: string, keys: string[], args: string[]): Promise<number> => {
      const k = keys[0];
      const expected = args[0];
      const current = store.get(k);
      if (current === expected) {
        store.delete(k);
        return 1;
      }
      return 0;
    },
  );

  // Helper for tests that want to swap set() to throw
  const createFailingSet = () =>
    vi.fn(async () => {
      throw new Error('simulated redis connection refused');
    });

  return { store, setFn, scriptLoadFn, evalshaFn, createFailingSet };
});

vi.mock('server-only', () => ({}));

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    set = setFn;
    scriptLoad = scriptLoadFn;
    evalsha = evalshaFn;
  },
}));

// Import AFTER mock registration so the lazy dynamic import inside
// distributed-lock.ts picks up our stub.
const importLockModule = async () => {
  vi.resetModules();
  return import('@/lib/distributed-lock');
};

describe('distributed-lock', () => {
  beforeEach(() => {
    store.clear();
    setFn.mockClear();
    scriptLoadFn.mockClear();
    evalshaFn.mockClear();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://test.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a UUID token on successful acquisition', async () => {
    const mod = await importLockModule();
    const token = await mod.tryAcquireLock('k1');
    expect(token).not.toBeNull();
    expect(token).not.toBe(mod.NO_REDIS_TOKEN);
    // UUID v4 shape
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // The key was actually stored
    expect(store.has('claimscan:lock:k1')).toBe(true);
    expect(store.get('claimscan:lock:k1')).toBe(token);
  });

  it('returns null when another process already holds the lock', async () => {
    const mod = await importLockModule();

    const first = await mod.tryAcquireLock('k1');
    expect(first).not.toBeNull();
    expect(first).not.toBe(mod.NO_REDIS_TOKEN);

    const second = await mod.tryAcquireLock('k1');
    expect(second).toBeNull();
  });

  it('foreign release is blocked — releaseLock with wrong token does NOT delete the lock', async () => {
    const mod = await importLockModule();

    const tokenA = await mod.tryAcquireLock('k1');
    expect(tokenA).not.toBeNull();
    expect(tokenA).not.toBe(mod.NO_REDIS_TOKEN);

    // Simulate: A's TTL expired, process B acquired the same lock.
    // Manually overwrite the store to represent B's ownership.
    store.set('claimscan:lock:k1', 'tokenB-foreign');

    // A's late finalizer fires with its original (now stale) token
    await mod.releaseLock('k1', tokenA);

    // B's lock must still be present — foreign release was blocked
    expect(store.get('claimscan:lock:k1')).toBe('tokenB-foreign');
    // evalsha was called (we didn't noop) but returned 0 (no delete)
    expect(evalshaFn).toHaveBeenCalledOnce();
  });

  it('owned release succeeds — lock is deleted when token matches', async () => {
    const mod = await importLockModule();

    const token = await mod.tryAcquireLock('k1');
    expect(token).not.toBeNull();
    expect(token).not.toBe(mod.NO_REDIS_TOKEN);

    await mod.releaseLock('k1', token);
    expect(store.has('claimscan:lock:k1')).toBe(false);
  });

  it('releaseLock with null is a complete no-op (never touches Redis)', async () => {
    const mod = await importLockModule();
    await mod.releaseLock('k1', null);
    expect(scriptLoadFn).not.toHaveBeenCalled();
    expect(evalshaFn).not.toHaveBeenCalled();
  });

  it('releaseLock with NO_REDIS_TOKEN is a no-op', async () => {
    const mod = await importLockModule();
    await mod.releaseLock('k1', mod.NO_REDIS_TOKEN);
    expect(scriptLoadFn).not.toHaveBeenCalled();
    expect(evalshaFn).not.toHaveBeenCalled();
  });

  it('fail-open: tryAcquireLock returns NO_REDIS_TOKEN when redis.set throws', async () => {
    // Swap the set implementation to throw for this one test
    setFn.mockImplementationOnce(async () => {
      throw new Error('simulated connection refused');
    });

    const mod = await importLockModule();
    const token = await mod.tryAcquireLock('k1');
    expect(token).toBe(mod.NO_REDIS_TOKEN);
  });

  it('fail-open: tryAcquireLock returns NO_REDIS_TOKEN when Redis env is not configured', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const mod = await importLockModule();
    const token = await mod.tryAcquireLock('k1');
    expect(token).toBe(mod.NO_REDIS_TOKEN);
  });
});
