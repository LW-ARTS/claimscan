import type { Context } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';

const APP_URL_BASE = process.env.CLAIMSCAN_APP_BASE ?? 'https://claimscan.tech';
const HANDLE_REGEX = /^[\w.\-]+$/;
const MAX_HANDLE_LEN = 100;

/**
 * /app command — opens ClaimScan as a Telegram Mini App (in-app webview).
 * Usage:
 *   /app              — open home
 *   /app @handle      — open creator profile
 */
export async function handleApp(ctx: Context): Promise<void> {
  const text = (ctx.message?.text ?? '').trim();
  const parts = text.replace(/^\/app\s*/, '').trim();
  const handle = parts.replace(/^@/, '').trim();

  let targetUrl = APP_URL_BASE;
  let label = 'Open ClaimScan';

  if (handle) {
    if (handle.length > MAX_HANDLE_LEN || !HANDLE_REGEX.test(handle)) {
      await ctx.reply('Invalid handle. Use <code>/app @handle</code> or just <code>/app</code>.', {
        parse_mode: 'HTML',
      });
      return;
    }
    targetUrl = `${APP_URL_BASE}/${encodeURIComponent(handle)}`;
    label = `Open @${handle}`;
  }

  const buttons: InlineKeyboardButton[][] = [[
    { text: `📱 ${label}`, web_app: { url: targetUrl } },
  ]];

  await ctx.reply(
    handle
      ? `Tap to open <b>@${handle}</b>\'s profile as a Mini App.`
      : 'Tap to open ClaimScan as a Mini App.',
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    }
  );
}
