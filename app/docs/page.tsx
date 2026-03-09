import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ClaimScan Whitepaper — Architecture & Roadmap',
  description:
    'Read the ClaimScan V1 whitepaper. Architecture, cross-chain fee tracking, security model, and roadmap for Solana and Base launchpads.',
  openGraph: {
    title: 'ClaimScan Whitepaper',
    description:
      'Architecture, security, and roadmap for the cross-chain DeFi fee tracker powering 10+ launchpads.',
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'ClaimScan Whitepaper',
    description:
      'Architecture, security, and roadmap for the cross-chain DeFi fee tracker.',
  },
  alternates: {
    canonical: 'https://claimscan.tech/docs',
  },
};

export default function DocsPage() {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header */}
      <div className="w-full max-w-4xl text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Whitepaper
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ClaimScan V1 — Architecture, security, and roadmap
        </p>
      </div>

      {/* PDF Viewer */}
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-border/50 bg-card/50 shadow-sm">
        <iframe
          src="/ClaimScan-Whitepaper-V1.pdf"
          className="h-[80vh] w-full"
          title="ClaimScan Whitepaper V1"
          aria-label="ClaimScan Whitepaper PDF document"
        />
      </div>

      {/* Download fallback */}
      <a
        href="/ClaimScan-Whitepaper-V1.pdf"
        download
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/20 hover:text-foreground"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
        Download PDF
      </a>
    </div>
  );
}
