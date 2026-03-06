import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ClaimScan Creator Profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const isWallet = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(decoded);
  const displayName = isWallet ? `${decoded.slice(0, 8)}...${decoded.slice(-6)}` : `@${decoded}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a1a1e 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span style={{ fontSize: '28px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
            ClaimScan
          </span>
        </div>
        <p style={{ fontSize: '56px', fontWeight: 700, color: 'white', margin: 0 }}>
          {displayName}
        </p>
        <p style={{ fontSize: '24px', color: 'rgba(255,255,255,0.4)', marginTop: '16px' }}>
          Cross-Chain DeFi Fee Summary
        </p>
      </div>
    ),
    { ...size }
  );
}
