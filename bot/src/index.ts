import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

// Force ALL fetch() calls to use IPv4.
// Node 22 Happy Eyeballs tries IPv6 first, which times out on VPS
// providers without proper IPv6 routing. This patches the global fetch
// so every library (grammY, etc.) automatically uses IPv4.
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

import 'dotenv/config';
import { bot } from './bot';
import { requireChannel, handleCheckJoined } from './middleware/require-channel';
import { handleHelp, handleStart } from './handlers/help';
import { handleCaDetect } from './handlers/ca-detect';
import { handleScan } from './handlers/scan';
import { handleStats } from './handlers/stats';
import { handleAlert } from './handlers/alert';
import { handleLeaderboard } from './handlers/leaderboard';
import { handleWatch } from './handlers/watch';
import { handleInline } from './handlers/inline';
import { handleDigest } from './handlers/digest';
import { handleApp } from './handlers/app';
import { handleCallbacks } from './handlers/callbacks';
import { startPolling } from './workers/poll';

// "I joined" button check — must be before the requireChannel middleware
bot.callbackQuery('check_joined', handleCheckJoined);

// Channel membership gate — blocks all handlers below if user hasn't joined
bot.use(requireChannel);

// Register command handlers
bot.command('help', handleHelp);
bot.command('start', handleStart);
bot.command('scan', handleScan);
bot.command('alert', handleAlert);
bot.command('watch', handleWatch);
bot.command('digest', handleDigest);
bot.command('app', handleApp);
bot.command('stats', handleStats);
bot.command('leaderboard', handleLeaderboard);
bot.command('top', handleLeaderboard);

// Register callback query handler (inline buttons)
bot.on('callback_query:data', handleCallbacks);

// Register inline mode handler (doesn't go through requireChannel middleware —
// inline queries have no chat context, membership gate doesn't apply)
bot.on('inline_query', handleInline);

// Register CA auto-detection on all text messages (must be last)
bot.on('message:text', handleCaDetect);

// Graceful shutdown
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bot] ${signal} received — shutting down...`);

  pollHandle?.stop();
  await bot.stop();

  console.log('[bot] Shutdown complete');
  process.exit(0);
}

let pollHandle: ReturnType<typeof startPolling> | null = null;

// Start bot + polling worker
async function main() {
  console.log('[bot] Starting ClaimScan bot...');

  // Register bot commands for Telegram menu autocomplete (non-fatal)
  try {
    await bot.api.setMyCommands([
      { command: 'scan', description: 'Full creator fee report by handle' },
      { command: 'leaderboard', description: 'Top creators by total fees earned' },
      { command: 'alert', description: 'Set threshold alert for creator fees' },
      { command: 'watch', description: 'Notify this chat on every claim by a creator' },
      { command: 'digest', description: 'Toggle daily summary (groups)' },
      { command: 'app', description: 'Open ClaimScan as a Mini App' },
      { command: 'stats', description: 'Tracked tokens in this group' },
      { command: 'help', description: 'Command reference' },
    ]);
  } catch (err) {
    console.warn('[bot] Failed to register commands (non-fatal):', err instanceof Error ? err.message : err);
  }

  // Start the claim polling worker
  pollHandle = startPolling();

  // Start long polling
  await bot.start({
    onStart: (info) => {
      console.log(`[bot] @${info.username} is running`);
    },
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('[bot] Unhandled rejection:', err);
});

main().catch((err) => {
  console.error('[bot] Fatal error:', err);
  process.exit(1);
});
