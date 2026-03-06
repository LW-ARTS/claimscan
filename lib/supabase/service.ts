import 'server-only';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Module-level singleton — avoids creating a new client per request
let _serviceClient: ReturnType<typeof createClient<Database>> | null = null;

export function createServiceClient() {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  _serviceClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) {
    console.error('CRON_SECRET is not configured');
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

  return actual.length === expected.length && timingSafeEqual(paddedActual, paddedExpected);
}
