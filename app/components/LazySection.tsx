'use client';

import { useRef, useState, useEffect, startTransition, type ReactNode } from 'react';

interface LazySectionProps {
  children: ReactNode;
  /** Vertical margin around the root element for early triggering */
  rootMargin?: string;
  /** Minimum height placeholder before content loads */
  minHeight?: number;
  className?: string;
}

/**
 * SSR-safe lazy section.
 * Content is always rendered in the initial HTML (important for SEO/Googlebot),
 * but gets a fade-in entrance animation when it scrolls into view on the client.
 */
export function LazySection({
  children,
  rootMargin = '200px 0px',
  minHeight: _minHeight,
  className,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip animation when prefers-reduced-motion is on
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      startTransition(() => setAnimated(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={`lazy-section-fallback ${className ?? ''}`.trim()}
      style={{
        opacity: animated ? 1 : 0,
        transform: animated ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      }}
    >
      <noscript>
        <style>{`.lazy-section-fallback { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>
      {children}
    </div>
  );
}
