import { useSyncExternalStore } from 'react';

/**
 * SSR-safe hook for `(prefers-reduced-motion: reduce)`.
 * Returns `false` during SSR (animations enabled by default for the static markup),
 * then re-evaluates on the client to respect the user's accessibility preference.
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
