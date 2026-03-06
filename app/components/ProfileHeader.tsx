import Image from 'next/image';
import type { Database } from '@/lib/supabase/types';

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];

interface ProfileHeaderProps {
  creator: Creator;
  wallets: Wallet[];
}

const chainMeta: Record<string, { label: string }> = {
  sol: { label: 'Solana' },
  base: { label: 'Base' },
  eth: { label: 'Ethereum' },
};

export function ProfileHeader({ creator, wallets }: ProfileHeaderProps) {
  const displayName =
    creator.display_name ||
    creator.twitter_handle ||
    creator.github_handle ||
    'Unknown';

  const chains = [...new Set(wallets.map((w) => w.chain))];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-5">
        {/* Avatar */}
        <div className="relative">
          {creator.avatar_url?.startsWith('https://') &&
           /^https:\/\/(pbs\.twimg\.com|abs\.twimg\.com|avatars\.githubusercontent\.com|imagedelivery\.net|ipfs\.io)\//.test(creator.avatar_url) ? (
            <Image
              src={creator.avatar_url}
              alt={displayName}
              width={80}
              height={80}
              sizes="(max-width: 640px) 64px, 80px"
              className="relative h-16 w-16 rounded-full border-2 border-border object-cover sm:h-20 sm:w-20"
              priority
            />
          ) : (
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-muted text-2xl font-black text-foreground sm:h-20 sm:w-20 sm:text-3xl">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {displayName}
          </h1>

          {/* Social handles + chain badges */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {creator.twitter_handle && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{creator.twitter_handle}
              </span>
            )}
            {creator.github_handle && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                {creator.github_handle}
              </span>
            )}
            {chains.map((chain) => {
              const meta = chainMeta[chain] ?? { label: chain };
              return (
                <span
                  key={chain}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground"
                >
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-current opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                  </span>
                  {meta.label}
                </span>
              );
            })}
          </div>

          {/* Wallet addresses */}
          <div className="mt-3 space-y-1">
            {wallets.map((w) => (
              <p key={w.id} className="font-mono text-xs text-muted-foreground/70">
                <span className="inline-block w-10 text-right text-[10px] uppercase opacity-50">
                  {w.chain}
                </span>
                <span className="mx-2 text-border">│</span>
                <span title={w.address}>
                  {w.chain === 'sol'
                    ? `${w.address.slice(0, 6)}...${w.address.slice(-6)}`
                    : `${w.address.slice(0, 8)}...${w.address.slice(-6)}`}
                </span>
                <span className="ml-2 text-[10px] opacity-40">
                  via {w.source_platform}
                </span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
