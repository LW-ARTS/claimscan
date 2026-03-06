import 'server-only';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import type { ResolvedWallet } from '@/lib/platforms/types';
import type { IdentityProvider } from '@/lib/supabase/types';

// ═══════════════════════════════════════════════
// Warpcast + Farcaster Hub Types
// ═══════════════════════════════════════════════

/** Warpcast search result user — public API, no auth required */
interface WarpcastUser {
  fid: number;
  username: string;
  displayName: string;
  followerCount?: number;
}

interface WarpcastSearchResponse {
  result?: {
    users?: WarpcastUser[];
  };
}

/** Farcaster Hub verification message */
interface HubVerificationMessage {
  data?: {
    verificationAddAddressBody?: {
      address: string;
      protocol: string;
    };
    verificationAddEthAddressBody?: {
      address: string;
      protocol?: string;
    };
  };
}

interface HubVerificationsResponse {
  messages?: HubVerificationMessage[];
}

// ═══════════════════════════════════════════════
// Public API endpoints (no auth needed)
// ═══════════════════════════════════════════════

const WARPCAST_API = 'https://client.warpcast.com/v2';
const FARCASTER_HUB = 'https://hub.pinata.cloud/v1';

// ═══════════════════════════════════════════════
// Matching Logic
// ═══════════════════════════════════════════════

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Score how well a Warpcast user matches the searched handle.
 * Returns 0 for no match, higher scores = better match.
 * Uses follower count as a signal for account legitimacy.
 */
function matchScore(user: WarpcastUser, handle: string): number {
  const q = normalize(handle);
  if (!q || q.length < 2) return 0;

  const username = normalize(user.username || '');
  const displayName = normalize(user.displayName || '');
  const followers = user.followerCount ?? 0;

  let nameScore = 0;

  // Exact normalized match on display name (best: "VitalikButerin" = "Vitalik Buterin")
  if (displayName === q) {
    nameScore = 100;
  }
  // Exact username match
  else if (username === q) {
    nameScore = 90;
  }
  // Display name contains query or vice versa
  else if (displayName.includes(q) || q.includes(displayName)) {
    const ratio = Math.min(q.length, displayName.length) / Math.max(q.length, displayName.length);
    nameScore = 60 * ratio;
  }
  // Username prefix match
  else if (q.length >= 4 && username.length >= 4) {
    if (q.startsWith(username) || username.startsWith(q)) {
      const ratio = Math.min(q.length, username.length) / Math.max(q.length, username.length);
      nameScore = 50 * ratio;
    }
  }

  if (nameScore === 0) return 0;

  // Use follower count as reputation signal (log scale).
  // 10 followers → 1.0, 1K → 3.0, 100K → 5.0, 1M → 6.0
  const followerBoost = followers > 0 ? Math.log10(Math.max(followers, 1)) : 0;
  const reputationMultiplier = Math.max(0.1, Math.min(followerBoost / 6, 1));

  return nameScore * reputationMultiplier;
}

// ═══════════════════════════════════════════════
// API calls
// ═══════════════════════════════════════════════

async function warpcastSearch(query: string, limit = 5): Promise<WarpcastUser[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(
      `${WARPCAST_API}/search-users?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = (await res.json()) as WarpcastSearchResponse;
    return data?.result?.users ?? [];
  } catch {
    return [];
  }
}

/**
 * Decode a Farcaster Hub address.
 * Hub returns addresses as raw bytes serialized in JSON.
 * For ETH: 20 bytes → "0x" + 40 hex chars.
 */
function decodeHubAddress(raw: string, protocol: string): string | null {
  if (!raw) return null;

  // Already a hex address
  if (raw.startsWith('0x')) return raw;

  // Hub encodes binary as escaped byte strings.
  // Reconstruct hex from raw char codes.
  if (protocol === 'PROTOCOL_ETHEREUM') {
    try {
      const bytes = [];
      for (let i = 0; i < raw.length; i++) {
        bytes.push(raw.charCodeAt(i));
      }
      if (bytes.length === 20) {
        return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

async function getVerifiedAddresses(fid: number): Promise<string[]> {
  const ethAddresses: string[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(
      `${FARCASTER_HUB}/verificationsByFid?fid=${fid}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return ethAddresses;

    const data = (await res.json()) as HubVerificationsResponse;
    const messages = data?.messages ?? [];

    for (const msg of messages) {
      const body = msg.data?.verificationAddAddressBody
        ?? msg.data?.verificationAddEthAddressBody;
      if (!body?.address) continue;

      const protocol = body.protocol ?? 'PROTOCOL_ETHEREUM';

      if (protocol === 'PROTOCOL_ETHEREUM') {
        const decoded = decodeHubAddress(body.address, protocol);
        if (decoded && isValidEvmAddress(decoded)) {
          ethAddresses.push(normalizeEvmAddress(decoded));
        }
      }
    }
  } catch (err) {
    console.warn('[farcaster] Hub verifications failed:', err instanceof Error ? err.message : err);
  }

  return ethAddresses;
}

// ═══════════════════════════════════════════════
// Farcaster Identity Resolution (Public APIs)
// ═══════════════════════════════════════════════

/**
 * Resolve a social handle to verified EVM wallet addresses via Farcaster.
 *
 * Uses two public, no-auth-required APIs:
 *   1. Warpcast search → find matching Farcaster user by name/display name
 *   2. Farcaster Hub → get their verified ETH addresses
 *
 * This bridges social identity → EVM wallet resolution. Most crypto creators
 * have Farcaster accounts with verified ETH addresses.
 *
 * Strategy: Run multiple search terms (full handle + prefix) in parallel,
 * then pick the best match using name similarity + follower count to
 * prefer real accounts over impersonators.
 */
export async function resolveFarcasterWallets(
  handle: string,
  provider: IdentityProvider
): Promise<ResolvedWallet[]> {
  if (provider === 'wallet') return [];

  try {
    // Build search terms: full handle + prefix heuristic
    const searchTerms = [handle];

    // camelCase split (works if original case is preserved)
    const camelParts = handle
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_.\-]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 3);

    if (camelParts.length > 1 && camelParts[0].toLowerCase() !== handle.toLowerCase()) {
      searchTerms.push(camelParts[0]);
    }

    // Half-length prefix: "vitalikbuterin" → "vitalik"
    // Many handles follow FirstnameLastname where the first name alone
    // is their username on other platforms (e.g. "vitalik.eth" on Farcaster).
    if (handle.length >= 10) {
      const halfPrefix = handle.slice(0, Math.floor(handle.length * 0.5));
      if (halfPrefix.length >= 4 && !searchTerms.includes(halfPrefix)) {
        searchTerms.push(halfPrefix);
      }
    }

    // Search Warpcast in parallel
    const searchResults = await Promise.all(
      searchTerms.map((term) => warpcastSearch(term, 5))
    );

    // Flatten and deduplicate by FID
    const seenFids = new Set<number>();
    const allUsers: WarpcastUser[] = [];
    for (const users of searchResults) {
      for (const user of users) {
        if (!seenFids.has(user.fid)) {
          seenFids.add(user.fid);
          allUsers.push(user);
        }
      }
    }

    // Score all users and pick the best match
    let bestUser: WarpcastUser | null = null;
    let bestScore = 0;
    for (const user of allUsers) {
      const score = matchScore(user, handle);
      if (score > bestScore) {
        bestScore = score;
        bestUser = user;
      }
    }

    // Require minimum score to avoid false positives
    if (!bestUser || bestScore < 5) return [];

    // Get verified ETH addresses from Farcaster Hub
    const ethAddresses = await getVerifiedAddresses(bestUser.fid);

    const wallets: ResolvedWallet[] = [];
    const seenAddresses = new Set<string>();

    for (const addr of ethAddresses) {
      const key = `base:${addr.toLowerCase()}`;
      if (!seenAddresses.has(key)) {
        seenAddresses.add(key);
        wallets.push({
          address: addr,
          chain: 'base',
          sourcePlatform: 'clanker',
        });
      }
    }

    return wallets;
  } catch (err) {
    console.warn(
      '[farcaster] resolution failed:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
