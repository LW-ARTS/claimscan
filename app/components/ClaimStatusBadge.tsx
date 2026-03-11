import type { ClaimStatus } from '@/lib/supabase/types';

const statusConfig: Record<
  ClaimStatus,
  { label: string; className: string }
> = {
  claimed: {
    label: 'Claimed',
    className: 'bg-muted text-muted-foreground ring-border',
  },
  partially_claimed: {
    label: 'Partial Claimed',
    className: 'bg-amber-100 text-amber-800 ring-amber-300',
  },
  unclaimed: {
    label: 'Unclaimed',
    className: 'bg-foreground text-background ring-foreground',
  },
  auto_distributed: {
    label: 'Auto',
    className: 'bg-muted text-muted-foreground ring-border',
  },
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const config = statusConfig[status] ?? statusConfig.unclaimed;
  const showPulse = status === 'unclaimed' || status === 'partially_claimed';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.className}`}
    >
      {showPulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-75 ${status === 'partially_claimed' ? 'bg-amber-600' : 'bg-background'}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${status === 'partially_claimed' ? 'bg-amber-600' : 'bg-background'}`} />
        </span>
      )}
      {config.label}
    </span>
  );
}
