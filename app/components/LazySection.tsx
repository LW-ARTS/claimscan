'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';

interface LazySectionProps {
  children: ReactNode;
  /** Vertical margin around the root element for early triggering */
  rootMargin?: string;
  /** Minimum height placeholder before content loads */
  minHeight?: number;
  className?: string;
}

/**
 * Renders children only when the section scrolls into (or near) the viewport.
 * Uses IntersectionObserver for zero-cost idle detection.
 * Once visible, the observer disconnects — content stays mounted permanently.
 */
export function LazySection({
  children,
  rootMargin = '200px 0px',
  minHeight = 120,
  className,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip IntersectionObserver when prefers-reduced-motion is on
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        children
      ) : (
        <div
          style={{ minHeight }}
          className="animate-pulse rounded-xl bg-foreground/[0.03]"
          aria-hidden
        />
      )}
    </div>
  );
}
