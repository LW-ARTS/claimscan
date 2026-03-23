import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import type { Platform, Chain } from '@/lib/supabase/types';
import { createLogger } from '@/lib/logger';
const log = createLogger('cached-tokens');

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
  chain: Chain,
  creatorId?: string
): Promise<string[] | null> {
  try {
    const supabase = createServiceClient();

    // If creatorId is provided, skip wallet lookup
    let resolvedCreatorId = creatorId;
    if (!resolvedCreatorId) {
      // Step 1: Resolve wallet → creator_id
      const { data: walletRow } = await supabase
        .from('wallets')
        .select('creator_id')
        .eq('address', wallet)
        .eq('chain', chain)
        .limit(1)
        .maybeSingle();

      if (!walletRow) return null;
      resolvedCreatorId = walletRow.creator_id;
    }

    // Step 2: Fetch cached token addresses for this creator + platform
    const { data: tokens } = await supabase
      .from('creator_tokens')
      .select('token_address')
      .eq('creator_id', resolvedCreatorId)
      .eq('platform', platform)
      .eq('chain', chain);

    if (!tokens || tokens.length === 0) return null;

    return tokens.map((t) => t.token_address);
  } catch (err) {
    // DB error → fall back to GPA. Log so operators can detect broken cache layer.
    log.warn('DB query failed, falling back to GPA', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
