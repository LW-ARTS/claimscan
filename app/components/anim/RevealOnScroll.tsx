'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealOnScrollProps {
  children: ReactNode;
  /** Fraction of element visible to trigger (0–1). Defaults to 0.3. */
  amount?: number;
  className?: string;
}

/**
 * One-shot scroll reveal. Adds `is-visible` class when the element is
 * `amount` fraction visible. Disconnects after first trigger.
 * Respects prefers-reduced-motion (renders visible immediately).
 * Server-rendered as `.reveal` (hidden); class swap happens after hydration.
 */
export function RevealOnScroll({ children, amount = 0.3, className }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true); // eslint-disable-line react-hooks/set-state-in-effect -- a11y guard
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: amount },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [amount]);

  return (
    <div ref={ref} className={`reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
