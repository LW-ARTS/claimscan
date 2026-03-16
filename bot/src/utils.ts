import type { Context } from 'grammy';
import { escapeHtml } from './services/format';

export function getMention(ctx: Context): string {
  const user = ctx.from;
  if (!user) return '';
  const name = escapeHtml(user.first_name);
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

export function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}
