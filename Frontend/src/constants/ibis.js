/**
 * Ayebia — ABS business intelligence assistant
 * Product name for Ask AI / floating assistant across web and docs.
 */
export const IBIS_NAME = 'Ayebia';
export const IBIS_FULL_NAME = 'Ayebia';
export const IBIS_ASK_LABEL = 'Ask Ayebia';
export const IBIS_SHORT_TAGLINE = 'Business insights for your workspace';

/** Empty-state / first-load welcome (Ask Ayebia page and floating panel). */
export const IBIS_WELCOME_GREETING =
  "Hi — I'm Ayebia. What would you like to check in the business?";
export const IBIS_WELCOME_SUBCOPY =
  'You can ask me about your sales, customers, invoices, expenses, or anything about your business.';

/**
 * Rewrite leftover iBIS self-introductions in assistant replies (Copy / PDF / chat).
 * @param {unknown} text
 * @returns {string}
 */
export function sanitizeAssistantDisplayName(text) {
  return String(text || '').replace(/\biBIS\b/gi, IBIS_NAME);
}
