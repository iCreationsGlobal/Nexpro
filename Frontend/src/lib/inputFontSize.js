/** Caller already picked a font size (e.g. POS amount fields) — keep it on every screen. */
const HAS_FONT_SIZE_CLASS = /(?:^|\s)(?:[\w-]+:)*text-(?:xs|sm|base|lg|[2-9]?xl|\[\d)/;

/**
 * Default text size for text fields: 16px on phones and tablets so iOS does not zoom into the
 * field on focus, 14px with the sidebar layout. Skipped when the caller sets its own size.
 * @param {string} [className]
 * @returns {string}
 */
export const inputFontSizeClass = (className) =>
  HAS_FONT_SIZE_CLASS.test(className || '') ? '' : 'text-base desk:text-sm';
