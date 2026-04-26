'use client';

import { usePathname } from 'next/navigation';

const PLATFORMS = [
  'Bags.fm', 'Pump.fun', 'Clanker', 'Zora', 'Bankr',
  'Believe', 'RevShare', 'Coinbarrel', 'Raydium',
  'Flaunch', 'Flap',
];

export default function Loading() {
  const pathname = usePathname();

  // Extract a clean display handle from the URL segment. Handles:
  //   - URL encoding (%2F to /)
  //   - Leaderboard prefixes (gh:, tt:)
  //   - Social URL forms (tiktok.com/@user, twitter.com/user, etc)
  //   - Leading @
  const rawSegment = pathname?.split('/').filter(Boolean)[0] || '';
  let display = '';
  try {
    display = decodeURIComponent(rawSegment);
  } catch {
    display = rawSegment;
  }
  if (display.startsWith('gh:') || display.startsWith('tt:')) {
    display = display.slice(3);
  }
  const urlMatch = display.match(/(?:tiktok\.com|twitter\.com|x\.com|github\.com|warpcast\.com)\/@?([a-zA-Z0-9_.\-]{2,40})/i);
  if (urlMatch) display = urlMatch[1];
  const handle = display.replace(/^@/, '');

  return (
    <div role="status" aria-label="Scanning creator fees" className="signal-stage min-h-[60vh] flex items-center justify-center px-6 py-10">
      <div className="signal-glass-card flex flex-col items-center">

        {/* Handle */}
        <div className="signal-fade-up signal-handle mb-1.5 flex items-baseline gap-0.5 text-[22px] tracking-[-0.5px]">
          <span className="font-sans font-bold text-foreground">@</span>
          <span className="font-sans font-bold text-foreground">{handle}</span>
        </div>

        {/* SCANNING label */}
        <div
          className="signal-fade-up signal-scan-label mb-6 font-mono text-[11px] font-medium uppercase tracking-[3px] text-foreground/28"
          style={{ animationDelay: '0.1s' }}
        >
          Scanning
        </div>

        {/* Radar */}
        <div className="signal-radar relative flex h-[240px] w-[240px] items-center justify-center">
          {/* Sonar pings */}
          <div className="signal-sonar-ping" style={{ animationDelay: '0s' }} />
          <div className="signal-sonar-ping" style={{ animationDelay: '1s' }} />
          <div className="signal-sonar-ping" style={{ animationDelay: '2s' }} />

          {/* Outer SVG ring */}
          <svg className="signal-ring-outer signal-ring-outer-svg absolute h-[220px] w-[220px]" viewBox="0 0 220 220">
            <circle
              cx="110" cy="110" r="108"
              fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground/[0.07]"
            />
            <circle
              cx="110" cy="110" r="108"
              fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground/45"
              strokeLinecap="round" strokeDasharray="80 614"
              transform="rotate(-90 110 110)"
            />
          </svg>

          {/* Mid dashed ring */}
          <div className="signal-ring-mid" />

          {/* Inner ring */}
          <div className="signal-ring-inner" />

          {/* Center */}
          <div className="absolute flex flex-col items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <svg className="signal-reticle absolute inset-0 h-full w-full" viewBox="0 0 32 32">
                <circle
                  cx="16" cy="16" r="14"
                  stroke="currentColor" strokeWidth="1" className="text-foreground/[0.18]"
                  fill="none" strokeDasharray="3 5"
                />
              </svg>
              <div className="signal-dot" />
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div
          className="signal-fade-up signal-platforms-wrap mt-7 flex max-w-[260px] flex-wrap justify-center gap-x-2.5 gap-y-1.5 font-mono"
          style={{ animationDelay: '0.9s' }}
        >
          {PLATFORMS.map((name, i) => (
            <span
              key={name}
              className="signal-platform"
              style={{ '--scan-delay': `${i * 1.2}s` } as React.CSSProperties}
            >
              {name}
            </span>
          ))}
        </div>

        {/* Loading dots */}
        <div
          className="signal-fade-up signal-dots mt-[18px] flex gap-[5px]"
          style={{ animationDelay: '1.1s' }}
        >
          <span className="signal-bounce-dot" style={{ animationDelay: '0s' }} />
          <span className="signal-bounce-dot" style={{ animationDelay: '0.2s' }} />
          <span className="signal-bounce-dot" style={{ animationDelay: '0.4s' }} />
        </div>

      </div>
    </div>
  );
}
