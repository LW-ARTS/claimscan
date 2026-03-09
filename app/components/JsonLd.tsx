// JSON-LD structured data component for SEO
// Uses dangerouslySetInnerHTML for proper script injection (content is fully static/hardcoded — no user input)
export function JsonLd() {
  const data = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'ClaimScan',
        url: 'https://claimscan.tech',
        description:
          'Cross-chain DeFi fee tracker for creators across Solana and Base.',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'All',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'WebSite',
        name: 'ClaimScan',
        url: 'https://claimscan.tech',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://claimscan.tech/{search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        name: 'LW ARTS',
        url: 'https://lwdesigns.art',
        sameAs: [
          'https://x.com/lwartss',
          'https://t.me/lwarts',
        ],
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
