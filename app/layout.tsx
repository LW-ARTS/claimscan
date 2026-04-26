import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import { headers } from 'next/headers';
import './globals.css';
import { JsonLd } from './components/JsonLd';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SiteFooter } from './components/SiteFooter';
import Link from 'next/link';

// Lazy-load heavy client components (auto code-split, hydrate on client)
const GrainientBackground = dynamic(
  () => import('./components/GrainientBackground').then((m) => ({ default: m.GrainientBackground })),
);
const Providers = dynamic(
  () => import('./_providers').then((m) => ({ default: m.Providers })),
);
const WalletButton = dynamic(
  () => import('./components/WalletButton').then((m) => ({ default: m.WalletButton })),
);
const MobileNav = dynamic(
  () => import('./components/MobileNav').then((m) => ({ default: m.MobileNav })),
);

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0B0E',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://claimscan.tech'),
  title: {
    default: 'ClaimScan | Find Unclaimed Creator Fees on Solana, Base & BSC',
    template: '%s | ClaimScan',
  },
  description:
    'Find unclaimed creator fees on Pump.fun, Bags.fm, Clanker, Zora and more. Paste any handle or wallet to see earnings across Solana, Base, and BNB Chain in seconds.',
  keywords: [
    'DeFi fees', 'creator fees', 'Pump.fun fees', 'Bags.fm', 'Clanker',
    'Zora', 'Solana', 'Base', 'BNB Chain', 'BSC', 'cross-chain', 'fee tracker', 'unclaimed fees',
    'crypto revenue', 'token launchpad', 'DeFi analytics',
  ],
  authors: [{ name: 'ClaimScan' }],
  creator: 'ClaimScan',
  publisher: 'LW ARTS',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://claimscan.tech',
    siteName: 'ClaimScan',
    title: 'ClaimScan | Track Unclaimed Creator Fees Across DeFi',
    description:
      'Paste any @handle or wallet. See what you earned, claimed, and left on the table across 11 launchpads on Solana, Base, and BNB Chain.',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'ClaimScan: Cross-chain DeFi fee tracker for Solana, Base, and BNB Chain',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@lwartss',
    creator: '@lwartss',
    title: 'ClaimScan | Track Unclaimed Creator Fees Across DeFi',
    description:
      'Paste any @handle or wallet. See what you earned, claimed, and left on the table across 11 launchpads.',
    images: [
      {
        url: '/opengraph-image.png',
        alt: 'ClaimScan: Cross-chain DeFi fee tracker for Solana, Base, and BNB Chain',
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  alternates: {
    canonical: 'https://claimscan.tech',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? '';

  return (
    <html lang="en" className="dark">
      <head>
        <meta name="base:app_id" content="69b2e7675600c39dcfa4fe7b" />
        <JsonLd />
        {/* Turnstile with CSP nonce: loaded afterInteractive to not block FCP.
            Only needed when user opens ClaimDialog, not on initial page load. */}
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          nonce={nonce}
        />
      </head>
      <body
        className={`${inter.variable} ${GeistMono.variable} font-sans antialiased min-h-screen overflow-x-hidden text-foreground`}
      >
        <Providers>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-background">
            Skip to main content
          </a>
          <div
              className="relative min-h-screen flex flex-col">
            {/* Animated grain background */}
            <GrainientBackground />

            {/* Navigation */}
            <header className="animate-fade-in-down sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[#0B0B0E99] backdrop-blur-xl pt-[env(safe-area-inset-top)]">
              <nav aria-label="Main navigation" className="flex items-center justify-between px-5 py-4 sm:px-12 sm:py-4">
                <div className="flex items-center gap-8">
                  <Link href="/" className="pressable group flex items-center gap-2.5 py-1" aria-label="ClaimScan home">
                    <img src="/icon.svg" alt="" aria-hidden="true" className="h-7 w-7 rounded-[6px] invert transition-transform duration-200 group-hover:rotate-[-4deg] group-hover:scale-105" />
                    <span className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
                      ClaimScan
                    </span>
                  </Link>
                  <div className="hidden items-center gap-7 sm:flex">
                    <Link href="/leaderboard" className="group relative text-[15px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                      Leaderboard
                      <span className="absolute left-0 -bottom-1 h-[1.5px] w-full origin-left scale-x-0 bg-[var(--text-primary)] transition-transform duration-200 ease-out group-hover:scale-x-100" />
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <WalletButton />
                  <MobileNav />
                </div>
              </nav>
            </header>

            {/* Main content */}
            <main id="main-content" className="relative w-full flex-grow">
              {children}
            </main>

            {/* Footer */}
            <SiteFooter />
          </div>
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
