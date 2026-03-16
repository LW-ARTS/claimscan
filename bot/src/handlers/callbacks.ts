import type { Context } from 'grammy';
import { GrammyError } from 'grammy';
import { isRefreshOnCooldown, setRefreshCooldown } from '../state/cooldowns';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';
import { lookupToken } from '../services/lookup';
import { formatCaScanMessage } from '../services/format';
import type { Chain } from '@/lib/supabase/types';

const VALID_CHAINS = new Set<string>(['sol', 'base']);

export async function handleCallbacks(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data.startsWith('refresh:')) {
    await handleRefresh(ctx, data);
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Unknown action' });
}

async function handleRefresh(ctx: Context, data: string): Promise<void> {
  const parts = data.split(':');
  if (parts.length !== 3) {
    await ctx.answerCallbackQuery({ text: 'Invalid data' });
    return;
  }

  const [, tokenAddress, chain] = parts;

  if (!VALID_CHAINS.has(chain)) {
    await ctx.answerCallbackQuery({ text: 'Unsupported chain' });
    return;
  }

  // Validate token address format before any RPC/DB call
  const isValid = chain === 'sol' ? isValidSolanaAddress(tokenAddress) : isValidEvmAddress(tokenAddress);
  if (!isValid) {
    await ctx.answerCallbackQuery({ text: 'Invalid token address' });
    return;
  }

  const messageId = ctx.callbackQuery?.message?.message_id;

  if (messageId && isRefreshOnCooldown(messageId)) {
    await ctx.answerCallbackQuery({ text: 'Please wait 30s before refreshing again' });
    return;
  }

  if (messageId) setRefreshCooldown(messageId);

  // Answer immediately to avoid Telegram's 10s callback deadline
  await ctx.answerCallbackQuery();

  try {
    const result = await lookupToken(tokenAddress, chain as Chain);
    if (!result) return;

    const { message, buttons } = formatCaScanMessage(result);

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    // "message is not modified" means data is unchanged — not an error
    if (err instanceof GrammyError && err.description?.includes('message is not modified')) {
      return;
    }
    console.error('[callback] Refresh failed:', err instanceof Error ? err.message : err);
  }
}
