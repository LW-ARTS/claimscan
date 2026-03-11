import { NextResponse } from 'next/server';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { getAllAdapters } from '@/lib/platforms';
import type { ResolvedWallet } from '@/lib/platforms/types';
import type { Platform, Chain } from '@/lib/supabase/types';

export const maxDuration = 60;

/** Platforms that use heavy GPA queries for token discovery and benefit from DB caching. */
const GPA_PLATFORMS = new Set(['coinbarrel', 'believe', 'revshare']);

/**
 * Cron job: discover creator tokens via GPA and cache them in `creator_tokens`.
 * Eliminates the need for expensive getProgramAccounts on every user visit.
 *
 * Runs every 10 minutes. Processes creators whose tokens were last indexed
 * more than 10 minutes ago (or never indexed).
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const wallclockStart = Date.now();
  const WALLCLOCK_BUDGET_MS = 55_000;

  try {
    // Fetch creators with wallets that haven't been token-indexed recently.
    // We use the fee_records table's updated_at as a proxy — if the creator
    // has been active (searched recently), index their tokens.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: creators } = await supabase
      .from('creators')
      .select('id, wallets(*)')
      .order('updated_at', { ascending: false })
      .limit(15);

    if (!creators || creators.length === 0) {
      return NextResponse.json({ ok: true, indexed: 0, tokens: 0 });
    }

    const gpaAdapters = getAllAdapters().filter((a) => GPA_PLATFORMS.has(a.platform));
    let totalCreators = 0;
    let totalTokens = 0;

    for (const creator of creators) {
      if (Date.now() - wallclockStart > WALLCLOCK_BUDGET_MS) {
        console.warn(`[index-tokens] wallclock guard: stopping after ${totalCreators} creators`);
        break;
      }

      const wallets: ResolvedWallet[] = (creator.wallets ?? [])
        .filter((w: { address: string; chain: string; source_platform: string }) => w.address && w.chain)
        .map((w: { address: string; chain: string; source_platform: string }) => ({
          address: w.address,
          chain: w.chain as ResolvedWallet['chain'],
          sourcePlatform: w.source_platform as ResolvedWallet['sourcePlatform'],
        }));

      if (wallets.length === 0) continue;

      // Check if already indexed recently
      const { data: existingTokens } = await supabase
        .from('creator_tokens')
        .select('id')
        .eq('creator_id', creator.id)
        .limit(1);

      // If tokens exist and creator was updated recently, skip
      if (existingTokens && existingTokens.length > 0) {
        const { data: recentCreator } = await supabase
          .from('creators')
          .select('updated_at')
          .eq('id', creator.id)
          .single();

        if (recentCreator?.updated_at && recentCreator.updated_at > tenMinAgo) {
          continue;
        }
      }

      // Run GPA-based token discovery for each wallet × adapter
      const discoveredTokens: Array<{
        creator_id: string;
        platform: Platform;
        chain: Chain;
        token_address: string;
        token_symbol: string | null;
        token_name: string | null;
        token_image_url: string | null;
      }> = [];

      const tasks = wallets.flatMap((wallet) =>
        gpaAdapters
          .filter((a) => a.chain === wallet.chain)
          .map(async (adapter) => {
            try {
              const tokens = await adapter.getCreatorTokens(wallet.address);
              for (const token of tokens) {
                discoveredTokens.push({
                  creator_id: creator.id,
                  platform: token.platform,
                  chain: token.chain,
                  token_address: token.tokenAddress,
                  token_symbol: token.symbol,
                  token_name: token.name,
                  token_image_url: token.imageUrl,
                });
              }
            } catch (err) {
              console.warn(
                `[index-tokens] ${adapter.platform} getCreatorTokens failed for ${wallet.address}:`,
                err instanceof Error ? err.message : err
              );
            }
          })
      );

      await Promise.allSettled(tasks);

      if (discoveredTokens.length > 0) {
        const { error } = await supabase
          .from('creator_tokens')
          .upsert(discoveredTokens, { onConflict: 'token_address,chain' });

        if (error) {
          console.warn(`[index-tokens] upsert failed for creator ${creator.id}:`, error.message);
        } else {
          totalTokens += discoveredTokens.length;
        }
      }

      totalCreators++;
    }

    return NextResponse.json({
      ok: true,
      indexed: totalCreators,
      tokens: totalTokens,
      durationMs: Date.now() - wallclockStart,
    });
  } catch (err) {
    console.error('[index-tokens] unexpected error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
