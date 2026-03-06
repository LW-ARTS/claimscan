import { NextResponse } from 'next/server';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Clean search_log older than 30 days
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: logsDeleted } = await supabase
      .from('search_log')
      .delete({ count: 'exact' })
      .lt('searched_at', thirtyDaysAgo);

    // Clean orphaned creators — batch delete instead of N+1
    let creatorsDeleted = 0;
    const { data: allCreators } = await supabase
      .from('creators')
      .select('id, wallets(id), fee_records(id)')
      .order('created_at', { ascending: true })
      .limit(500);

    if (allCreators) {
      const orphanIds = allCreators
        .filter((c) => {
          const hasWallets = Array.isArray(c.wallets) && c.wallets.length > 0;
          const hasFees = Array.isArray(c.fee_records) && c.fee_records.length > 0;
          return !hasWallets && !hasFees;
        })
        .map((c) => c.id);

      if (orphanIds.length > 0) {
        const { count } = await supabase
          .from('creators')
          .delete({ count: 'exact' })
          .in('id', orphanIds);
        creatorsDeleted = count ?? 0;
      }
    }

    // Clean stale token_prices (not updated in 7 days)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: pricesDeleted } = await supabase
      .from('token_prices')
      .delete({ count: 'exact' })
      .lt('updated_at', sevenDaysAgo);

    return NextResponse.json({
      ok: true,
      logsDeleted: logsDeleted ?? 0,
      creatorsDeleted,
      pricesDeleted: pricesDeleted ?? 0,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}
