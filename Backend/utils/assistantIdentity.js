/**
 * User-facing assistant name. Internal IBIS_* keys and file names stay as-is.
 */
const ASSISTANT_DISPLAY_NAME = 'Ayebia';

/** Appended to chat system prompts so the model does not introduce itself as iBIS. */
const ASSISTANT_IDENTITY_RULES =
  `If you introduce yourself, say only "I'm ${ASSISTANT_DISPLAY_NAME}." Never call yourself iBIS or IBIS.`;

/**
 * Rewrite leftover iBIS self-introductions in model output.
 * @param {unknown} text
 * @returns {string}
 */
function sanitizeAssistantDisplayName(text) {
  return String(text || '').replace(/\biBIS\b/gi, ASSISTANT_DISPLAY_NAME);
}

module.exports = {
  ASSISTANT_DISPLAY_NAME,
  ASSISTANT_IDENTITY_RULES,
  sanitizeAssistantDisplayName,
};
