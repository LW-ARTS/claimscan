import type { ClaimStatus } from '@/lib/supabase/types';

const statusConfig: Record<
  ClaimStatus,
  { label: string; className: string; pulseClassName?: string }
> = {
  claimed: {
    label: 'Claimed',
    className: 'bg-muted text-muted-foreground ring-border',
  },
  partially_claimed: {
    label: 'Partial',
    className: 'bg-foreground/[0.06] text-foreground ring-foreground/20',
    pulseClassName: 'bg-foreground',
  },
  unclaimed: {
    label: 'Unclaimed',
    className: 'bg-foreground text-background ring-foreground',
    pulseClassName: 'bg-background',
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
      key={status}
      className={`animate-scale-in inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${config.className}`}
    >
      {showPulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-50 ${config.pulseClassName}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.pulseClassName}`} />
        </span>
      )}
      {config.label}
    </span>
  );
}
