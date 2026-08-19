/**
 * Ayebia — ABS business intelligence assistant
 * Product name and empty-state welcome (aligned with Frontend/src/constants/ibis.js).
 */
export const IBIS_NAME = 'Ayebia';
export const IBIS_ASK_LABEL = 'Ask Ayebia';
export const IBIS_WELCOME_GREETING =
  "Hi 👋 I'm Ayebia, your business intelligence assistant.";
export const IBIS_WELCOME_SUBCOPY =
  "I'm here to help you understand and manage your business with ABS. You can ask me about your sales, customers, debts, expenses, jobs, reports, or even ask me to draft a message.";

/** Rewrite leftover iBIS self-introductions in assistant replies. */
export function sanitizeAssistantDisplayName(text: unknown): string {
  return String(text || '').replace(/\biBIS\b/gi, IBIS_NAME);
}
