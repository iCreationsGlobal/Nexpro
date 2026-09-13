/**
 * Touch-target sizing tokens. ABS is used at a sales counter mid-transaction,
 * often on budget devices and imprecise touch conditions — treat these as
 * the app-wide floor, not just the platform minimums (44pt iOS / 48dp Android).
 */
export const TOUCH_TARGET = {
  /** Floor for icon-only "quiet" actions: back, clear, remove, steppers. */
  compact: 44,
  /** Default for text inputs and secondary/outline/text-link buttons. */
  standard: 48,
  /** Highest-frequency or highest-stakes actions: checkout, primary detail actions. */
  comfortable: 52,
} as const;

export const RADIUS = { sm: 8, md: 10, lg: 12, pill: 999 } as const;

/** 1px hairlines render near-invisible on some budget Android panels. */
export const BORDER_WIDTH = { hairline: 1, standard: 1.5 } as const;
