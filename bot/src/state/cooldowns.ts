const COOLDOWN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_COOLDOWN_MS = 30 * 1000; // 30 seconds
const SCAN_COOLDOWN_MS = 30 * 1000; // 30 seconds between /scan per user
const GROUP_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const GROUP_RATE_MAX = 10; // max 10 CA lookups per group per minute
const MAP_SIZE_CAP = 10_000; // max entries per Map to prevent memory leak

const caCooldowns = new Map<string, number>();
const refreshCooldowns = new Map<string, number>();
const scanCooldowns = new Map<string, number>();
const groupRateCounts = new Map<string, { count: number; windowStart: number }>();

export function isOnCooldown(groupId: number | string, ca: string): boolean {
  const key = `${groupId}:${ca}`;
  const expires = caCooldowns.get(key);
  if (!expires) return false;
  if (Date.now() >= expires) {
    caCooldowns.delete(key);
    return false;
  }
  return true;
}

export function setCooldown(groupId: number | string, ca: string): void {
  caCooldowns.set(`${groupId}:${ca}`, Date.now() + COOLDOWN_TTL_MS);
}

export function isGroupRateLimited(groupId: number | string): boolean {
  const key = String(groupId);
  const now = Date.now();
  const entry = groupRateCounts.get(key);

  if (!entry || now - entry.windowStart >= GROUP_RATE_WINDOW_MS) {
    groupRateCounts.set(key, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= GROUP_RATE_MAX) return true;

  entry.count++;
  return false;
}

export function isRefreshOnCooldown(messageId: number | string): boolean {
  const expires = refreshCooldowns.get(String(messageId));
  if (!expires) return false;
  if (Date.now() >= expires) {
    refreshCooldowns.delete(String(messageId));
    return false;
  }
  return true;
}

export function setRefreshCooldown(messageId: number | string): void {
  refreshCooldowns.set(String(messageId), Date.now() + REFRESH_COOLDOWN_MS);
}

export function isScanOnCooldown(userId: number | string): boolean {
  const key = String(userId);
  const expires = scanCooldowns.get(key);
  if (!expires) return false;
  if (Date.now() >= expires) {
    scanCooldowns.delete(key);
    return false;
  }
  return true;
}

export function setScanCooldown(userId: number | string): void {
  scanCooldowns.set(String(userId), Date.now() + SCAN_COOLDOWN_MS);
}

// Evict entries with earliest expiry if a Map exceeds the cap
function enforceMapCap(map: Map<string, number>): void {
  if (map.size <= MAP_SIZE_CAP) return;
  // First pass: purge all expired
  const now = Date.now();
  for (const [key, expires] of map) {
    if (expires <= now) map.delete(key);
  }
  if (map.size <= MAP_SIZE_CAP) return;
  // Still over cap: evict earliest-expiring entries
  const sorted = [...map.entries()].sort((a, b) => a[1] - b[1]);
  const toDelete = map.size - MAP_SIZE_CAP;
  for (let i = 0; i < toDelete; i++) {
    map.delete(sorted[i][0]);
  }
}

// Periodic cleanup of expired entries (every 10 minutes)
// .unref() allows the process to exit naturally without process.exit()
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, expires] of caCooldowns) {
    if (now >= expires) caCooldowns.delete(key);
  }
  for (const [key, expires] of refreshCooldowns) {
    if (now >= expires) refreshCooldowns.delete(key);
  }
  for (const [key, expires] of scanCooldowns) {
    if (now >= expires) scanCooldowns.delete(key);
  }
  for (const [key, entry] of groupRateCounts) {
    if (now - entry.windowStart >= GROUP_RATE_WINDOW_MS) groupRateCounts.delete(key);
  }
  // Hard cap enforcement in case cleanup alone isn't enough
  enforceMapCap(caCooldowns);
  enforceMapCap(refreshCooldowns);
  enforceMapCap(scanCooldowns);
  // Cap groupRateCounts separately (different value shape)
  if (groupRateCounts.size > MAP_SIZE_CAP) {
    const sorted = [...groupRateCounts.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
    const toDelete = groupRateCounts.size - MAP_SIZE_CAP;
    for (let i = 0; i < toDelete; i++) {
      groupRateCounts.delete(sorted[i][0]);
    }
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();
