'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, Loader2, ArrowRight } from 'lucide-react';

import { track } from '@vercel/analytics';

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
    startTransition(() => setLoading(false));
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
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement).isContentEditable
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
          const hostname = url.hostname.toLowerCase();
          const pathParts = url.pathname.split('/').filter(Boolean);
          if (['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'].includes(hostname)) {
            if (pathParts.length > 0) handle = pathParts[0];
          } else if (['github.com', 'www.github.com'].includes(hostname)) {
            // Preserve "github.com/username" so parseSearchQuery can classify as GitHub
            handle = `github.com${url.pathname}`;
          } else if (['warpcast.com', 'www.warpcast.com'].includes(hostname)) {
            if (pathParts.length > 0) handle = `warpcast.com/${pathParts[0]}`;
          }
        }
      } catch {
        // Ignore invalid URL errors, treat as a normal input string
      }

      if (handle.startsWith('@')) {
        handle = handle.slice(1);
      }

      const safeHandle = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(handle)
        ? `${handle.slice(0, 6)}...${handle.slice(-4)}`
        : handle;
      track('search_initiated', { handle: safeHandle });
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
        className={`focus-glow relative flex items-center gap-3 rounded-[14px] border-none bg-[#0E0E12] shadow-[0_0_0_1px_#FFFFFF0C,0_4px_60px_#FFFFFF06] ${isLarge ? 'px-5 py-2' : 'p-1'}`}
      >
        <div className="relative flex-1">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] ${isLarge ? 'h-[22px] w-[22px]' : 'h-4 w-4'
              }`}
          />
          <label htmlFor="claimscan-search" className="sr-only">Search by handle, username, or wallet</label>
          <input
            ref={inputRef}
            id="claimscan-search"
            type="search"
            name="query"
            autoComplete="off"
            spellCheck={false}
            placeholder="@handle, wallet address, or X/GitHub URL"
            aria-label="Search by Twitter handle, GitHub username, or wallet address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={loading}
            className={`w-full select-text bg-transparent outline-none placeholder:text-[var(--text-tertiary)] ${isLarge ? 'h-12 pl-11 pr-2 text-[15px]' : 'h-11 pl-9 text-sm'
              }`}
          />
          {/* Keyboard shortcut hint — visible only on large variant when not focused */}
          {isLarge && !focused && !query && (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 rounded-[6px] border border-[var(--border-default)] bg-[#FFFFFF0A] px-3 py-[5px] font-mono text-[12px] font-medium text-[var(--text-secondary)] sm:inline-flex">
              /
            </kbd>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !canSearch}
          aria-label={loading ? 'Searching...' : 'Scan'}
          aria-busy={loading}
          className={`pressable hover-glow flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#2A2A2E] font-semibold uppercase tracking-wider text-white/80 duration-200 ease-out hover:bg-[#3A3A3E] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${isLarge
            ? 'h-[42px] px-5 text-[13px]'
            : 'h-[38px] px-4 text-[12px]'
            }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span className="whitespace-nowrap">Scan</span>
              {isLarge && <ArrowRight className="h-4 w-4" />}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
