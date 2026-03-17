import { Agent } from 'undici';
import { Bot, GrammyError, HttpError } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

// Force IPv4 for Telegram API requests.
// Node 22 Happy Eyeballs tries IPv6 first, which fails/times out
// on VPS providers without proper IPv6 routing.
const ipv4Agent = new Agent({ connect: { family: 4 } });

export const bot = new Bot(token, {
  client: {
    baseFetchConfig: {
      // @ts-expect-error — grammY passes this to fetch()
      dispatcher: ipv4Agent,
    },
  },
});

// Global error handler — log and recover, never crash
bot.catch(async (err) => {
  const ctx = err.ctx;
  const e = err.error;

  console.error(`[bot] Error handling update ${ctx.update.update_id}:`);

  if (e instanceof GrammyError) {
    console.error('[bot] grammY API error:', e.description);
  } else if (e instanceof HttpError) {
    console.error('[bot] HTTP error:', e);
  } else if (e instanceof Error) {
    console.error('[bot] Error:', e.message);
  } else {
    console.error('[bot] Unknown error:', e);
  }

  // Best-effort user feedback so they don't get silence
  try {
    await ctx.reply('Something went wrong. Please try again in a moment.');
  } catch { /* if even the reply fails, nothing more to do */ }
});
