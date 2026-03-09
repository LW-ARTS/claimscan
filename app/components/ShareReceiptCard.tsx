import { formatUsd } from '@/lib/utils';
import { ShareButton } from './ShareButton';

export interface TopPlatform {
  key: string;
  name: string;
  color: string;
  usdValue: number;
  percentage: number;
}

interface ShareReceiptCardProps {
  handle: string;
  totalEarnedUsd: number;
  platformCount: number;
  topPlatforms: TopPlatform[];
  twitterHandle?: string | null;
}

export function ShareReceiptCard({
  handle,
  totalEarnedUsd,
  platformCount,
  topPlatforms,
}: ShareReceiptCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Top platforms breakdown */}
      {topPlatforms.length > 0 && (
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-3">
            Top Platforms
          </p>
          <div className="space-y-2.5">
            {topPlatforms.map((p) => (
              <div key={p.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatUsd(p.usdValue)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(p.percentage, 2)}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share buttons */}
      <div className={`px-4 py-4 sm:px-6 sm:py-5 ${topPlatforms.length > 0 ? 'border-t border-dashed border-border/60' : ''}`}>
        <ShareButton
          handle={handle}
          totalEarnedUsd={totalEarnedUsd}
          platformCount={platformCount}
        />
      </div>
    </div>
  );
}
