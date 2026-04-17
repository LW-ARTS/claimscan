import type { Context } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { escapeHtml } from '../services/format';

const API_URL = process.env.CLAIMSCAN_API_BASE ?? 'https://claimscan.tech';
const FETCH_TIMEOUT_MS = 8_000;
const TOP_N = 10;

interface LeaderboardEntry {
  handle: string;
  handle_type: 'twitter' | 'github' | 'tiktok';
  display_name: string | null;
  total_earned_usd: number;
  platform_count: number;
  token_count: number;
}

interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
}

function fmtUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function rankBadge(i: number): string {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return ` ${i + 1}.`;
}

export async function handleLeaderboard(ctx: Context): Promise<void> {
  try {
    await ctx.replyWithChatAction('typing');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    let data: LeaderboardResult;
    try {
      const res = await fetch(`${API_URL}/api/leaderboard?limit=${TOP_N}`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'claimscan-bot/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = (await res.json()) as LeaderboardResult;
    } finally {
      clearTimeout(timer);
    }

    if (!data.entries || data.entries.length === 0) {
      await ctx.reply('No leaderboard data available yet.', { parse_mode: 'HTML' });
      return;
    }

    const lines = data.entries.slice(0, TOP_N).map((e, i) => {
      const badge = rankBadge(i);
      const name = e.display_name?.trim() ? e.display_name : e.handle;
      const usd = fmtUsd(e.total_earned_usd);
      return `${badge} <b>@${escapeHtml(e.handle)}</b>  ·  ${usd}  ·  ${e.token_count} tokens`;
    });

    const msg = [
      '<b>🏆 ClaimScan Leaderboard</b>',
      '<i>Top creators by total fees earned</i>',
      '',
      ...lines,
    ].join('\n');

    const buttons: InlineKeyboardButton[][] = [[
      { text: '🌐 Full leaderboard', url: `${API_URL}/leaderboard` },
    ]];

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[leaderboard] Failed:', msg);
    await ctx.reply(
      msg.includes('abort')
        ? '⚠️ Leaderboard timed out — try again.'
        : '⚠️ Failed to fetch leaderboard — try again in a moment.',
      { parse_mode: 'HTML' }
    );
  }
}
