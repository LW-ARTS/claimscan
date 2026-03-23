import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export const runtime = 'edge';
export const alt = 'ClaimScan Creator Fee Receipt';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

// ═══════════════════════════════════════════════
// Platform config
// ═══════════════════════════════════════════════

const PLATFORMS: Record<string, { name: string }> = {
  bags: { name: 'Bags.fm' },
  clanker: { name: 'Clanker' },
  pump: { name: 'Pump.fun' },
  zora: { name: 'Zora' },
  bankr: { name: 'Bankr' },
  believe: { name: 'Believe' },
  revshare: { name: 'RevShare' },
  coinbarrel: { name: 'Coinbarrel' },
  raydium: { name: 'Raydium' },
};

// ═══════════════════════════════════════════════
// Inline utilities (can't import from lib/ in edge)
// ═══════════════════════════════════════════════

function fmtUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '$0.00';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return '$0.00';
}

function toBigInt(val: string | null | undefined): bigint {
  if (!val || val.trim() === '') return 0n;
  try {
    const intPart = val.includes('.') ? val.split('.')[0] : val;
    const result = BigInt(intPart || '0');
    return result < 0n ? 0n : result;
  } catch {
    return 0n;
  }
}

function computeUsd(amount: bigint, decimals: number, priceUsd: number): number {
  if (amount === 0n || priceUsd === 0) return 0;
  if (amount < BigInt(Number.MAX_SAFE_INTEGER)) {
    return (Number(amount) / Math.pow(10, decimals)) * priceUsd;
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  return (Number(whole) + Number(remainder) / Number(divisor)) * priceUsd;
}

async function fetchPrices(): Promise<{ sol: number; eth: number }> {
  try {
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    }
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(4000), next: { revalidate: 300 }, headers },
    );
    if (!res.ok) return { sol: 0, eth: 0 };
    const data = await res.json();
    return {
      sol: Number(data.solana?.usd) || 0,
      eth: Number(data.ethereum?.usd) || 0,
    };
  } catch {
    return { sol: 0, eth: 0 };
  }
}

// ═══════════════════════════════════════════════
// OG Image generator
// ═══════════════════════════════════════════════

export default async function OgImage({ params }: { params: Promise<{ handle: string }> }) {
  try {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  // Input validation — reject excessively long or empty handles early
  if (!decoded || decoded.length < 2 || decoded.length > 256) {
    return new ImageResponse(
      (<div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#0A0A0A', color: '#FAFAFA', fontSize: '64px', fontWeight: 800, alignItems: 'center', justifyContent: 'center' }}>ClaimScan</div>),
      { width: 2400, height: 1260 },
    );
  }

  const isWallet = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(decoded);
  const displayName = isWallet ? `${decoded.slice(0, 8)}...${decoded.slice(-6)}` : `@${decoded}`;

  let totalUsd = 0;
  let platformCount = 0;
  let topPlatforms: { name: string; usd: number }[] = [];

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && key) {
      const supabase = createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      let creatorId: string | null = null;

      if (isWallet) {
        // EVM addresses are stored checksummed (mixed-case) but users may paste lowercase.
        // Use case-insensitive match for EVM (0x...) addresses, exact match for Solana (base58).
        const isEvm = decoded.startsWith('0x');
        const query = supabase.from('wallets').select('creator_id').limit(1);
        const { data } = await (isEvm
          ? query.ilike('address', decoded)
          : query.eq('address', decoded)
        ).maybeSingle();
        creatorId = data?.creator_id ?? null;
      } else {
        const lc = decoded.toLowerCase().replace(/[(),."'\\]/g, '');
        const { data } = await supabase
          .from('creators')
          .select('id')
          .or(`twitter_handle.eq.${lc},github_handle.eq.${lc}`)
          .limit(1)
          .maybeSingle();
        creatorId = data?.id ?? null;
      }

      if (creatorId) {
        const [{ data: fees }, prices] = await Promise.all([
          supabase
            .from('fee_records')
            .select('total_earned_usd, total_earned, total_unclaimed, chain, platform')
            .eq('creator_id', creatorId)
            .limit(500),
          fetchPrices(),
        ]);

        if (fees && fees.length > 0) {
          const platformMap = new Map<string, number>();
          for (const f of fees) {
            let usd = 0;
            const dbUsd = f.total_earned_usd;
            if (typeof dbUsd === 'number' && Number.isFinite(dbUsd) && dbUsd > 0) {
              usd = dbUsd;
            } else {
              const unclaimed = toBigInt(f.total_unclaimed);
              const earned = toBigInt(f.total_earned);
              // Prefer total_earned (claimed + unclaimed) when populated; fall back to unclaimed for stale data
              const amount = earned > 0n ? earned : unclaimed;
              if (amount > 0n) {
                const price = f.chain === 'sol' ? prices.sol : prices.eth;
                const decimals = f.chain === 'sol' ? 9 : 18;
                usd = computeUsd(amount, decimals, price);
              }
            }
            if (usd > 0) {
              totalUsd += usd;
              platformMap.set(f.platform, (platformMap.get(f.platform) ?? 0) + usd);
            }
          }
          platformCount = platformMap.size;
          topPlatforms = [...platformMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, usd]) => ({
              name: PLATFORMS[k]?.name ?? k,
              usd,
            }));
        }
      }
    }
  } catch {
    // Gracefully degrade to fallback card
  }

  // ── Avatar ──
  let avatarSrc: string | null = null;
  // Validate handle format before external fetch (prevent path traversal / param injection)
  if (!isWallet && /^[a-zA-Z0-9_]{1,50}$/.test(decoded)) {
    try {
      const res = await fetch(`https://unavatar.io/x/${decoded}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 512_000) {
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const ALLOWED_OG_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
          const rawCt = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
          const ct = ALLOWED_OG_IMAGE_TYPES.has(rawCt) ? rawCt : 'image/png';
          avatarSrc = `data:${ct};base64,${btoa(binary)}`;
        }
      }
    } catch {
      // Skip avatar
    }
  }

  // ── Fonts (TTF format — woff2 crashes Satori in edge) ──
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
    // Fall through — fonts stay null, system fonts used as fallback
  }

  const hasData = totalUsd > 0;
  const padStr = String(platformCount).padStart(2, '0');

  /* ══════════════════════════════════════════════════════
   * Layout: 1:1 reproduction of the Pencil OG Card.
   * 1200×630, #0A0A0A bg, Sora + Space Mono fonts.
   * Left column: big metric. Right column: platform rows.
   * ══════════════════════════════════════════════════════ */
  return new ImageResponse(
    (
      <div
        style={{
          width: '2400px',
          height: '1260px',
          display: 'flex',
          backgroundColor: '#0A0A0A',
          fontFamily: 'Sora',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ─── Ambient glows (matched to Pencil OG Card) ─── */}
        <div
          style={{
            position: 'absolute',
            left: '-320px',
            top: '-280px',
            width: '1320px',
            height: '1120px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '500px',
            top: '100px',
            width: '1400px',
            height: '1100px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(204,204,204,0.05) 0%, rgba(204,204,204,0) 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '1220px',
            top: '420px',
            width: '1460px',
            height: '1160px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 70%)',
            display: 'flex',
          }}
        />

        {/* ─── TOP BAR ─── */}
        <div
          style={{
            position: 'absolute',
            left: '96px',
            top: '80px',
            width: '2208px',
            height: '80px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          {/* Logo — official ClaimScan mark */}
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '16px',
              backgroundColor: '#fafafa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 1536 1536" fill="#0A0A0A">
              <path d="M423.29,1057.61c73.39,27.03,157.91,21.13,226.43-18.56,27.81,12.19,56.66,20.64,87.33,23.87,22.65,2.38,44.08,1.23,67.87-.08-66.43,70.96-159.31,117.02-255.01,125.04-92.42,7.74-184.22-18.8-259.71-72.07-43.39-30.62-80.98-68.05-110.52-112.52-51.31-77.25-75.89-170.48-70.2-263.06,1.82-29.67,7.02-57.88,14.6-86.33,18.65-70,57.7-135.89,108.18-187.69,22.72-23.31,47.86-42.92,75.34-60.42,73.79-46.98,165.41-69.45,252.43-57.8,33.74,4.51,65.9,12.76,97.27,25.66,35.6,14.64,68.23,33.16,98.73,56.89l-33.54,43.05c-26.27,4.38-51.1,11.69-75.71,22.37-17.76-9.51-35.36-17.84-54.95-23.75-65.88-19.89-137.14-13.95-198.62,17.02-58.64,29.53-105.98,80.25-135.29,138.4-11.67,23.16-19.73,46.63-25.44,71.78-19.66,86.59-1.01,177.29,50.58,249.4,35.41,49.48,82.97,87.65,140.22,108.82Z" />
              <path d="M835.47,1091.06l34.68-44.12c19.42-7.64,38.04-16.24,56.04-28.35,43.59,31.05,92.81,50.62,145.66,58.55,41.63,6.25,83.08,6.56,124.29-1.7,23.69-4.75,45.72-12.22,65.76-25.44,35.69-23.53,50.6-59.63,46.03-101.95-6.85-63.44-68.56-89.71-120.95-109.19l-61.42-18.61-62.19-18.14c4.6-42.54.41-83.65-11.36-124.55,26.49,9.98,50.92,17.9,76.87,24.56l78.27,22.63c25.34,7.94,49.4,16.75,73.49,27.72,11.75,5.35,22.09,11.18,33.23,17.76,69.5,41.02,114.4,107.05,113.7,189.77-.62,73.23-30.17,132.61-89.82,174.85-50.75,35.94-113.07,52.29-174.82,57.18-96.03,7.61-200.84-14.28-282.1-66.66-15.98-10.33-30.52-20.79-45.39-34.31Z" />
              <path d="M918.11,652.5c52.02,66.98,51.6,160.01,2.33,227.33,2.11,8.63.4,16.99-5.43,23.5-5.51,6.16-14.12,8.35-22.94,7.03-54.05,46.4-128.44,59.57-194.75,32.34-31.61-12.98-59.1-33.06-79.78-60.64-39.48-52.66-50.13-120.75-25.12-184.72,20.96-53.62,68.79-97.96,128.33-113.03,57.82-14.64,119.25-1.72,167.3,35.41l29.03-31.09c-22.19-17.65-48.32-29.64-75.9-34.15-96.38-15.77-184.61,55.16-190.64,152.16-4.05,65.12,30.39,126.11,88.59,156.28s131.42,22.97,181.77-20.53c-1.54-8.64.53-16.26,6.08-22.23s13.02-7.8,21.31-6.93c41.77-57.8,41.72-135.55-.52-193.34l17.01-18.1Z" />
              <path d="M1319.67,548.91c-72.01-54.84-144.4-90.07-236.62-93.18-60.12-2.02-123.94,11.37-171.02,50.86-39.67-21.55-82.63-33.75-128.57-35.84,11.87-17.31,25.86-31.44,41.49-44.95,69.62-59.37,157.39-83.24,248.06-83.47,117.9-.3,223.8,41.8,315.66,114.36l-34.82,46.31-34.19,45.92Z" />
            </svg>
          </div>
          <span style={{ fontSize: '32px', color: '#FFFFFF', fontWeight: 500, fontFamily: 'Sora' }}>
            ClaimScan
          </span>
          {/* Spacer */}
          <div style={{ flex: 1, display: 'flex' }} />
          {/* VERIFIED badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              height: '64px',
              padding: '12px 32px',
              border: '2px solid #FFFFFF',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                display: 'flex',
              }}
            />
            <span
              style={{
                fontSize: '22px',
                color: '#FFFFFF',
                fontWeight: 500,
                letterSpacing: '4px',
                fontFamily: 'Space Mono',
              }}
            >
              VERIFIED
            </span>
          </div>
        </div>

        {/* ─── Top divider ─── */}
        <div
          style={{
            position: 'absolute',
            left: '96px',
            top: '200px',
            width: '2208px',
            height: '2px',
            backgroundColor: '#1A1A1A',
            display: 'flex',
          }}
        />

        {/* ─── User row: avatar + handle (centered) ─── */}
        <div
          style={{
            position: 'absolute',
            left: '0px',
            top: '230px',
            width: '2400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px',
            height: '96px',
          }}
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              width={88}
              height={88}
              style={{
                border: '4px solid #444444',
              }}
            />
          ) : (
            <div
              style={{
                width: '88px',
                height: '88px',
                backgroundColor: '#1A1A1A',
                border: '4px solid #444444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                fontWeight: 700,
                color: '#777777',
                fontFamily: 'Sora',
              }}
            >
              {(decoded[0] || '?').toUpperCase()}
            </div>
          )}
          <span
            style={{
              fontSize: '56px',
              fontWeight: 800,
              color: '#FFFFFF',
              fontFamily: 'Sora',
            }}
          >
            {displayName}
          </span>
        </div>

        {hasData ? (
          <>
            {/* ─── LEFT COLUMN ─── */}

            {/* "TOTAL UNCLAIMED" label */}
            <div style={{ position: 'absolute', left: '96px', top: '440px', display: 'flex' }}>
              <span
                style={{
                  fontSize: '22px',
                  color: '#777777',
                  fontWeight: 500,
                  letterSpacing: '4px',
                  fontFamily: 'Space Mono',
                }}
              >
                TOTAL EARNED
              </span>
            </div>

            {/* Big $ number */}
            <div style={{ position: 'absolute', left: '96px', top: '480px', display: 'flex' }}>
              <span
                style={{
                  fontSize: '144px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  letterSpacing: '-6px',
                  lineHeight: 1,
                  fontFamily: 'Sora',
                }}
              >
                {fmtUsd(totalUsd)}
              </span>
            </div>

            {/* Subtitle */}
            <div style={{ position: 'absolute', left: '96px', top: '660px', display: 'flex' }}>
              <span style={{ fontSize: '26px', color: '#777777', fontFamily: 'Space Mono' }}>
                in creator fees across {platformCount} platform{platformCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Platform count badge */}
            <div
              style={{
                position: 'absolute',
                left: '96px',
                top: '740px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 0',
              }}
            >
              <span style={{ fontSize: '48px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'Sora' }}>
                {padStr}
              </span>
              <span
                style={{
                  fontSize: '20px',
                  color: '#777777',
                  fontWeight: 500,
                  letterSpacing: '4px',
                  fontFamily: 'Space Mono',
                }}
              >
                PLATFORMS
              </span>
            </div>

            {/* ─── Vertical separator ─── */}
            <div
              style={{
                position: 'absolute',
                left: '1296px',
                top: '440px',
                width: '2px',
                height: '340px',
                backgroundColor: '#222222',
                display: 'flex',
              }}
            />

            {/* ─── RIGHT COLUMN ─── */}

            {/* "BREAKDOWN BY PLATFORM" label */}
            <div style={{ position: 'absolute', left: '1360px', top: '464px', display: 'flex' }}>
              <span
                style={{
                  fontSize: '20px',
                  color: '#777777',
                  fontWeight: 500,
                  letterSpacing: '4px',
                  fontFamily: 'Space Mono',
                }}
              >
                BREAKDOWN BY PLATFORM
              </span>
            </div>

            {/* Platform rows */}
            <div
              style={{
                position: 'absolute',
                left: '1360px',
                top: '500px',
                width: '944px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
              }}
            >
              {topPlatforms.map((p) => (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    padding: '32px 48px',
                    border: '2px solid #333333',
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      display: 'flex',
                    }}
                  />
                  <span style={{ fontSize: '30px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'Sora' }}>
                    {p.name}
                  </span>
                  <div style={{ flex: 1, display: 'flex' }} />
                  <span style={{ fontSize: '30px', fontWeight: 500, color: '#FFFFFF', fontFamily: 'Space Mono' }}>
                    {fmtUsd(p.usd)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                left: '0px',
                top: '480px',
                width: '2400px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px',
              }}
            >
              <span
                style={{
                  fontSize: '72px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.6)',
                  letterSpacing: '-2px',
                  fontFamily: 'Sora',
                }}
              >
                Creator Fee Scanner
              </span>
              <span style={{ fontSize: '32px', color: '#777777', fontWeight: 500, fontFamily: 'Space Mono' }}>
                Cross-chain DeFi fee discovery on Solana &amp; Base
              </span>
            </div>
          </>
        )}

        {/* ─── Footer divider ─── */}
        <div
          style={{
            position: 'absolute',
            left: '96px',
            top: '1040px',
            width: '2208px',
            height: '2px',
            backgroundColor: '#1A1A1A',
            display: 'flex',
          }}
        />

        {/* ─── Footer URL (centered) ─── */}
        <div
          style={{
            position: 'absolute',
            left: '96px',
            top: '1096px',
            width: '2208px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '24px', color: '#777777', letterSpacing: '2px', fontFamily: 'Space Mono' }}>
            claimscan.tech
          </span>
        </div>

        {/* ─── Footer left ─── */}
        <div style={{ position: 'absolute', left: '96px', top: '1190px', display: 'flex' }}>
          <span
            style={{
              fontSize: '20px',
              color: '#444444',
              fontWeight: 500,
              letterSpacing: '2px',
              fontFamily: 'Space Mono',
            }}
          >
            CLAIMSCAN V1.0
          </span>
        </div>

        {/* ─── Footer right ─── */}
        <div style={{ position: 'absolute', right: '96px', top: '1190px', display: 'flex' }}>
          <span
            style={{
              fontSize: '20px',
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
      width: 2400,
      height: 1260,
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
    console.error('[OG] Error:', err instanceof Error ? err.message : String(err));
    // Return opaque fallback — never expose error details in publicly-served images
    return new ImageResponse(
      (
        <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#0A0A0A', color: '#FAFAFA', fontSize: '64px', fontWeight: 800, alignItems: 'center', justifyContent: 'center' }}>
          ClaimScan
        </div>
      ),
      { width: 2400, height: 1260 },
    );
  }
}
