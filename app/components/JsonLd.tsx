// JSON-LD structured data component for SEO
// Uses dangerouslySetInnerHTML for proper script injection (content is fully static/hardcoded — no user input)
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
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://claimscan.tech/{search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebApplication',
        '@id': 'https://claimscan.tech/#app',
        name: 'ClaimScan',
        url: 'https://claimscan.tech',
        description:
          'Cross-chain DeFi fee tracker for creators across Solana and Base. Track earned, claimed, and unclaimed fees across 9 launchpads.',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'All',
        featureList: [
          'Cross-chain fee tracking (Solana + Base)',
          'Real-time streaming scan results',
          '9 launchpad support',
          'Zero-custody claim flow',
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
