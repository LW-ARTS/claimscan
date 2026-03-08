import type { Metadata, Viewport } from 'next';
import { Exo_2, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { JsonLd } from './components/JsonLd';
import { GrainientBackground } from './components/GrainientBackground';
import { SiteFooter } from './components/SiteFooter';
import { AntiCopy } from './components/AntiCopy';
import Link from 'next/link';

const exo2 = Exo_2({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FAFAFA',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://claimscan.io'),
  title: {
    default: 'ClaimScan — Cross-Chain DeFi Fee Tracker',
    template: '%s | ClaimScan',
  },
  description:
    'Track creator fees across Pump.fun, Bags.fm, Clanker, Zora, and more. Discover earned, claimed, and unclaimed DeFi revenue by Twitter handle, GitHub, or wallet address. Real-time cross-chain data on Solana & Base.',
  keywords: [
    'DeFi fees', 'creator fees', 'Pump.fun fees', 'Bags.fm', 'Clanker',
    'Zora', 'Solana', 'Base', 'cross-chain', 'fee tracker', 'unclaimed fees',
    'crypto revenue', 'token launchpad', 'DeFi analytics',
  ],
  authors: [{ name: 'ClaimScan' }],
  creator: 'ClaimScan',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://claimscan.io',
    siteName: 'ClaimScan',
    title: 'ClaimScan — Cross-Chain DeFi Fee Tracker',
    description:
      'Track creator fees across DeFi launchpads. Real-time data for Pump.fun, Bags.fm, Clanker, Zora on Solana & Base.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClaimScan — Cross-Chain DeFi Fee Tracker',
    description:
      'Track creator fees across DeFi launchpads. Search by @twitter, GitHub, or wallet.',
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
  alternates: {
    canonical: 'https://claimscan.io',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <JsonLd />
      </head>
      <body
        className={`${exo2.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground select-none`}
      >
        <AntiCopy />
        <div className="relative min-h-screen flex flex-col">
          {/* Animated grain background */}
          <GrainientBackground />

          {/* Navigation */}
          <header className="animate-fade-in-down sticky top-0 z-50 border-b border-white/10 bg-background/20 backdrop-blur-xl shadow-sm dark:shadow-none">
            <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="group flex items-center gap-2.5" aria-label="ClaimScan home">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground" aria-hidden="true">
                  <svg className="h-4 w-4 text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <span className="text-lg font-bold tracking-tight">
                  ClaimScan
                </span>
              </Link>
              <div className="flex items-center gap-2" />
            </nav>
          </header>

          {/* Main content */}
          <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 flex-grow">
            {children}
          </main>

          {/* Footer */}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
