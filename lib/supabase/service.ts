import 'server-only';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Singleton anchored on globalThis to survive Next.js hot-module-replacement in dev.
// Without this, each file save during development creates a new Supabase client
// and leaks the previous connection.
const SUPABASE_KEY = '__claimscan_supabase_service__';
const g = globalThis as typeof globalThis & {
  [SUPABASE_KEY]?: ReturnType<typeof createClient<Database>>;
};

export function createServiceClient(): ReturnType<typeof createClient<Database>> {
  if (g[SUPABASE_KEY]) return g[SUPABASE_KEY]!;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  g[SUPABASE_KEY] = client;
  return client;
}

export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    console.error('CRON_SECRET is not configured or too short (min 32 chars)');
    return false;
  }
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  // Use constant-time comparison to prevent timing side-channel attacks
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);

  // Pad to equal length before comparison to avoid leaking secret length
  // via early exit on length mismatch (timing oracle)
  const maxLen = Math.max(actual.length, expected.length);
  const paddedActual = Buffer.alloc(maxLen);
  const paddedExpected = Buffer.alloc(maxLen);
  actual.copy(paddedActual);
  expected.copy(paddedExpected);

  // Run timingSafeEqual FIRST — the && short-circuit on length mismatch would leak secret length
  const match = timingSafeEqual(paddedActual, paddedExpected);
  return match && actual.length === expected.length;
}
