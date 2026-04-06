/**
 * Animation tokens — single source of truth.
 * Mirrors the CSS custom properties in app/globals.css.
 *
 * Aesthetic: "Industrial Precision" — crisp, fast, mechanical.
 * Easing curves come from Emil Kowalski's animation philosophy.
 */

export const EASE = {
  /** Strong ease-out — instant feedback, sharp settle. Use for entrances, dropdowns, popovers. */
  sharp: [0.23, 1, 0.32, 1] as const,
  /** Strong ease-in-out — for movement on screen (tab transitions, layout shifts). */
  inOut: [0.77, 0, 0.175, 1] as const,
  /** Soft material ease — hover states only. */
  soft: [0.4, 0, 0.2, 1] as const,
  /** Linear — only for marquee and count-up interpolation. */
  linear: 'linear' as const,
} as const;

export const DURATION = {
  /** Hover, focus ring, press feedback. */
  micro: 0.12,
  /** Tab change, badge transition, dropdown open. */
  fast: 0.2,
  /** Standard entrance, dropdown panels. */
  base: 0.3,
  /** Scroll reveal — slower so it feels deliberate during scroll. */
  slow: 0.5,
  /** Count-up duration — long enough to register, short enough to not annoy. */
  count: 1.6,
} as const;

export const STAGGER = {
  /** 40ms — list items (rows, pills). */
  tight: 0.04,
  /** 60ms — grid cards. */
  base: 0.06,
} as const;
