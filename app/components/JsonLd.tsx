// JSON-LD structured data component for SEO.
// Content is fully static/hardcoded. No user input.
export function JsonLd() {
  const data = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://lwdesigns.art/#org',
        name: 'LW ARTS',
        url: 'https://lwdesigns.art',
        logo: 'https://lwdesigns.art/logo.png',
        description:
          'Web3 studio specializing in websites, dApps, branding, and automation for crypto projects.',
        foundingDate: '2022',
        sameAs: [
          'https://x.com/lwartss',
          'https://t.me/lwarts',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://claimscan.tech/#website',
        name: 'ClaimScan',
        url: 'https://claimscan.tech',
        publisher: { '@id': 'https://lwdesigns.art/#org' },
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://claimscan.tech/{search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebApplication',
        '@id': 'https://claimscan.tech/#app',
        name: 'ClaimScan',
        url: 'https://claimscan.tech',
        description:
          'ClaimScan is a free cross-chain DeFi fee tracker that helps crypto creators find and claim uncollected earnings across 9 launchpads on Solana, Base, Ethereum, and BNB Chain. Approximately 40% of creator fees go unclaimed.',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'All',
        featureList: [
          'Cross-chain fee tracking (Solana, Base, Ethereum, BNB Chain)',
          'Real-time streaming scan results in under 30 seconds',
          '9 launchpad support (Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium)',
          'Zero-custody claim flow with on-chain verification',
          'Multi-identity search (Twitter, GitHub, Farcaster, wallet)',
        ],
        creator: { '@id': 'https://lwdesigns.art/#org' },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
}
