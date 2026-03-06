import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ClaimScan — Cross-Chain DeFi Fee Tracker';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
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
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span
            style={{
              fontSize: '48px',
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-0.02em',
            }}
          >
            ClaimScan
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: '24px',
            color: 'rgba(255,255,255,0.6)',
            margin: 0,
          }}
        >
          Cross-Chain DeFi Fee Tracker
        </p>

        {/* Chains */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '24px',
          }}
        >
          <span
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '16px',
            }}
          >
            Solana
          </span>
          <span
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '16px',
            }}
          >
            Base
          </span>
          <span
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '16px',
            }}
          >
            8 Platforms
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
