'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { formatUsd } from '@/lib/utils';

const CountUp = dynamic(() => import('./CountUp'), {
  ssr: false,
  loading: () => null,
});

/**
 * Format variants. Kept as a string enum so this component is safe to use
 * from Server Components — format functions cannot cross the RSC boundary.
 */
export type CountUpVariant = 'compact' | 'walletsCompact' | 'usd';

const FORMATTERS: Record<CountUpVariant, (n: number) => string> = {
  compact(n) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M+`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K+`;
    return `$${Math.round(n)}`;
  },
  walletsCompact(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(0)},000+`;
    return `${Math.round(n)}+`;
  },
  usd(n) {
    return formatUsd(n);
  },
};

interface Props {
  value: number;
  variant: CountUpVariant;
  className?: string;
}

/**
 * SSR-safe wrapper. Renders the formatted final value during SSR + first paint
 * to prevent layout shift, then mounts the motion-powered CountUp after hydration.
 *
 * Accepts a string `variant` (not a function) so it is safe to call from
 * Server Components under Next.js RSC rules.
 */
export function CountUpLazy({ value, variant, className }: Props) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const format = FORMATTERS[variant];
  if (!hydrated) return <span className={className}>{format(value)}</span>;
  return <CountUp value={value} format={format} className={className} />;
}
