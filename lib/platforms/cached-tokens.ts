import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import type { Platform, Chain } from '@/lib/supabase/types';

/**
 * Look up cached token addresses from the `creator_tokens` table.
 * Returns null if no cached tokens found (caller should fall back to GPA).
 *
 * Used by GPA-heavy adapters (revshare, coinbarrel, believe) to skip
 * expensive getProgramAccounts calls when the cron has already indexed
 * the creator's tokens.
 */
export async function getCachedTokenAddresses(
  wallet: string,
  platform: Platform,
  chain: Chain
): Promise<string[] | null> {
  try {
    const supabase = createServiceClient();

    // Step 1: Resolve wallet → creator_id
    const { data: walletRow } = await supabase
      .from('wallets')
      .select('creator_id')
      .eq('address', wallet)
      .eq('chain', chain)
      .limit(1)
      .single();

    if (!walletRow) return null;

    // Step 2: Fetch cached token addresses for this creator + platform
    const { data: tokens } = await supabase
      .from('creator_tokens')
      .select('token_address')
      .eq('creator_id', walletRow.creator_id)
      .eq('platform', platform)
      .eq('chain', chain);

    if (!tokens || tokens.length === 0) return null;

    return tokens.map((t) => t.token_address);
  } catch (err) {
    // DB error → fall back to GPA. Log so operators can detect broken cache layer.
    console.warn('[cached-tokens] DB query failed, falling back to GPA:', err instanceof Error ? err.message : err);
    return null;
  }
}
