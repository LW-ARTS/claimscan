import type { Context, NextFunction } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { bot } from '../bot';

const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL ?? '@lwarts';
const CHANNEL_URL = `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}`;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const JOIN_BUTTONS: InlineKeyboardButton[][] = [
  [{ text: '📢 Join Channel', url: CHANNEL_URL }],
  [{ text: '✅ I joined', callback_data: 'check_joined' }],
];

// Cache membership checks to avoid hitting Telegram API rate limits
const memberCache = new Map<number, { isMember: boolean; expiresAt: number }>();

function getCachedMembership(userId: number): boolean | null {
  const entry = memberCache.get(userId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    memberCache.delete(userId);
    return null;
  }
  return entry.isMember;
}

function cacheMembership(userId: number, isMember: boolean): void {
  memberCache.set(userId, { isMember, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function checkMembership(userId: number): Promise<boolean> {
  // Check cache first
  const cached = getCachedMembership(userId);
  if (cached !== null) return cached;

  try {
    const member = await bot.api.getChatMember(REQUIRED_CHANNEL, userId);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);
    // Only cache positive results — non-members should re-check live on every message
    // so they get through immediately after joining without waiting for cache expiry
    if (isMember) cacheMembership(userId, true);
    return isMember;
  } catch (err) {
    console.warn('[require-channel] Membership check failed, allowing access:', err instanceof Error ? err.message : err);
    return true;
  }
}

// Periodic cleanup of expired cache entries (every 10 minutes)
const cacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memberCache) {
    if (now >= entry.expiresAt) memberCache.delete(key);
  }
}, 10 * 60 * 1000);
cacheCleanupTimer.unref();

export async function requireChannel(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const isMember = await checkMembership(userId);
  if (isMember) return next();

  // Not a member — handle differently for callback queries vs messages
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: '🔒 Join the channel first to use this bot.' });
    return;
  }

  await ctx.reply(
    `🔒 <b>Join our channel to use ClaimScan Bot</b>\n\nYou need to be a member of <b>${REQUIRED_CHANNEL}</b> to use this bot.`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: JOIN_BUTTONS },
    }
  );
}

export async function handleCheckJoined(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Force fresh check (bypass cache)
  memberCache.delete(userId);
  const isMember = await checkMembership(userId);

  if (isMember) {
    await ctx.answerCallbackQuery({ text: '✅ Verified! You can use the bot now.' });
    try {
      await ctx.editMessageText(
        '✅ <b>Verified!</b> You\'re a member. Use /start to begin.',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.warn('[require-channel] Could not edit message:', err instanceof Error ? err.message : err);
    }
  } else {
    await ctx.answerCallbackQuery({ text: '❌ You haven\'t joined yet.' });
  }
}
