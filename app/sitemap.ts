import type { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/service';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: 'https://claimscan.io',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('creators')
      .select('twitter_handle, github_handle, updated_at')
      .not('twitter_handle', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1000);

    for (const creator of data ?? []) {
      const handle = creator.twitter_handle ?? creator.github_handle;
      if (handle) {
        entries.push({
          url: `https://claimscan.io/${encodeURIComponent(handle)}`,
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
