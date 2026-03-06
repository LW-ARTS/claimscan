// JSON-LD structured data component for SEO
// Uses dangerouslySetInnerHTML for proper script injection (content is fully static)
export function JsonLd() {
  const data = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'ClaimScan',
    url: 'https://claimscan.io',
    description:
      'Cross-chain DeFi fee tracker for creators across Solana and Base.',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
}
