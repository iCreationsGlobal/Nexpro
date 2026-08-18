/**
 * Ayebia — ABS business intelligence assistant
 * Product name and empty-state welcome (aligned with Frontend/src/constants/ibis.js).
 */
export const IBIS_NAME = 'Ayebia';
export const IBIS_ASK_LABEL = 'Ask Ayebia';
export const IBIS_WELCOME_GREETING =
  "Hi — I'm Ayebia. What would you like to check in the business?";
export const IBIS_WELCOME_SUBCOPY =
  'You can ask me about your sales, customers, invoices, expenses, or anything about your business.';

/** Rewrite leftover iBIS self-introductions in assistant replies. */
export function sanitizeAssistantDisplayName(text: unknown): string {
  return String(text || '').replace(/\biBIS\b/gi, IBIS_NAME);
}
