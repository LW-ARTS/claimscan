// Profile-specific JSON-LD structured data (server component — no 'use client')
// Renders ProfilePage + BreadcrumbList + Person mainEntity for individual creator pages

interface ProfileJsonLdProps {
  handle: string;
  displayName: string;
  totalEarnedUsd: number;
  platformCount: number;
  avatarUrl?: string | null;
  walletAddresses: string[];
}

export function ProfileJsonLd({
  handle,
  displayName,
  totalEarnedUsd,
  platformCount,
  avatarUrl,
  walletAddresses,
}: ProfileJsonLdProps) {
  const profileUrl = `https://claimscan.tech/${encodeURIComponent(handle)}`;

  const data = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${profileUrl}#profilepage`,
        url: profileUrl,
        name: `${displayName} Creator Fees`,
        description: `Earnings breakdown for ${displayName} across ${platformCount} DeFi launchpad${platformCount !== 1 ? 's' : ''} on Solana and Base. Total earned: $${totalEarnedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        isPartOf: { '@id': 'https://claimscan.tech/#website' },
        mainEntity: { '@id': `${profileUrl}#person` },
      },
      {
        '@type': 'Person',
        '@id': `${profileUrl}#person`,
        name: displayName,
        url: profileUrl,
        ...(avatarUrl ? { image: avatarUrl } : {}),
        ...(walletAddresses.length > 0
          ? {
              identifier: walletAddresses.map((addr) => ({
                '@type': 'PropertyValue',
                propertyID: 'WalletAddress',
                value: addr,
              })),
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${profileUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'ClaimScan',
            item: 'https://claimscan.tech',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: displayName,
            item: profileUrl,
          },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
}
