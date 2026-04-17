import type { Context } from 'grammy';
import type { InlineQueryResult, InlineKeyboardButton } from 'grammy/types';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';
import { lookupTokenByAddress } from '../state/db';
import { escapeHtml } from '../services/format';
import { CHAIN_CONFIG, PLATFORM_CONFIG } from '@/lib/constants';
import { safeBigInt, toUsdValue } from '@/lib/utils';
import { getNativeTokenPrices } from '@/lib/prices/index';
import type { Chain } from '@/lib/supabase/types';

const CLAIMSCAN_URL = 'https://claimscan.tech';
const CACHE_TIME_SECONDS = 60;

// Per-user debounce (Telegram sends inline_query on every keystroke)
const lastQueryAt = new Map<number, number>();
const DEBOUNCE_MS = 500;
const USER_CACHE_MAX = 5000;

function fmtUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function fmtNative(rawAmount: string, decimals: number): string {
  const raw = safeBigInt(rawAmount);
  if (raw === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  if (remainder === 0n) return `${whole}`;
  const frac = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${frac.slice(0, 4)}`;
}

function truncAddr(a: string): string {
  return a.length <= 12 ? a : `${a.slice(0, 4)}...${a.slice(-4)}`;
}

function detectChain(address: string): Chain | null {
  if (isValidSolanaAddress(address)) return 'sol';
  if (isValidEvmAddress(address)) return 'base'; // default for EVM; lookupTokenByAddress searches across chains
  return null;
}

function emptyResult(query: string): InlineQueryResult[] {
  const searchUrl = `${CLAIMSCAN_URL}/search?q=${encodeURIComponent(query)}`;
  return [
    {
      type: 'article',
      id: 'no-match',
      title: 'No CA or handle match',
      description: 'Tap to search on claimscan.tech',
      input_message_content: {
        message_text: `🔎 No ClaimScan data for <code>${escapeHtml(query.slice(0, 64))}</code>\n\nSearch: ${searchUrl}`,
        parse_mode: 'HTML',
      },
      reply_markup: {
        inline_keyboard: [[{ text: '🌐 Search ClaimScan', url: searchUrl }]],
      },
    },
  ];
}

function helpResult(): InlineQueryResult[] {
  return [
    {
      type: 'article',
      id: 'help',
      title: 'ClaimScan inline mode',
      description: 'Paste a token CA (Solana/Base/BSC/ETH) or @handle',
      input_message_content: {
        message_text: '🔎 Use ClaimScan inline by typing a CA or @handle after <code>@ClaimScanBOT</code>.',
        parse_mode: 'HTML',
      },
    },
  ];
}

export async function handleInline(ctx: Context): Promise<void> {
  const q = ctx.inlineQuery?.query?.trim() ?? '';
  const userId = ctx.inlineQuery?.from?.id;

  // Rate limit per user (debounce keystrokes)
  if (userId) {
    const now = Date.now();
    const last = lastQueryAt.get(userId) ?? 0;
    if (now - last < DEBOUNCE_MS) return; // silently drop
    lastQueryAt.set(userId, now);
    // Bound memory
    if (lastQueryAt.size > USER_CACHE_MAX) {
      const firstKey = lastQueryAt.keys().next().value;
      if (firstKey !== undefined) lastQueryAt.delete(firstKey);
    }
  }

  if (!q) {
    await ctx.answerInlineQuery(helpResult(), { cache_time: CACHE_TIME_SECONDS, is_personal: false });
    return;
  }

  // Only support CA lookup via inline (handle resolve is too slow for 10s deadline)
  const address = q.replace(/[@\s]/g, '').trim();
  const chain = detectChain(address);

  if (!chain) {
    await ctx.answerInlineQuery(emptyResult(q), { cache_time: 10, is_personal: false });
    return;
  }

  try {
    const [result, prices] = await Promise.all([
      lookupTokenByAddress(address, chain === 'sol' ? 'sol' : undefined),
      getNativeTokenPrices(),
    ]);

    if (!result) {
      await ctx.answerInlineQuery(emptyResult(q), { cache_time: 10, is_personal: false });
      return;
    }

    const chainConf = CHAIN_CONFIG[result.chain];
    const d = chainConf.nativeDecimals;
    const sym = chainConf.nativeToken;
    const priceKey: Record<string, keyof typeof prices> = { sol: 'sol', base: 'eth', eth: 'eth', bsc: 'bnb' };
    const price = prices[priceKey[result.chain]] ?? 0;

    const earned = safeBigInt(result.totalEarned);
    const claimed = safeBigInt(result.totalClaimed);
    const unclaimed = safeBigInt(result.totalUnclaimed);
    const earnedUsd = toUsdValue(earned, d, price);
    const claimedUsd = toUsdValue(claimed, d, price);
    const unclaimedUsd = toUsdValue(unclaimed, d, price);

    const tkn = result.tokenSymbol ? `$${result.tokenSymbol}` : truncAddr(result.tokenAddress);
    const platformName = PLATFORM_CONFIG[result.platform]?.name ?? result.platform;

    let msg = `<b>🔎 ${escapeHtml(tkn)}</b>  ·  ${platformName}  ·  ${chainConf.name}\n`;
    msg += `<code>${result.tokenAddress}</code>\n`;
    if (result.feeRecipientHandle) msg += `\n👤 <b>@${escapeHtml(result.feeRecipientHandle)}</b>\n`;
    msg += `\n💰 Earned       <b>${fmtNative(result.totalEarned, d)} ${sym}</b>  ~${fmtUsd(earnedUsd)}\n`;
    msg += `✅ Claimed       <b>${fmtNative(result.totalClaimed, d)} ${sym}</b>  ~${fmtUsd(claimedUsd)}\n`;
    msg += `🔓 Unclaimed   <b>${fmtNative(result.totalUnclaimed, d)} ${sym}</b>  ~${fmtUsd(unclaimedUsd)}`;

    const buttons: InlineKeyboardButton[][] = [[
      { text: '🌐 ClaimScan', url: result.feeRecipientHandle
        ? `${CLAIMSCAN_URL}/${encodeURIComponent(result.feeRecipientHandle)}`
        : CLAIMSCAN_URL },
    ]];

    const description = [
      `${platformName} · ${chainConf.name}`,
      `Unclaimed ${fmtUsd(unclaimedUsd)}`,
      result.feeRecipientHandle ? `@${result.feeRecipientHandle}` : null,
    ].filter(Boolean).join(' · ');

    const article: InlineQueryResult = {
      type: 'article',
      id: `ca:${result.tokenAddress}:${result.chain}`.slice(0, 64),
      title: `${tkn} — ${fmtUsd(unclaimedUsd)} unclaimed`,
      description,
      input_message_content: {
        message_text: msg,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
      reply_markup: { inline_keyboard: buttons },
    };

    await ctx.answerInlineQuery([article], {
      cache_time: CACHE_TIME_SECONDS,
      is_personal: false,
    });
  } catch (err) {
    console.error('[inline] lookup failed:', err instanceof Error ? err.message : err);
    await ctx.answerInlineQuery(emptyResult(q), { cache_time: 5, is_personal: false });
  }
}
