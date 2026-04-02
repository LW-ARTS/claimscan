import type { InlineKeyboardButton } from 'grammy/types';
import type { LookupResult } from './lookup';
import type { Platform, Chain } from '@/lib/supabase/types';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { safeBigInt, toUsdValue } from '@/lib/utils';

const CLAIMSCAN_URL = 'https://claimscan.tech';

const EXPLORER_URLS: Record<string, string> = {
  sol: 'https://solscan.io/account/',
  base: 'https://basescan.org/address/',
  eth: 'https://etherscan.io/address/',
  bsc: 'https://bscscan.com/address/',
};

function truncAddr(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function fmtUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
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

function nativeUsd(rawAmount: string, decimals: number, price: number): number {
  return toUsdValue(safeBigInt(rawAmount), decimals, price);
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════
// CA Scan Response
// ═══════════════════════════════════════════════

export function formatCaScanMessage(result: LookupResult): {
  message: string;
  buttons: InlineKeyboardButton[][];
} {
  const d = CHAIN_CONFIG[result.chain].nativeDecimals;
  const sym = result.nativeSymbol;
  const tkn = result.tokenSymbol ? `$${result.tokenSymbol}` : truncAddr(result.tokenAddress);

  const earnedN = fmtNative(result.totalEarned, d);
  const claimedN = fmtNative(result.totalClaimed, d);
  const unclaimedN = fmtNative(result.totalUnclaimed, d);

  const earnedU = fmtUsd(nativeUsd(result.totalEarned, d, result.nativeUsdPrice));
  const claimedU = fmtUsd(nativeUsd(result.totalClaimed, d, result.nativeUsdPrice));
  const unclaimedU = fmtUsd(nativeUsd(result.totalUnclaimed, d, result.nativeUsdPrice));

  let msg = `<b>🔎 ${escapeHtml(tkn)}</b>  ·  ${result.platformName}  ·  ${result.chainName}\n`;
  msg += `<code>${result.tokenAddress}</code>\n`;

  if (result.feeRecipientHandle && result.feeRecipient) {
    msg += `\n👤 <b>@${escapeHtml(result.feeRecipientHandle)}</b>  ·  <code>${truncAddr(result.feeRecipient)}</code>\n`;
  } else if (result.feeRecipientHandle) {
    msg += `\n👤 <b>@${escapeHtml(result.feeRecipientHandle)}</b>\n`;
  } else if (result.feeRecipient) {
    msg += `\n👤 <code>${truncAddr(result.feeRecipient)}</code>\n`;
  }

  if (result.feeType === 'cashback') {
    msg += `\n💰 Total Earned    <b>${earnedN} ${sym}</b>  ~${earnedU}`;
    msg += `\n🔄 <i>Auto-distributed — fees sent directly to holders</i>`;
  } else {
    msg += `\n💰 Earned        <b>${earnedN} ${sym}</b>  ~${earnedU}\n`;
    msg += `✅ Claimed        <b>${claimedN} ${sym}</b>  ~${claimedU}\n`;
    msg += `🔓 Unclaimed    <b>${unclaimedN} ${sym}</b>  ~${unclaimedU}`;
  }

  const tags: string[] = [];
  if (result.feeLocked) tags.push('🔒 Locked');
  if (result.feeRecipientCount && result.feeRecipientCount > 1)
    tags.push(`👥 ${result.feeRecipientCount} recipients`);
  if (tags.length > 0) msg += `\n${tags.join('  ·  ')}`;

  const buttons: InlineKeyboardButton[][] = [[
    { text: '🔄 Refresh', callback_data: `refresh:${result.tokenAddress}:${result.chain}` },
    { text: '🌐 ClaimScan', url: result.feeRecipientHandle
      ? `${CLAIMSCAN_URL}/${encodeURIComponent(result.feeRecipientHandle)}`
      : CLAIMSCAN_URL },
  ]];

  if (result.feeRecipient && EXPLORER_URLS[result.chain]) {
    buttons.push([{ text: '🔍 Explorer', url: `${EXPLORER_URLS[result.chain]}${result.feeRecipient}` }]);
  }

  return { message: msg, buttons };
}

// ═══════════════════════════════════════════════
// /scan Summary Response
// ═══════════════════════════════════════════════

interface FeeRecord {
  platform: Platform;
  chain: Chain;
  token_address: string;
  token_symbol: string | null;
  total_earned: string;
  total_claimed: string;
  total_unclaimed: string;
  total_earned_usd: number | null;
}

export function formatScanSummary(
  handle: string,
  fees: FeeRecord[],
  solPrice: number,
  ethPrice: number,
  bnbPrice: number
): { message: string; buttons: InlineKeyboardButton[][] } {
  if (fees.length === 0) {
    return {
      message: `No fee data found for <b>@${escapeHtml(handle)}</b>.`,
      buttons: [],
    };
  }

  const priceMap: Record<string, number> = { sol: solPrice, base: ethPrice, eth: ethPrice, bsc: bnbPrice };

  let totalEarnedUsd = 0;
  let totalClaimedUsd = 0;
  let totalUnclaimedUsd = 0;

  const platforms = new Set<string>();
  const chains = new Set<string>();

  for (const fee of fees) {
    platforms.add(PLATFORM_CONFIG[fee.platform]?.name ?? fee.platform);
    chains.add(fee.chain);

    const decimals = CHAIN_CONFIG[fee.chain]?.nativeDecimals ?? 18;
    const price = priceMap[fee.chain] ?? ethPrice;

    const earned = safeBigInt(fee.total_earned);
    const claimed = safeBigInt(fee.total_claimed);
    const unclaimed = safeBigInt(fee.total_unclaimed);

    totalEarnedUsd += fee.total_earned_usd ?? toUsdValue(earned, decimals, price);
    totalClaimedUsd += toUsdValue(claimed, decimals, price);
    totalUnclaimedUsd += toUsdValue(unclaimed, decimals, price);
  }

  const topUnclaimed = fees
    .filter((f) => safeBigInt(f.total_unclaimed) > 0n)
    .map((f) => {
      const decimals = CHAIN_CONFIG[f.chain]?.nativeDecimals ?? 18;
      const price = priceMap[f.chain] ?? ethPrice;
      const nSym = CHAIN_CONFIG[f.chain]?.nativeToken ?? 'ETH';
      const unclaimed = safeBigInt(f.total_unclaimed);
      const usd = toUsdValue(unclaimed, decimals, price);
      return {
        symbol: f.token_symbol ?? truncAddr(f.token_address),
        platform: PLATFORM_CONFIG[f.platform]?.name ?? f.platform,
        amount: fmtNative(f.total_unclaimed, decimals),
        nSym,
        usd,
      };
    })
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5);

  const chainNames = Array.from(chains).map((c) => CHAIN_CONFIG[c as Chain]?.name ?? c);
  const tokenCount = fees.length;

  let msg = `<b>📊 @${escapeHtml(handle)}</b>\n`;
  msg += `${Array.from(platforms).join(' · ')}  ·  ${chainNames.join(' + ')}  ·  ${tokenCount} token${tokenCount !== 1 ? 's' : ''}\n`;

  msg += `\n💰 Earned        <b>${fmtUsd(totalEarnedUsd)}</b>\n`;
  msg += `✅ Claimed        <b>${fmtUsd(totalClaimedUsd)}</b>\n`;
  msg += `🔓 Unclaimed    <b>${fmtUsd(totalUnclaimedUsd)}</b>`;

  if (topUnclaimed.length > 0) {
    msg += `\n\n<b>🔓 Top Unclaimed</b>\n`;
    msg += topUnclaimed.map((t) =>
      `• <b>$${escapeHtml(t.symbol)}</b> <i>${t.platform}</i>  —  ${t.amount} ${t.nSym}  ~${fmtUsd(t.usd)}`
    ).join('\n');
  }

  const buttons: InlineKeyboardButton[][] = [[
    { text: '🌐 View on ClaimScan', url: `${CLAIMSCAN_URL}/${encodeURIComponent(handle)}` },
  ]];

  return { message: msg, buttons };
}

// ═══════════════════════════════════════════════
// Claim Notification
// ═══════════════════════════════════════════════

export function formatClaimNotification(params: {
  tokenAddress: string;
  tokenSymbol: string | null;
  feeRecipientHandle: string | null;
  feeRecipientAddress: string | null;
  platform: Platform;
  claimedAmount: string;
  nativeSymbol: string;
  nativeDecimals: number;
  nativeUsdPrice: number;
  remainingUnclaimed: string;
  chain: Chain;
}): { message: string; buttons: InlineKeyboardButton[][] } {
  const d = params.nativeDecimals;
  const sym = params.nativeSymbol;
  const tkn = params.tokenSymbol ? `$${params.tokenSymbol}` : truncAddr(params.tokenAddress);
  const who = params.feeRecipientHandle ? `@${params.feeRecipientHandle}` : 'Creator';
  const platformName = PLATFORM_CONFIG[params.platform]?.name ?? params.platform;

  const claimedN = fmtNative(params.claimedAmount, d);
  const claimedU = fmtUsd(nativeUsd(params.claimedAmount, d, params.nativeUsdPrice));

  const remainN = fmtNative(params.remainingUnclaimed, d);
  const remainU = fmtUsd(nativeUsd(params.remainingUnclaimed, d, params.nativeUsdPrice));

  let msg = `<b>🚨 Claim Detected</b>\n\n`;
  msg += `<b>${escapeHtml(tkn)}</b>  ·  ${platformName}  ·  <code>${truncAddr(params.tokenAddress)}</code>\n\n`;
  msg += `${escapeHtml(who)} claimed <b>${claimedN} ${sym}</b>  ~${claimedU}\n`;
  msg += `Remaining: <b>${remainN} ${sym}</b>  ~${remainU}`;

  const buttons: InlineKeyboardButton[][] = [[
    { text: '🔄 Refresh', callback_data: `refresh:${params.tokenAddress}:${params.chain}` },
    { text: '🌐 ClaimScan', url: params.feeRecipientHandle
      ? `${CLAIMSCAN_URL}/${encodeURIComponent(params.feeRecipientHandle)}`
      : CLAIMSCAN_URL },
  ]];

  if (params.feeRecipientAddress && EXPLORER_URLS[params.chain]) {
    buttons.push([{ text: '🔍 Explorer', url: `${EXPLORER_URLS[params.chain]}${params.feeRecipientAddress}` }]);
  }

  return { message: msg, buttons };
}
