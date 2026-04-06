import Link from 'next/link';

const navLinks = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/docs', label: 'Docs' },
  { href: '/docs#api-pricing', label: 'API' },
  { href: '/terms', label: 'Terms' },
];

const socialLinks = [
  { href: 'https://x.com/lwartss', label: 'X / Twitter' },
  { href: 'https://t.me/lwarts', label: 'Telegram' },
];

const chains = ['Solana', 'Base', 'Ethereum', 'BSC'];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border-default)]" aria-label="Site footer">
      <div className="px-5 sm:px-12 lg:px-16">
        {/* Main row */}
        <div className="flex flex-col gap-8 py-10 sm:flex-row sm:justify-between sm:gap-12">
          {/* Brand column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" aria-hidden="true" className="h-5 w-5 rounded-[4px] invert" />
              <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">ClaimScan</span>
            </div>
            <p className="max-w-[240px] text-[13px] leading-relaxed text-[var(--text-tertiary)]">
              Track unclaimed creator fees across DeFi launchpads.
            </p>
            {/* Chain badges */}
            <div className="flex items-center gap-2">
              {chains.map((chain) => (
                <span
                  key={chain}
                  className="rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]"
                >
                  {chain}
                </span>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          <div className="flex gap-16 sm:gap-20">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)]">Product</p>
              <nav className="flex flex-col gap-2.5">
                {navLinks.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)]">Connect</p>
              <nav className="flex flex-col gap-2.5">
                {socialLinks.map(({ href, label }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] py-5">
          <p className="text-[11px] text-[var(--text-tertiary)]">
            &copy; {new Date().getFullYear()} ClaimScan
          </p>
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Built by{' '}
            <a
              href="https://lwdesigns.art"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              LW ARTS
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
