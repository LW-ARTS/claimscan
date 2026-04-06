import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export const runtime = 'edge';
export const alt = 'ClaimScan Leaderboard';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Revalidate the generated PNG every 10 minutes (matches leaderboard cache TTL).
export const revalidate = 600;

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface LeaderboardRow {
  handle: string;
  handle_type: 'twitter' | 'github';
  display_name: string | null;
  total_earned_usd: number;
  platform_count: number;
  token_count: number;
}

// ═══════════════════════════════════════════════
// Inline utilities (no lib/ imports in edge runtime)
// ═══════════════════════════════════════════════

function fmtUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '$0.00';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return '$0.00';
}

function truncateHandle(handle: string, maxLen = 18): string {
  if (handle.length <= maxLen) return handle;
  return handle.slice(0, maxLen - 1) + '…';
}

async function fetchTopCreators(): Promise<LeaderboardRow[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return [];

    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC types not regenerated
    const rpc = (supabase as any).rpc.bind(supabase);
    const { data, error } = await rpc('get_leaderboard', {
      p_limit: 5,
      p_offset: 0,
      p_platform: null,
      p_chain: null,
    });

    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((e) => ({
      handle: String(e.handle),
      handle_type: e.handle_type as 'twitter' | 'github',
      display_name: e.display_name ? String(e.display_name) : null,
      total_earned_usd: Number(e.total_earned_usd),
      platform_count: Number(e.platform_count),
      token_count: Number(e.token_count),
    }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════
// OG Image generator
// ═══════════════════════════════════════════════

export default async function LeaderboardOgImage() {
  try {
    const top = await fetchTopCreators();

    // ── Fonts (TTF format, woff2 crashes Satori in edge) ──
    let soraExtraBold: ArrayBuffer | null = null;
    let soraSemiBold: ArrayBuffer | null = null;
    let soraMedium: ArrayBuffer | null = null;
    let spaceMono: ArrayBuffer | null = null;
    try {
      const fontOpts = { signal: AbortSignal.timeout(3000), next: { revalidate: 86400 } } as RequestInit;
      const [r800, r600, r500, rMono] = await Promise.all([
        fetch('https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSfSmX-K.ttf', fontOpts),
        fetch('https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSeMmX-K.ttf', fontOpts),
        fetch('https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSdgnn-K.ttf', fontOpts),
        fetch('https://fonts.gstatic.com/s/spacemono/v17/i7dPIFZifjKcF5UAWdDRUEY.ttf', fontOpts),
      ]);
      if (r800.ok) soraExtraBold = await r800.arrayBuffer();
      if (r600.ok) soraSemiBold = await r600.arrayBuffer();
      if (r500.ok) soraMedium = await r500.arrayBuffer();
      if (rMono.ok) spaceMono = await rMono.arrayBuffer();
    } catch {
      // Fall through, system fonts used as fallback
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            backgroundColor: '#0A0A0A',
            fontFamily: 'Sora',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* ─── Ambient glows (subtle gradient background) ─── */}
          <div
            style={{
              position: 'absolute',
              left: '-200px',
              top: '-180px',
              width: '800px',
              height: '700px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 70%)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '700px',
              top: '200px',
              width: '800px',
              height: '700px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(204,204,204,0.05) 0%, rgba(204,204,204,0) 70%)',
              display: 'flex',
            }}
          />

          {/* ─── TOP BAR (logo left, LIVE badge right) ─── */}
          <div
            style={{
              position: 'absolute',
              left: '60px',
              top: '48px',
              width: '1080px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Logo tile */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                backgroundColor: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 1536 1536" fill="#0A0A0A">
                <path d="M423.29,1057.61c73.39,27.03,157.91,21.13,226.43-18.56,27.81,12.19,56.66,20.64,87.33,23.87,22.65,2.38,44.08,1.23,67.87-.08-66.43,70.96-159.31,117.02-255.01,125.04-92.42,7.74-184.22-18.8-259.71-72.07-43.39-30.62-80.98-68.05-110.52-112.52-51.31-77.25-75.89-170.48-70.2-263.06,1.82-29.67,7.02-57.88,14.6-86.33,18.65-70,57.7-135.89,108.18-187.69,22.72-23.31,47.86-42.92,75.34-60.42,73.79-46.98,165.41-69.45,252.43-57.8,33.74,4.51,65.9,12.76,97.27,25.66,35.6,14.64,68.23,33.16,98.73,56.89l-33.54,43.05c-26.27,4.38-51.1,11.69-75.71,22.37-17.76-9.51-35.36-17.84-54.95-23.75-65.88-19.89-137.14-13.95-198.62,17.02-58.64,29.53-105.98,80.25-135.29,138.4-11.67,23.16-19.73,46.63-25.44,71.78-19.66,86.59-1.01,177.29,50.58,249.4,35.41,49.48,82.97,87.65,140.22,108.82Z" />
                <path d="M835.47,1091.06l34.68-44.12c19.42-7.64,38.04-16.24,56.04-28.35,43.59,31.05,92.81,50.62,145.66,58.55,41.63,6.25,83.08,6.56,124.29-1.7,23.69-4.75,45.72-12.22,65.76-25.44,35.69-23.53,50.6-59.63,46.03-101.95-6.85-63.44-68.56-89.71-120.95-109.19l-61.42-18.61-62.19-18.14c4.6-42.54.41-83.65-11.36-124.55,26.49,9.98,50.92,17.9,76.87,24.56l78.27,22.63c25.34,7.94,49.4,16.75,73.49,27.72,11.75,5.35,22.09,11.18,33.23,17.76,69.5,41.02,114.4,107.05,113.7,189.77-.62,73.23-30.17,132.61-89.82,174.85-50.75,35.94-113.07,52.29-174.82,57.18-96.03,7.61-200.84-14.28-282.1-66.66-15.98-10.33-30.52-20.79-45.39-34.31Z" />
                <path d="M918.11,652.5c52.02,66.98,51.6,160.01,2.33,227.33,2.11,8.63.4,16.99-5.43,23.5-5.51,6.16-14.12,8.35-22.94,7.03-54.05,46.4-128.44,59.57-194.75,32.34-31.61-12.98-59.1-33.06-79.78-60.64-39.48-52.66-50.13-120.75-25.12-184.72,20.96-53.62,68.79-97.96,128.33-113.03,57.82-14.64,119.25-1.72,167.3,35.41l29.03-31.09c-22.19-17.65-48.32-29.64-75.9-34.15-96.38-15.77-184.61,55.16-190.64,152.16-4.05,65.12,30.39,126.11,88.59,156.28s131.42,22.97,181.77-20.53c-1.54-8.64.53-16.26,6.08-22.23s13.02-7.8,21.31-6.93c41.77-57.8,41.72-135.55-.52-193.34l17.01-18.1Z" />
                <path d="M1319.67,548.91c-72.01-54.84-144.4-90.07-236.62-93.18-60.12-2.02-123.94,11.37-171.02,50.86-39.67-21.55-82.63-33.75-128.57-35.84,11.87-17.31,25.86-31.44,41.49-44.95,69.62-59.37,157.39-83.24,248.06-83.47,117.9-.3,223.8,41.8,315.66,114.36l-34.82,46.31-34.19,45.92Z" />
              </svg>
            </div>
            <span style={{ fontSize: '22px', color: '#FFFFFF', fontWeight: 500, fontFamily: 'Sora' }}>
              ClaimScan
            </span>
            <div style={{ flex: 1, display: 'flex' }} />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                height: '42px',
                padding: '8px 20px',
                border: '2px solid #FFFFFF',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                }}
              />
              <span
                style={{
                  fontSize: '14px',
                  color: '#FFFFFF',
                  fontWeight: 500,
                  letterSpacing: '3px',
                  fontFamily: 'Space Mono',
                }}
              >
                LIVE
              </span>
            </div>
          </div>

          {/* ─── Divider ─── */}
          <div
            style={{
              position: 'absolute',
              left: '60px',
              top: '112px',
              width: '1080px',
              height: '2px',
              backgroundColor: '#1A1A1A',
              display: 'flex',
            }}
          />

          {/* ─── Title ─── */}
          <div
            style={{
              position: 'absolute',
              left: '60px',
              top: '140px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontSize: '15px',
                color: '#777777',
                fontWeight: 500,
                letterSpacing: '3px',
                fontFamily: 'Space Mono',
              }}
            >
              LEADERBOARD
            </span>
            <span
              style={{
                fontSize: '52px',
                fontWeight: 800,
                color: '#FFFFFF',
                letterSpacing: '-1.5px',
                lineHeight: 1,
                fontFamily: 'Sora',
              }}
            >
              CREATOR FEE LEADERBOARD
            </span>
            <span
              style={{
                fontSize: '20px',
                color: '#777777',
                fontFamily: 'Space Mono',
                marginTop: '4px',
              }}
            >
              Top earners across 9 DeFi launchpads
            </span>
          </div>

          {/* ─── Top 5 list ─── */}
          {top.length > 0 ? (
            <div
              style={{
                position: 'absolute',
                left: '60px',
                top: '320px',
                width: '1080px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {top.slice(0, 5).map((row, i) => {
                const rank = i + 1;
                const handleText = row.handle_type === 'github'
                  ? row.handle.startsWith('gh:') ? row.handle : `gh:${row.handle}`
                  : `@${row.handle}`;
                return (
                  <div
                    key={row.handle}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '20px',
                      padding: '14px 24px',
                      border: '2px solid #222222',
                      width: '100%',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '24px',
                        fontWeight: 800,
                        color: '#FFFFFF',
                        fontFamily: 'Space Mono',
                        width: '48px',
                        display: 'flex',
                      }}
                    >
                      {String(rank).padStart(2, '0')}
                    </span>
                    <span
                      style={{
                        fontSize: '26px',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        fontFamily: 'Sora',
                        display: 'flex',
                      }}
                    >
                      {truncateHandle(handleText)}
                    </span>
                    <div style={{ flex: 1, display: 'flex' }} />
                    <span
                      style={{
                        fontSize: '26px',
                        fontWeight: 500,
                        color: '#FFFFFF',
                        fontFamily: 'Space Mono',
                        display: 'flex',
                      }}
                    >
                      {fmtUsd(row.total_earned_usd)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                left: '60px',
                top: '360px',
                width: '1080px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '32px',
                  color: '#777777',
                  fontWeight: 500,
                  fontFamily: 'Space Mono',
                }}
              >
                Live rankings at claimscan.tech/leaderboard
              </span>
            </div>
          )}

          {/* ─── Footer divider ─── */}
          <div
            style={{
              position: 'absolute',
              left: '60px',
              top: '560px',
              width: '1080px',
              height: '2px',
              backgroundColor: '#1A1A1A',
              display: 'flex',
            }}
          />

          {/* ─── Footer URL ─── */}
          <div
            style={{
              position: 'absolute',
              left: '60px',
              top: '584px',
              width: '1080px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '16px',
                color: '#777777',
                letterSpacing: '2px',
                fontFamily: 'Space Mono',
              }}
            >
              claimscan.tech/leaderboard
            </span>
            <div style={{ flex: 1, display: 'flex' }} />
            <span
              style={{
                fontSize: '14px',
                color: '#444444',
                fontWeight: 500,
                letterSpacing: '2px',
                fontFamily: 'Space Mono',
              }}
            >
              BUILT BY @LWARTSS
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        ...(soraExtraBold || spaceMono
          ? {
              fonts: [
                ...(soraExtraBold
                  ? [{ name: 'Sora', data: soraExtraBold, weight: 800 as const, style: 'normal' as const }]
                  : []),
                ...(soraSemiBold
                  ? [{ name: 'Sora', data: soraSemiBold, weight: 600 as const, style: 'normal' as const }]
                  : []),
                ...(soraMedium
                  ? [{ name: 'Sora', data: soraMedium, weight: 500 as const, style: 'normal' as const }]
                  : []),
                ...(spaceMono
                  ? [{ name: 'Space Mono', data: spaceMono, weight: 400 as const, style: 'normal' as const }]
                  : []),
              ],
            }
          : {}),
      },
    );
  } catch (err: unknown) {
    console.error('[OG Leaderboard] Error:', err instanceof Error ? err.message : String(err));
    // Opaque fallback. Never expose error details in publicly-served images.
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            backgroundColor: '#0A0A0A',
            color: '#FAFAFA',
            fontSize: '48px',
            fontWeight: 800,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ClaimScan Leaderboard
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }
}
