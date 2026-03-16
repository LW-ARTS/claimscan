import type { Context } from 'grammy';
import { getGroupWatchCount } from '../state/db';

export async function handleStats(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const count = await getGroupWatchCount(chatId);

    if (count === 0) {
      await ctx.reply(
        '📊 <b>No tokens tracked yet.</b>\n\nPaste a CA to start tracking.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    await ctx.reply(
      `📊 <b>${count} token${count !== 1 ? 's' : ''}</b> tracked in this group.\n\nYou'll be notified when creators claim fees.`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('[stats] Failed:', err instanceof Error ? err.message : err);
    await ctx.reply('⚠️ Failed to fetch stats — try again.');
  }
}
