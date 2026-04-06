'use client';

import { useEffect } from 'react';

/**
 * Mount-once client component. Finds all `[data-reveal]` elements on the page
 * and adds `is-visible` when each scrolls into view (one-shot, 30% threshold).
 *
 * Pair with `.reveal` CSS class on the elements. Useful for static server-rendered
 * pages (docs, terms) where wrapping each section in a client component would be noisy.
 */
export function RevealMount() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (targets.length === 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const el of targets) el.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );

    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return null;
}
