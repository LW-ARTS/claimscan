import type { Context } from 'grammy';
import {
  upsertWatchRule,
  getWatchRulesForChat,
  deleteWatchRule,
} from '../state/db';
import { createServiceClient } from '@/lib/supabase/service';
const supabase = createServiceClient();

/**
 * /watch command handler.
 * Usage:
 *   /watch @handle          — Notify on every claim by this creator
 *   /watch list             — List active watches in this chat
 *   /watch remove @handle   — Remove a watch
 */
export async function handleWatch(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  const text = (ctx.message?.text ?? '').trim();
  const parts = text.replace(/^\/watch\s*/, '').trim();

  if (parts === 'list' || parts === '') {
    const rules = await getWatchRulesForChat(chatId);
    if (rules.length === 0) {
      await ctx.reply(
        'No active watches in this chat.\n\nUse <code>/watch @handle</code> to watch a creator.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const creatorIds = rules.map((r) => r.creatorId);
    const { data: creators } = await supabase
      .from('creators')
      .select('id, twitter_handle, display_name')
      .in('id', creatorIds);

    const creatorMap = new Map(
      (creators ?? []).map((c) => [c.id, c.twitter_handle ?? c.display_name ?? c.id.slice(0, 8)])
    );

    const lines = rules.map(
      (r, i) => `${i + 1}. <b>@${creatorMap.get(r.creatorId) ?? 'unknown'}</b>`
    );

    await ctx.reply(
      `<b>Active Watches (${rules.length})</b>\n\n${lines.join('\n')}\n\n<i>Use /watch remove @handle to remove.</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (parts.startsWith('remove ')) {
    const handle = parts.replace('remove ', '').replace('@', '').trim();
    if (!handle) {
      await ctx.reply('Usage: <code>/watch remove @handle</code>', { parse_mode: 'HTML' });
      return;
    }

    const { data: creator } = await supabase
      .from('creators')
      .select('id')
      .or(`twitter_handle.eq."${handle.replace(/"/g, '')}",display_name.eq."${handle.replace(/"/g, '')}"`)
      .limit(1)
      .single();

    if (!creator) {
      await ctx.reply(`Creator <b>@${handle}</b> not found in ClaimScan.`, { parse_mode: 'HTML' });
      return;
    }

    const deleted = await deleteWatchRule(chatId, creator.id);
    if (deleted) {
      await ctx.reply(`Watch for <b>@${handle}</b> removed.`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`No active watch found for <b>@${handle}</b>.`, { parse_mode: 'HTML' });
    }
    return;
  }

  const handle = parts.replace('@', '').trim();
  if (!handle || handle.length > 100) {
    await ctx.reply(
      'Usage: <code>/watch @handle</code>\n\nI\'ll notify this chat on every claim by that creator.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const { data: creator } = await supabase
    .from('creators')
    .select('id')
    .or(`twitter_handle.eq."${handle.replace(/"/g, '')}",display_name.eq."${handle.replace(/"/g, '')}"`)
    .limit(1)
    .single();

  if (!creator) {
    await ctx.reply(
      `Creator <b>@${handle}</b> not found. Try <code>/scan @${handle}</code> first to index them.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const ruleId = await upsertWatchRule({
    chatId,
    userId,
    creatorId: creator.id,
  });

  if (ruleId) {
    await ctx.reply(
      `Watching <b>@${handle}</b>. I\'ll notify this chat on every claim.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('Failed to set watch. Please try again.', { parse_mode: 'HTML' });
  }
}
