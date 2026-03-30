import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/constants';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/'],
      },
      // AI search bots — ALLOW so ClaimScan gets cited in AI answers
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'anthropic-ai', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'Bingbot', allow: '/' },
      // Training-only crawlers — BLOCK (no search citation benefit)
      { userAgent: 'CCBot', disallow: '/' },
      { userAgent: 'Bytespider', disallow: '/' },
      { userAgent: 'PetalBot', disallow: '/' },
      { userAgent: 'Meta-ExternalAgent', disallow: '/' },
      // Honeypot traps for scrapers ignoring robots.txt
      {
        userAgent: '*',
        disallow: ['/api/v2/', '/api/admin/', '/api/export/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
