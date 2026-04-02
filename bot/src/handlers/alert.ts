import type { Context } from 'grammy';
import {
  upsertAlertRule,
  getAlertRulesForChat,
  deleteAlertRule,
} from '../state/db';
import { createServiceClient } from '@/lib/supabase/service';

const supabase = createServiceClient();

/**
 * /alert command handler.
 * Usage:
 *   /alert @handle $500   — Set threshold alert
 *   /alert list            — List active alerts in this chat
 *   /alert remove @handle  — Remove an alert
 */
export async function handleAlert(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  const text = (ctx.message?.text ?? '').trim();
  const parts = text.replace(/^\/alert\s*/, '').trim();

  // /alert list
  if (parts === 'list' || parts === '') {
    const rules = await getAlertRulesForChat(chatId);
    if (rules.length === 0) {
      await ctx.reply('No active alerts in this chat.\n\nUse <code>/alert @handle $500</code> to set one.', {
        parse_mode: 'HTML',
      });
      return;
    }

    // Fetch creator handles for display
    const creatorIds = rules.map((r) => r.creatorId);
    const { data: creators } = await supabase
      .from('creators')
      .select('id, twitter_handle, display_name')
      .in('id', creatorIds);

    const creatorMap = new Map(
      (creators ?? []).map((c) => [c.id, c.twitter_handle ?? c.display_name ?? c.id.slice(0, 8)])
    );

    const lines = rules.map(
      (r, i) =>
        `${i + 1}. <b>@${creatorMap.get(r.creatorId) ?? 'unknown'}</b> — $${r.thresholdUsd.toLocaleString()}`
    );

    await ctx.reply(
      `<b>Active Alerts (${rules.length})</b>\n\n${lines.join('\n')}\n\n<i>Use /alert remove @handle to remove.</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // /alert remove @handle
  if (parts.startsWith('remove ')) {
    const handle = parts.replace('remove ', '').replace('@', '').trim();
    if (!handle) {
      await ctx.reply('Usage: <code>/alert remove @handle</code>', { parse_mode: 'HTML' });
      return;
    }

    // Resolve handle to creator_id
    const { data: creator } = await supabase
      .from('creators')
      .select('id')
      .or(`twitter_handle.eq.${handle},display_name.eq.${handle}`)
      .limit(1)
      .single();

    if (!creator) {
      await ctx.reply(`Creator <b>@${handle}</b> not found in ClaimScan.`, { parse_mode: 'HTML' });
      return;
    }

    const deleted = await deleteAlertRule(chatId, creator.id);
    if (deleted) {
      await ctx.reply(`Alert for <b>@${handle}</b> removed.`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`No active alert found for <b>@${handle}</b>.`, { parse_mode: 'HTML' });
    }
    return;
  }

  // /alert @handle $500
  const match = parts.match(/^@?(\S+)\s+\$?([\d,.]+)$/);
  if (!match) {
    await ctx.reply(
      'Usage: <code>/alert @handle $500</code>\n\nI\'ll notify you when their unclaimed fees exceed the threshold.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const handle = match[1].replace('@', '');
  const threshold = parseFloat(match[2].replace(/,/g, ''));

  if (isNaN(threshold) || threshold <= 0) {
    await ctx.reply('Threshold must be a positive number.', { parse_mode: 'HTML' });
    return;
  }

  // Resolve handle to creator_id
  const { data: creator } = await supabase
    .from('creators')
    .select('id')
    .or(`twitter_handle.eq.${handle},display_name.eq.${handle}`)
    .limit(1)
    .single();

  if (!creator) {
    await ctx.reply(
      `Creator <b>@${handle}</b> not found. Try <code>/scan @${handle}</code> first to index them.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const ruleId = await upsertAlertRule({
    chatId,
    userId,
    creatorId: creator.id,
    thresholdUsd: threshold,
  });

  if (ruleId) {
    await ctx.reply(
      `Alert set: I'll notify when <b>@${handle}</b>'s unclaimed fees exceed <b>$${threshold.toLocaleString()}</b>.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('Failed to set alert. Please try again.', { parse_mode: 'HTML' });
  }
}
