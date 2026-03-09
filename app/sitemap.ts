import type { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/service';

// Regenerate sitemap at most once per hour (ISR)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: 'https://claimscan.tech',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://claimscan.tech/docs',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  try {
    const supabase = createServiceClient();

    // Query creators with any known handle (twitter, github, or farcaster)
    const { data } = await supabase
      .from('creators')
      .select('twitter_handle, github_handle, farcaster_handle, updated_at')
      .or('twitter_handle.not.is.null,github_handle.not.is.null,farcaster_handle.not.is.null')
      .order('updated_at', { ascending: false })
      .limit(1000);

    const seen = new Set<string>();
    for (const creator of data ?? []) {
      const handle = creator.twitter_handle ?? creator.github_handle ?? creator.farcaster_handle;
      if (handle && !seen.has(handle)) {
        seen.add(handle);
        entries.push({
          url: `https://claimscan.tech/${encodeURIComponent(handle)}`,
          lastModified: new Date(creator.updated_at),
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
    }
  } catch {
    // Return at least the root URL on error
  }

  return entries;
}
