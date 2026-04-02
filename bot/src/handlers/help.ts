import type { Context } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';

// ═══════════════════════════════════════════════
// /start — Welcome message
// ═══════════════════════════════════════════════

const START_TEXT = `<b>🔎 ClaimScan</b>

Track unclaimed creator fees across 9 DeFi launchpads on Solana, Base, and BSC.

Paste any token CA in the chat and I'll show you the fee breakdown, no command needed.

<b>🎮 Commands</b>
<code>/scan @handle</code> Full creator fee report
<code>/alert @handle $500</code> Fee threshold alerts
<code>/stats</code> Tracked tokens in this group
<code>/help</code> Command reference

<b>🏷 Platforms</b>
Pump.fun · Believe · Bags.fm · Clanker · Zora
Bankr · RevShare · Coinbarrel · Raydium`;

const START_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: '🌐 ClaimScan', url: 'https://claimscan.tech' },
    { text: '📖 Docs', url: 'https://claimscan.tech/docs' },
  ],
  [
    { text: '🎨 Built by LW', url: 'https://lwdesigns.art' },
    { text: '𝕏 LW', url: 'https://x.com/lwartss' },
    { text: '📢 Channel', url: 'https://t.me/lwarts' },
  ],
];

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(START_TEXT, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: START_BUTTONS },
    link_preview_options: { is_disabled: true },
  });
}

// ═══════════════════════════════════════════════
// /help — Command reference
// ═══════════════════════════════════════════════

const HELP_TEXT = `<b>🎮 Commands</b>

<code>/scan @handle</code>
Full creator fee report. Resolves wallets, scans all 9 platforms, shows aggregated fees and top unclaimed tokens.

<code>/stats</code>
Shows how many tokens are being monitored for claim notifications in this group.

<code>/help</code>
This message.

<b>💡 CA Auto-detect</b>
Paste any Solana, Base, or BSC token address directly in the chat. I'll identify the platform, find the creator, and show you the fee breakdown.

<b>🔔 Threshold Alerts</b>
<code>/alert @handle $500</code> Get notified when unclaimed fees exceed your threshold.
<code>/alert list</code> View active alerts in this chat.
<code>/alert remove @handle</code> Remove an alert.

<b>🔔 Claim Notifications</b>
When a scanned token has unclaimed fees, I'll automatically watch it and notify this group when the creator claims.`;

const HELP_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: '🌐 ClaimScan', url: 'https://claimscan.tech' },
  ],
];

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(HELP_TEXT, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: HELP_BUTTONS },
    link_preview_options: { is_disabled: true },
  });
}
