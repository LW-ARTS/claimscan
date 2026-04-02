import type { Context } from 'grammy';
import type { Chain } from '@/lib/supabase/types';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';
import { isOnCooldown, setCooldown, isGroupRateLimited } from '../state/cooldowns';
import { lookupToken } from '../services/lookup';
import { formatCaScanMessage } from '../services/format';
import { addGroupWatch } from '../state/db';
import { getMention } from '../utils';

// Solana: base58 address pattern (32-44 chars, no 0/O/I/l)
const SOLANA_CA_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
// EVM: 0x-prefixed hex address (Base, BSC, ETH share same format)
const EVM_CA_REGEX = /\b0x[a-fA-F0-9]{40}\b/g;
// Strip URLs to avoid false positive matches inside links
const URL_REGEX = /https?:\/\/\S+/gi;

export async function handleCaDetect(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  // Skip commands
  if (text.startsWith('/')) return;

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Remove URLs before scanning for addresses to avoid false positives
  const cleaned = text.replace(URL_REGEX, ' ');

  // Extract all candidate addresses
  const candidates: Array<{ address: string; chain: Chain | 'evm' }> = [];

  const solMatches = cleaned.match(SOLANA_CA_REGEX);
  if (solMatches) {
    for (const match of solMatches) {
      if (isValidSolanaAddress(match)) {
        candidates.push({ address: match, chain: 'sol' });
      }
    }
  }

  const evmMatches = cleaned.match(EVM_CA_REGEX);
  if (evmMatches) {
    for (const match of evmMatches) {
      if (isValidEvmAddress(match)) {
        candidates.push({ address: match, chain: 'evm' });
      }
    }
  }

  if (candidates.length === 0) return;

  // Process first valid candidate only (avoid spam)
  for (const { address, chain } of candidates) {
    if (isOnCooldown(chatId, address)) continue;

    // Check group rate limit only when we actually have a fresh CA to look up
    if (isGroupRateLimited(chatId)) return;

    // Set cooldown immediately to prevent concurrent lookups for same CA
    setCooldown(chatId, address);

    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    try {
      await ctx.replyWithChatAction('typing');
      const result = await lookupToken(address, chain);
      if (!result) continue; // Not a supported launchpad token — stay silent

      const { message, buttons } = formatCaScanMessage(result);

      // In groups, mention the user who pasted the CA
      const prefix = isGroup ? `${getMention(ctx)}\n\n` : '';

      const sent = await ctx.reply(prefix + message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
        link_preview_options: { is_disabled: true },
        ...(isGroup && ctx.message?.message_id
          ? { reply_parameters: { message_id: ctx.message.message_id } }
          : {}),
      });

      // Auto-track if unclaimed > 0
      if (result.hasUnclaimed && result.watchedTokenId) {
        await addGroupWatch(chatId, result.watchedTokenId, sent.message_id);
      }
    } catch (err) {
      console.error(`[ca-detect] Failed to process ${address}:`, err instanceof Error ? err.message : err);
    }

    // Only process one CA per message
    return;
  }
}
