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
  "Hi 👋 I'm Ayebia, your business intelligence assistant.";
export const IBIS_WELCOME_SUBCOPY =
  "I'm here to help you understand and manage your business with ABS. You can ask me about your sales, customers, debts, expenses, jobs, reports, or even ask me to draft a message.";

/**
 * Rewrite leftover iBIS self-introductions in assistant replies (Copy / PDF / chat).
 * @param {unknown} text
 * @returns {string}
 */
export function sanitizeAssistantDisplayName(text) {
  return String(text || '').replace(/\biBIS\b/gi, IBIS_NAME);
}
