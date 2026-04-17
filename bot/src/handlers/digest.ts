import type { Context } from 'grammy';
import { getGroupSettings, upsertGroupSettings } from '../state/db';

/**
 * /digest command handler.
 * Usage:
 *   /digest on [HH]    — Enable daily digest at hour HH UTC (default 12)
 *   /digest off        — Disable digest
 *   /digest status     — Show current setting
 */
export async function handleDigest(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = (ctx.message?.text ?? '').trim();
  const parts = text.replace(/^\/digest\s*/, '').trim().split(/\s+/);
  const sub = (parts[0] ?? '').toLowerCase();

  if (sub === '' || sub === 'status') {
    const settings = await getGroupSettings(chatId);
    if (!settings?.digestEnabled) {
      await ctx.reply(
        'Digest is <b>off</b> for this chat.\n\nUse <code>/digest on [HH]</code> to enable daily summary.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    const hour = String(settings.digestHourUtc).padStart(2, '0');
    await ctx.reply(
      `Digest is <b>on</b>. Daily at <b>${hour}:00 UTC</b>.\n\nUse <code>/digest off</code> to disable.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (sub === 'off') {
    await upsertGroupSettings(chatId, { digestEnabled: false });
    await ctx.reply('Digest disabled.', { parse_mode: 'HTML' });
    return;
  }

  if (sub === 'on') {
    const hourArg = parts[1];
    let hour = 12;
    if (hourArg !== undefined) {
      const parsed = parseInt(hourArg, 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 23) {
        await ctx.reply('Hour must be 0-23 (UTC). Example: <code>/digest on 15</code>', { parse_mode: 'HTML' });
        return;
      }
      hour = parsed;
    }
    await upsertGroupSettings(chatId, { digestEnabled: true, digestHourUtc: hour });
    const hourStr = String(hour).padStart(2, '0');
    await ctx.reply(
      `Digest enabled. I\'ll post a summary daily at <b>${hourStr}:00 UTC</b>.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  await ctx.reply(
    'Usage:\n<code>/digest on [HH]</code>  Enable at hour HH UTC (0-23, default 12)\n' +
    '<code>/digest off</code>        Disable\n' +
    '<code>/digest status</code>     Show current setting',
    { parse_mode: 'HTML' }
  );
}
