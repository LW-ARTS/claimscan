import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  experimental: {
    viewTransition: true,
  },
  serverExternalPackages: ['@solana/web3.js', 'viem', '@meteora-ag/dynamic-bonding-curve-sdk'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'abs.twimg.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'imagedelivery.net' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'unavatar.io' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  tunnelRoute: '/monitoring',
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
