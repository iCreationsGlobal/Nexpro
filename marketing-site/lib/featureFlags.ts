/**
 * Marketing / subscription pricing UI visibility.
 * Off by default — set NEXT_PUBLIC_SHOW_PRICING=true (or 1) to show again.
 */
export const SHOW_PRICING =
  process.env.NEXT_PUBLIC_SHOW_PRICING === 'true' ||
  process.env.NEXT_PUBLIC_SHOW_PRICING === '1';
