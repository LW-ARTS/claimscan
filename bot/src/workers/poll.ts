import { bot } from '../bot';
import { GrammyError } from 'grammy';
import { getAdapter } from '@/lib/platforms/index';
import { getNativeTokenPrices } from '@/lib/prices/index';
import { CHAIN_CONFIG } from '@/lib/constants';
import { createServiceClient } from '@/lib/supabase/service';
import { safeBigInt, toUsdValue } from '@/lib/utils';
import type { Chain } from '@/lib/supabase/types';
import {
  getWatchedTokensWithUnclaimed,
  getGroupsForToken,
  updateWatchedTokenSnapshot,
  removeWatchedToken,
  cleanupStaleWatches,
  cleanupOldNotifications,
  logNotification,
  getActiveAlertRules,
  getCreatorUnclaimedUsd,
  updateAlertLastNotified,
} from '../state/db';
import { formatClaimNotification } from '../services/format';
import type { WatchedToken } from '../state/db';

type Prices = { sol: number; eth: number; bnb: number };
const PRICE_KEY: Record<string, keyof Prices> = { sol: 'sol', base: 'eth', eth: 'eth', bsc: 'bnb' };

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const POLL_CONCURRENCY = 5; // max concurrent platform checks
const CIRCUIT_BREAKER_THRESHOLD = 3; // consecutive failures to trip
const CIRCUIT_BREAKER_COOLDOWN_MS = 15 * 60 * 1000; // 15 min skip after trip

// Per-platform circuit breaker state
const platformFailures = new Map<string, { count: number; trippedAt: number | null }>();

function isPlatformTripped(platform: string): boolean {
  const state = platformFailures.get(platform);
  if (!state?.trippedAt) return false;
  if (Date.now() - state.trippedAt >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    platformFailures.set(platform, { count: 0, trippedAt: null });
    return false;
  }
  return true;
}

function recordPlatformFailure(platform: string): void {
  const state = platformFailures.get(platform) ?? { count: 0, trippedAt: null };
  state.count++;
  if (state.count >= CIRCUIT_BREAKER_THRESHOLD) {
    state.trippedAt = Date.now();
    console.warn(`[poll] Circuit breaker tripped for ${platform} (${state.count} consecutive failures)`);
  }
  platformFailures.set(platform, state);
}

function recordPlatformSuccess(platform: string): void {
  platformFailures.set(platform, { count: 0, trippedAt: null });
}

interface PollHandle {
  stop: () => void;
}

/** Check alert rules and send threshold notifications */
async function checkAlertRules(): Promise<void> {
  const rules = await getActiveAlertRules();
  if (rules.length === 0) return;

  const prices = await getNativeTokenPrices();
  console.log(`[poll] Checking ${rules.length} alert rule(s)...`);
  let sent = 0;

  for (const rule of rules) {
    try {
      const totalUnclaimed = await getCreatorUnclaimedUsd(rule.creatorId, prices);
      if (totalUnclaimed >= rule.thresholdUsd) {
        const handle = rule.creatorHandle ?? rule.creatorId.slice(0, 8);
        const msg = [
          `<b>⚠️ Fee Alert</b>`,
          ``,
          `<b>@${handle}</b> has <b>$${totalUnclaimed.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b> in unclaimed fees.`,
          `Your threshold: $${rule.thresholdUsd.toLocaleString()}`,
          ``,
          `<a href="https://claimscan.tech/${handle}">View on ClaimScan →</a>`,
        ].join('\n');

        await bot.api.sendMessage(rule.chatId, msg, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        await updateAlertLastNotified(rule.id);
        sent++;
      }
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) {
        // Bot was removed from chat — deactivate rule silently
        console.warn(`[poll] Alert rule ${rule.id}: bot removed from chat ${rule.chatId}`);
      } else {
        console.warn(`[poll] Alert rule ${rule.id} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  if (sent > 0) {
    console.log(`[poll] Sent ${sent} threshold alert(s)`);
  }
}

// Counter to run alert checks every 3rd cycle (15 min instead of 5 min)
let alertCycleCounter = 0;

export function startPolling(): PollHandle {
  let running = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function pollCycle() {
    if (!running) return;

    const cycleStart = Date.now();
    console.log('[poll] Starting poll cycle...');

    try {
      const tokens = await getWatchedTokensWithUnclaimed();
      if (tokens.length === 0) {
        console.log('[poll] No tokens to check');
      } else {
        console.log(`[poll] Checking ${tokens.length} watched token(s)...`);
        const prices = await getNativeTokenPrices();
        await checkTokens(tokens, prices);
      }

      // Check alert rules every 3rd cycle (15 min)
      alertCycleCounter++;
      if (alertCycleCounter >= 3) {
        alertCycleCounter = 0;
        await checkAlertRules();
      }

      const removed = await cleanupStaleWatches(STALE_THRESHOLD_MS);
      if (removed > 0) {
        console.log(`[poll] Cleaned up ${removed} stale watch(es)`);
      }

      const notifRemoved = await cleanupOldNotifications(NOTIFICATION_RETENTION_MS);
      if (notifRemoved > 0) {
        console.log(`[poll] Cleaned up ${notifRemoved} old notification(s)`);
      }
    } catch (err) {
      console.error('[poll] Cycle failed:', err instanceof Error ? err.message : err);
    }

    if (running) {
      const elapsed = Date.now() - cycleStart;
      const delay = Math.max(0, POLL_INTERVAL_MS - elapsed);
      timeoutId = setTimeout(pollCycle, delay);
    }
  }

  timeoutId = setTimeout(pollCycle, 10_000);

  return {
    stop: () => {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

// Process tokens concurrently in batches of POLL_CONCURRENCY
async function checkTokens(
  tokens: WatchedToken[],
  prices: Prices
): Promise<void> {
  const queue = tokens.filter((t) => t.feeRecipientAddress && !isPlatformTripped(t.platform));

  if (queue.length < tokens.length) {
    const skipped = tokens.length - queue.length;
    console.log(`[poll] Skipped ${skipped} token(s) (circuit breaker or no recipient)`);
  }

  for (let i = 0; i < queue.length; i += POLL_CONCURRENCY) {
    const batch = queue.slice(i, i + POLL_CONCURRENCY);
    await Promise.allSettled(batch.map((token) => checkSingleToken(token, prices)));
  }
}

async function checkSingleToken(
  token: WatchedToken,
  prices: Prices
): Promise<void> {
  try {
    const adapter = getAdapter(token.platform);
    if (!adapter?.supportsLiveFees) return;

    const fees = await adapter.getLiveUnclaimedFees(token.feeRecipientAddress!);

    // Adapter call succeeded -- reset circuit breaker for this platform
    recordPlatformSuccess(token.platform);

    const tokenFee = fees.find((f) =>
      f.tokenAddress.toLowerCase() === token.tokenAddress.toLowerCase()
    );

    if (!tokenFee) {
      // Token not found -- do NOT update last_checked_at so stale cleanup can fire
      return;
    }

    const oldClaimed = safeBigInt(token.snapshotClaimed);
    const newClaimed = safeBigInt(tokenFee.totalClaimed);
    const newUnclaimed = safeBigInt(tokenFee.totalUnclaimed);

    // Detect claim: claimed amount increased
    if (newClaimed > oldClaimed) {
      const claimedDelta = (newClaimed - oldClaimed).toString();
      await notifyGroups(token, claimedDelta, tokenFee.totalUnclaimed, prices);
    }

    // Update snapshot
    const nativeDecimals = CHAIN_CONFIG[token.chain].nativeDecimals;
    const nativePrice = prices[PRICE_KEY[token.chain]] ?? 0;
    const earned = safeBigInt(tokenFee.totalEarned);
    const earnedUsd = earned > 0n
      ? toUsdValue(earned, nativeDecimals, nativePrice)
      : token.snapshotEarnedUsd;

    await updateWatchedTokenSnapshot(token.id, {
      earned: tokenFee.totalEarned,
      claimed: tokenFee.totalClaimed,
      unclaimed: tokenFee.totalUnclaimed,
      earnedUsd,
    });

    // Fully claimed -- remove from watchlist
    if (newUnclaimed === 0n) {
      console.log(`[poll] Token ${token.tokenAddress} fully claimed -- removing from watchlist`);
      await removeWatchedToken(token.id);
    }
  } catch (err) {
    recordPlatformFailure(token.platform);
    console.warn(
      `[poll] Failed to check ${token.platform}:${token.tokenAddress}:`,
      err instanceof Error ? err.message : err
    );
  }
}

// Retry helper with exponential backoff for Telegram API calls
async function sendWithRetry(
  groupId: number,
  message: string,
  options: Parameters<typeof bot.api.sendMessage>[2],
  maxRetries = 3
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await bot.api.sendMessage(groupId, message, options);
      return;
    } catch (err: unknown) {
      if (err instanceof GrammyError && err.error_code === 429 && attempt < maxRetries) {
        const retryAfter = err.parameters?.retry_after ?? 5;
        const delay = retryAfter * 1000;
        console.warn(`[poll] Telegram 429 for group ${groupId}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Not retryable or exhausted retries
      throw err;
    }
  }
}

async function notifyGroups(
  token: WatchedToken,
  claimedAmount: string,
  remainingUnclaimed: string,
  prices: Prices
): Promise<void> {
  const groups = await getGroupsForToken(token.id);
  if (groups.length === 0) return;

  const chainConf = CHAIN_CONFIG[token.chain];
  const nativeSymbol = chainConf.nativeToken;
  const nativeDecimals = chainConf.nativeDecimals;
  const nativeUsdPrice = prices[PRICE_KEY[token.chain]] ?? 0;

  // Get handle for display
  let feeRecipientHandle: string | null = null;
  if (token.creatorId) {
    try {
      const supabase = createServiceClient();
      const { data: creator } = await supabase
        .from('creators')
        .select('twitter_handle, display_name')
        .eq('id', token.creatorId)
        .single();
      feeRecipientHandle = creator?.twitter_handle ?? creator?.display_name ?? null;
    } catch { /* ignore */ }
  }

  const { message, buttons } = formatClaimNotification({
    tokenAddress: token.tokenAddress,
    tokenSymbol: token.tokenSymbol,
    feeRecipientHandle,
    feeRecipientAddress: token.feeRecipientAddress,
    platform: token.platform,
    claimedAmount,
    nativeSymbol,
    nativeDecimals,
    nativeUsdPrice,
    remainingUnclaimed,
    chain: token.chain,
  });

  for (const { groupId } of groups) {
    try {
      await sendWithRetry(groupId, message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
        link_preview_options: { is_disabled: true },
      });
      await logNotification(groupId, token.tokenAddress, 'claim_detected');
    } catch (err) {
      // Prune groups that permanently reject the bot (403 = kicked/banned)
      if (err instanceof GrammyError && err.error_code === 403) {
        console.warn(`[poll] Bot removed from group ${groupId} — pruning from group_watches`);
        try {
          const supabase = createServiceClient();
          await supabase.from('group_watches').delete().eq('group_id', groupId);
        } catch { /* best effort */ }
      } else {
        console.warn(`[poll] Failed to notify group ${groupId}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}
