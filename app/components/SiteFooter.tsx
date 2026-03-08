'use client';

import { usePathname } from 'next/navigation';

export function SiteFooter() {
  const pathname = usePathname();

  // Hide footer on homepage (has its own layout)
  if (pathname === '/') {
    return null;
  }

  return (
    <footer className="border-t border-border/50 bg-background/60 backdrop-blur-sm" aria-label="Site footer">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Brand + tagline */}
          <div className="flex flex-col items-center gap-1.5 sm:items-start">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-foreground" aria-hidden="true">
                <svg className="h-3 w-3 text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-foreground">ClaimScan</span>
            </div>
            <p className="text-[11px] text-muted-foreground/40">
              Real-time creator fee tracking across Solana and Base
            </p>
          </div>

          {/* Right side — links + social */}
          <div className="flex items-center gap-4">
            <a
              href="https://x.com/lwartss"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:text-foreground"
              aria-label="Follow LW ARTS on X (Twitter)"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="hidden sm:inline">@lwartss</span>
            </a>
            <span className="h-3 w-px bg-border/50" aria-hidden="true" />
            <p className="text-[10px] tabular-nums text-muted-foreground/30">
              Solana · Base · 10 platforms
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
