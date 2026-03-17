import type { Context } from 'grammy';
import { GrammyError } from 'grammy';
import { resolveAndPersistCreator } from '@/lib/services/creator';
import { getNativeTokenPrices } from '@/lib/prices/index';
import { isScanOnCooldown, setScanCooldown } from '../state/cooldowns';
import { escapeHtml, formatScanSummary } from '../services/format';
import { getMention, isGroup } from '../utils';

const SCAN_TIMEOUT_MS = 30_000;
const MAX_HANDLE_LEN = 100;
const HANDLE_REGEX = /^[\w.\-]+$/;

export async function handleScan(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  const userId = ctx.from?.id;
  if (userId && isScanOnCooldown(userId)) {
    await ctx.reply('⏳ Please wait 30s between scans.', { parse_mode: 'HTML' });
    return;
  }

  const parts = text.split(/\s+/);
  const rawQuery = parts.slice(1).join(' ').trim();

  if (!rawQuery) {
    await ctx.reply(
      '💡 <b>Usage:</b> <code>/scan @handle</code>\n\nExample: <code>/scan @elonmusk</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const query = rawQuery.startsWith('@') ? rawQuery.slice(1) : rawQuery;

  if (query.length > MAX_HANDLE_LEN || !HANDLE_REGEX.test(query)) {
    await ctx.reply('❌ Invalid handle format.', { parse_mode: 'HTML' });
    return;
  }

  const inGroup = isGroup(ctx);

  await ctx.replyWithChatAction('typing');

  // Only show loading message in DMs — groups just get typing indicator
  let scanningMsgId: number | null = null;
  if (!inGroup) {
    const scanning = await ctx.reply(
      `🔍 Scanning <b>@${escapeHtml(query)}</b>...\n\nResolving wallets and checking 10 platforms. This may take up to 30s.`,
      { parse_mode: 'HTML' }
    );
    scanningMsgId = scanning.message_id;
  }

  try {
    let timeoutId: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      resolveAndPersistCreator(query),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('scan timeout')), SCAN_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timeoutId!));

    // Set cooldown after resolve completes (success or empty) to prevent DoS
    if (userId) setScanCooldown(userId);

    // Delete loading message in DMs
    if (scanningMsgId) await deleteSafe(ctx, scanningMsgId);

    if (!result.creator || result.fees.length === 0) {
      await ctx.reply(
        `❌ No results for <b>@${escapeHtml(query)}</b>\n\n` +
        `Handle might be wrong, or the creator has no launchpad activity. Try a different handle or paste a CA directly.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const prices = await getNativeTokenPrices();

    const { message, buttons } = formatScanSummary(
      result.creator.twitter_handle ?? result.creator.display_name ?? query,
      result.fees,
      prices.sol,
      prices.eth
    );

    // In groups, mention the user who ran /scan
    const prefix = inGroup ? `${getMention(ctx)}\n\n` : '';

    await ctx.reply(prefix + message, {
      parse_mode: 'HTML',
      reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
      link_preview_options: { is_disabled: true },
      ...(inGroup && ctx.message?.message_id
        ? { reply_parameters: { message_id: ctx.message.message_id } }
        : {}),
    });
  } catch (err) {
    // Set cooldown even on failure to prevent DoS via repeated timeouts
    if (userId) setScanCooldown(userId);
    console.error('[scan] Failed:', err instanceof Error ? err.message : err);
    if (scanningMsgId) await deleteSafe(ctx, scanningMsgId);
    await ctx.reply(
      '⚠️ Scan failed — RPCs might be congested. Try again in a few seconds.',
      { parse_mode: 'HTML' }
    );
  }
}

async function deleteSafe(ctx: Context, messageId: number): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch (err) {
    if (!(err instanceof GrammyError)) {
      console.warn('[scan] Unexpected error deleting message:', err instanceof Error ? err.message : err);
    }
  }
}
