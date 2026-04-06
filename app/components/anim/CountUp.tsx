'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { DURATION, EASE } from './tokens';

interface CountUpProps {
  value: number;
  format: (n: number) => string;
  className?: string;
}

/**
 * Counts from 0 to `value` when the element scrolls into view.
 *
 * Text updates are written imperatively to the DOM via `textContent`
 * (subscribed through `useMotionValueEvent`), which means zero React
 * re-renders during the 1.6s animation.
 *
 * Uses `tabular-nums` (applied by the caller) to prevent layout shift.
 * Respects `prefers-reduced-motion` and skips the animation when the
 * tab is hidden at trigger time.
 */
export default function CountUp({ value, format, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(0);

  // Imperatively update the text node on each motion frame — no React reconcile.
  // The formatter decides its own rounding so USD values keep their cents.
  useMotionValueEvent(motionValue, 'change', (latest) => {
    if (ref.current) ref.current.textContent = format(latest);
  });

  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      return;
    }
    if (!inView) return;
    if (typeof document !== 'undefined' && document.hidden) {
      motionValue.set(value);
      return;
    }
    // Start from 0 explicitly every time we begin a new animation so the
    // text node visibly counts up rather than jumping to the latest cached value.
    motionValue.set(0);
    const controls = animate(motionValue, value, {
      duration: DURATION.count,
      ease: EASE.sharp as never,
    });
    return () => controls.stop();
  }, [inView, value, reduced, motionValue]);

  // Render the final formatted value for SSR / first paint / reduced-motion.
  // Once the animation starts, imperative textContent updates take over.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
