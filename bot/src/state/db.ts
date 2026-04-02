import { createServiceClient } from '@/lib/supabase/service';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { safeBigInt, toUsdValue } from '@/lib/utils';
import type { Platform, Chain } from '@/lib/supabase/types';

const supabase = createServiceClient();

const VALID_CHAINS: ReadonlySet<string> = new Set(['sol', 'base', 'eth', 'bsc']);
const VALID_PLATFORMS: ReadonlySet<string> = new Set(Object.keys(PLATFORM_CONFIG));

function assertChain(val: string): Chain | null {
  return VALID_CHAINS.has(val) ? (val as Chain) : null;
}

function assertPlatform(val: string): Platform | null {
  return VALID_PLATFORMS.has(val) ? (val as Platform) : null;
}

// ═══════════════════════════════════════════════
// Fast-path: Lookup token by address in existing data
// ═══════════════════════════════════════════════

export interface DbTokenResult {
  creatorId: string;
  platform: Platform;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol: string | null;
  feeRecipient: string | null;
  feeRecipientHandle: string | null;
  totalEarned: string;
  totalClaimed: string;
  totalUnclaimed: string;
  totalEarnedUsd: number | null;
  feeType: string | null;
  feeLocked: boolean | null;
  feeRecipientCount: number | null;
}

export async function lookupTokenByAddress(
  tokenAddress: string,
  chain?: Chain
): Promise<DbTokenResult | null> {
  // Try fee_records first (most comprehensive)
  let query = supabase
    .from('fee_records')
    .select('*')
    .eq('token_address', tokenAddress);

  if (chain) query = query.eq('chain', chain);

  const { data: feeRecord, error: feeError } = await query.limit(1).single();

  if (feeError && feeError.code !== 'PGRST116') {
    console.error('[db] lookupTokenByAddress query failed:', feeError.message);
  }

  if (!feeRecord) return null;

  // Fetch creator + wallet + fee recipient count in parallel
  const [{ data: creator }, { data: wallet }, { count: recipientCount }] = await Promise.all([
    supabase
      .from('creators')
      .select('twitter_handle, display_name')
      .eq('id', feeRecord.creator_id)
      .single(),
    supabase
      .from('wallets')
      .select('address')
      .eq('creator_id', feeRecord.creator_id)
      .eq('chain', feeRecord.chain)
      .limit(1)
      .single(),
    supabase
      .from('fee_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('fee_record_id', feeRecord.id),
  ]);

  return {
    creatorId: feeRecord.creator_id,
    platform: feeRecord.platform,
    chain: feeRecord.chain,
    tokenAddress: feeRecord.token_address,
    tokenSymbol: feeRecord.token_symbol,
    feeRecipient: wallet?.address ?? null,
    feeRecipientHandle: creator?.twitter_handle ?? creator?.display_name ?? null,
    totalEarned: feeRecord.total_earned,
    totalClaimed: feeRecord.total_claimed,
    totalUnclaimed: feeRecord.total_unclaimed,
    totalEarnedUsd: feeRecord.total_earned_usd,
    feeType: feeRecord.fee_type ?? null,
    feeLocked: feeRecord.fee_locked ?? null,
    feeRecipientCount: recipientCount ?? null,
  };
}

// ═══════════════════════════════════════════════
// Watched Tokens (for polling worker)
// ═══════════════════════════════════════════════

export interface WatchedToken {
  id: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  chain: Chain;
  platform: Platform;
  creatorId: string | null;
  feeRecipientAddress: string | null;
  snapshotEarned: string;
  snapshotClaimed: string;
  snapshotUnclaimed: string;
  snapshotEarnedUsd: number | null;
  lastCheckedAt: string;
}

export async function upsertWatchedToken(params: {
  tokenAddress: string;
  tokenSymbol: string | null;
  chain: Chain;
  platform: Platform;
  creatorId: string | null;
  feeRecipientAddress: string | null;
  snapshotEarned: string;
  snapshotClaimed: string;
  snapshotUnclaimed: string;
  snapshotEarnedUsd: number | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('watched_tokens')
    .upsert(
      {
        token_address: params.tokenAddress,
        token_symbol: params.tokenSymbol,
        chain: params.chain,
        platform: params.platform,
        creator_id: params.creatorId,
        fee_recipient_address: params.feeRecipientAddress,
        snapshot_earned: params.snapshotEarned,
        snapshot_claimed: params.snapshotClaimed,
        snapshot_unclaimed: params.snapshotUnclaimed,
        snapshot_earned_usd: params.snapshotEarnedUsd,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: 'token_address,chain' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[db] upsertWatchedToken error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function addGroupWatch(
  groupId: number,
  tokenId: string,
  messageId: number
): Promise<void> {
  const { error } = await supabase.from('group_watches').upsert(
    {
      group_id: groupId,
      token_id: tokenId,
      message_id: messageId,
    },
    { onConflict: 'group_id,token_id' }
  );
  if (error) {
    console.error('[db] addGroupWatch error:', error.message);
  }
}

export async function getWatchedTokensWithUnclaimed(): Promise<WatchedToken[]> {
  const { data, error } = await supabase
    .from('watched_tokens')
    .select('*')
    .neq('snapshot_unclaimed', '0');

  if (error) {
    console.error('[db] getWatchedTokensWithUnclaimed error:', error.message);
    return [];
  }

  const validated: WatchedToken[] = [];
  for (const row of data ?? []) {
    const chain = assertChain(row.chain);
    const platform = assertPlatform(row.platform);
    if (!chain || !platform) {
      console.warn(`[db] Skipping watched_token ${row.id}: unknown chain="${row.chain}" or platform="${row.platform}"`);
      continue;
    }
    validated.push({
      id: row.id,
      tokenAddress: row.token_address,
      tokenSymbol: row.token_symbol ?? null,
      chain,
      platform,
      creatorId: row.creator_id,
      feeRecipientAddress: row.fee_recipient_address,
      snapshotEarned: row.snapshot_earned,
      snapshotClaimed: row.snapshot_claimed,
      snapshotUnclaimed: row.snapshot_unclaimed,
      snapshotEarnedUsd: row.snapshot_earned_usd,
      lastCheckedAt: row.last_checked_at,
    });
  }
  return validated;
}

export async function getGroupsForToken(tokenId: string): Promise<Array<{ groupId: number; messageId: number | null }>> {
  const { data, error } = await supabase
    .from('group_watches')
    .select('group_id, message_id')
    .eq('token_id', tokenId);

  if (error) {
    console.error('[db] getGroupsForToken error:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    groupId: row.group_id,
    messageId: row.message_id,
  }));
}

export async function updateWatchedTokenSnapshot(
  id: string,
  snapshot: { earned: string; claimed: string; unclaimed: string; earnedUsd: number | null }
): Promise<void> {
  const { error } = await supabase
    .from('watched_tokens')
    .update({
      snapshot_earned: snapshot.earned,
      snapshot_claimed: snapshot.claimed,
      snapshot_unclaimed: snapshot.unclaimed,
      snapshot_earned_usd: snapshot.earnedUsd,
      last_checked_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('[db] updateWatchedTokenSnapshot error:', error.message);
  }
}

export async function removeWatchedToken(id: string): Promise<void> {
  const { error } = await supabase.from('watched_tokens').delete().eq('id', id);
  if (error) {
    console.error('[db] removeWatchedToken error:', error.message);
  }
}

export async function cleanupStaleWatches(maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await supabase
    .from('watched_tokens')
    .delete()
    .lt('last_checked_at', cutoff)
    .select('id');

  if (error) {
    console.error('[db] cleanupStaleWatches error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function logNotification(
  groupId: number,
  tokenAddress: string,
  type: 'scan_result' | 'claim_detected'
): Promise<void> {
  const { error } = await supabase.from('notification_log').insert({
    group_id: groupId,
    token_address: tokenAddress,
    notification_type: type,
  });
  if (error) {
    console.error('[db] logNotification error:', error.message);
  }
}

export async function cleanupOldNotifications(maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await supabase
    .from('notification_log')
    .delete()
    .lt('sent_at', cutoff)
    .select('id');

  if (error) {
    console.error('[db] cleanupOldNotifications error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function getGroupWatchCount(groupId: number): Promise<number> {
  const { count, error } = await supabase
    .from('group_watches')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if (error) {
    console.error('[db] getGroupWatchCount error:', error.message);
    return 0;
  }
  return count ?? 0;
}

// ═══════════════════════════════════════════════
// Alert Rules (threshold notifications)
// ═══════════════════════════════════════════════

export interface AlertRule {
  id: string;
  chatId: number;
  userId: number;
  creatorId: string;
  thresholdUsd: number;
  lastNotifiedAt: string | null;
  active: boolean;
}

export async function upsertAlertRule(params: {
  chatId: number;
  userId: number;
  creatorId: string;
  thresholdUsd: number;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('alert_rules')
    .upsert(
      {
        chat_id: params.chatId,
        user_id: params.userId,
        creator_id: params.creatorId,
        threshold_usd: params.thresholdUsd,
        active: true,
      },
      { onConflict: 'chat_id,creator_id' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[db] upsertAlertRule error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function getAlertRulesForChat(chatId: number): Promise<AlertRule[]> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*, creators(twitter_handle, display_name)')
    .eq('chat_id', chatId)
    .eq('active', true)
    .limit(50);

  if (error) {
    console.error('[db] getAlertRulesForChat error:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    chatId: row.chat_id as number,
    userId: row.user_id as number,
    creatorId: row.creator_id as string,
    thresholdUsd: Number(row.threshold_usd),
    lastNotifiedAt: row.last_notified_at as string | null,
    active: row.active as boolean,
  }));
}

export async function getActiveAlertRules(): Promise<
  Array<AlertRule & { creatorHandle: string | null }>
> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*, creators(twitter_handle, display_name)')
    .eq('active', true)
    .or(`last_notified_at.is.null,last_notified_at.lt.${oneDayAgo}`)
    .limit(100);

  if (error) {
    console.error('[db] getActiveAlertRules error:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const creator = row.creators as { twitter_handle?: string; display_name?: string } | null;
    return {
      id: row.id as string,
      chatId: row.chat_id as number,
      userId: row.user_id as number,
      creatorId: row.creator_id as string,
      thresholdUsd: Number(row.threshold_usd),
      lastNotifiedAt: row.last_notified_at as string | null,
      active: row.active as boolean,
      creatorHandle: creator?.twitter_handle ?? creator?.display_name ?? null,
    };
  });
}

export async function deleteAlertRule(chatId: number, creatorId: string): Promise<boolean> {
  const { error } = await supabase
    .from('alert_rules')
    .delete()
    .eq('chat_id', chatId)
    .eq('creator_id', creatorId);

  if (error) {
    console.error('[db] deleteAlertRule error:', error.message);
    return false;
  }
  return true;
}

export async function updateAlertLastNotified(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('alert_rules')
    .update({ last_notified_at: new Date().toISOString() })
    .eq('id', ruleId);

  if (error) {
    console.error('[db] updateAlertLastNotified error:', error.message);
  }
}

export async function getCreatorUnclaimedUsd(
  creatorId: string,
  prices: { sol: number; eth: number; bnb: number }
): Promise<number> {
  const { data, error } = await supabase
    .from('fee_records')
    .select('total_unclaimed, chain')
    .eq('creator_id', creatorId)
    .in('claim_status', ['unclaimed', 'partially_claimed']);

  if (error) {
    console.error('[db] getCreatorUnclaimedUsd error:', error.message);
    return 0;
  }

  const priceKey: Record<string, keyof typeof prices> = { sol: 'sol', base: 'eth', eth: 'eth', bsc: 'bnb' };
  let total = 0;
  for (const row of data ?? []) {
    const unclaimed = safeBigInt(row.total_unclaimed);
    if (unclaimed === 0n) continue;
    const decimals = CHAIN_CONFIG[row.chain as Chain]?.nativeDecimals ?? 18;
    total += toUsdValue(unclaimed, decimals, prices[priceKey[row.chain]] ?? 0);
  }
  return total;
}
