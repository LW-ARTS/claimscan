'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { ShimmerButton } from '@/components/ui/shimmer-button';

export function SearchBar({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear loading when the route actually changes
  useEffect(() => {
    setLoading(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Keyboard shortcut: "/" to focus search (per web-design-guidelines)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || trimmed.length < 2) return;

      setLoading(true);
      let handle = trimmed;

      try {
        if (handle.startsWith('http://') || handle.startsWith('https://')) {
          const url = new URL(handle);
          if (
            ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com', 'github.com', 'www.github.com'].includes(
              url.hostname
            )
          ) {
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length > 0) {
              handle = pathParts[0];
            }
          }
        }
      } catch (err) {
        // Ignore invalid URL errors, treat as a normal input string
      }

      if (handle.startsWith('@')) {
        handle = handle.slice(1);
      }

      router.push(`/${encodeURIComponent(handle)}`);
      timerRef.current = setTimeout(() => setLoading(false), 10_000);
    },
    [query, router]
  );

  const isLarge = size === 'lg';
  const canSearch = query.trim().length >= 2;

  return (
    <form onSubmit={handleSearch} className="relative w-full">
      <div
        className={`relative flex items-center gap-2 rounded-xl border glass-strong transition-all duration-300 ${focused
          ? 'border-white/20 shadow-lg dark:shadow-none'
          : 'border-white/10 hover:border-white/20'
          } ${isLarge ? 'p-2' : 'p-1'}`}
      >
        <div className="relative flex-1">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 ${isLarge ? 'h-5 w-5' : 'h-4 w-4'
              }`}
          />
          <input
            ref={inputRef}
            type="search"
            name="query"
            autoComplete="off"
            spellCheck={false}
            placeholder="@handle or wallet"
            aria-label="Search by Twitter handle, GitHub username, or wallet address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={loading}
            className={`w-full select-text bg-transparent outline-none placeholder:text-muted-foreground/40 ${isLarge ? 'h-12 pl-11 pr-2 text-base sm:text-lg' : 'h-11 pl-9 text-sm'
              }`}
          />
          {/* Keyboard shortcut hint — visible only on large variant when not focused */}
          {isLarge && !focused && !query && (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
              /
            </kbd>
          )}
        </div>
        <ShimmerButton
          type="submit"
          disabled={loading || !canSearch}
          aria-label={loading ? 'Searching...' : 'Scan'}
          aria-busy={loading}
          className={`flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-bold uppercase tracking-wide transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${isLarge
            ? 'h-[44px] min-w-[90px] px-4 text-sm sm:min-w-[100px] sm:px-6 sm:text-base'
            : 'h-[44px] min-w-[90px] px-4 text-sm'
            }`}
          shimmerSize="0.1em"
          background="var(--foreground)"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-background" />
          ) : (
            <>
              <span className="text-background whitespace-nowrap z-10">Scan</span>
              {isLarge && <ArrowRight className="h-4 w-4 text-background z-10" />}
            </>
          )}
        </ShimmerButton>
      </div>
    </form>
  );
}
