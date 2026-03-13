'use client';

import { usePathname } from 'next/navigation';

const PLATFORMS = [
  'bags.fm', 'pump.fun', 'zora', 'clanker', 'believe',
  'meteora', 'bankr', 'boop', 'virtuals',
];

export default function Loading() {
  const pathname = usePathname();
  const handle = pathname?.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';

  return (
    <div className="signal-stage flex items-center justify-center">
      <div className="signal-glass-card flex flex-col items-center">

        {/* Handle */}
        <div className="signal-fade-up signal-handle mb-1.5 flex items-baseline gap-0.5">
          <span className="font-sans font-bold tracking-tight text-[#0a0a0a]">@</span>
          <span className="font-sans font-bold tracking-tight text-[#0a0a0a]">{handle}</span>
        </div>

        {/* SCANNING label */}
        <div
          className="signal-fade-up signal-scan-label font-mono font-medium uppercase text-black/28"
          style={{ animationDelay: '0.1s' }}
        >
          Scanning
        </div>

        {/* Radar */}
        <div className="signal-radar relative flex items-center justify-center">
          {/* Sonar pings */}
          <div className="signal-sonar-ping" style={{ animationDelay: '0s' }} />
          <div className="signal-sonar-ping" style={{ animationDelay: '1s' }} />
          <div className="signal-sonar-ping" style={{ animationDelay: '2s' }} />

          {/* Outer SVG ring */}
          <svg className="signal-ring-outer signal-ring-outer-svg absolute" viewBox="0 0 220 220">
            <circle
              cx="110" cy="110" r="108"
              fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="1.5"
            />
            <circle
              cx="110" cy="110" r="108"
              fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5"
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
                  stroke="rgba(0,0,0,0.18)" strokeWidth="1"
                  fill="none" strokeDasharray="3 5"
                />
              </svg>
              <div className="signal-dot" />
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div
          className="signal-fade-up signal-platforms-wrap flex flex-wrap justify-center font-mono"
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
          className="signal-fade-up signal-dots flex"
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
